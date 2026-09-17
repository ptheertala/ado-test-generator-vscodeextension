import sys
import os
import argparse
import json
from pathlib import Path
import re
import requests # Added this import to resolve NameError

# --- Import refactored functions ---
from ado_api import setup_sessions, get_pbi_details, create_test_case_in_ado, attach_test_case_to_pbi
from openai_api import generate_tests_with_gpt, generate_test_prompt, download_and_encode_image, encode_image_from_path
from utils import extract_parameters, parse_test_cases, format_html_text

# --- FIX: Ensure stdout and stderr use UTF-8 for proper character display ---
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
if sys.stderr.encoding != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)
# --- END FIX ---

def clean_steps(steps: list[str]) -> list[str]:
    """
    Remove unwanted placeholder lines like 'Steps:', 'Test Steps:', '1. Steps:' etc.
    Only applies to step content inside each test case.
    """
    cleaned = []
    for step in steps:
        s = step.strip()
        # Match "Steps:", "Test Steps:", or numbered "1. Steps:"
        if re.match(r'^(steps:?|test steps:?|\d+\.\s*steps:?$)', s, re.IGNORECASE):
            continue  # skip these lines
        cleaned.append(step)
    return cleaned


def generate_and_parse_tests(session, config, pbi_id, raw_optional_prompt_text="", screenshot_files=[]):
    """
    Generates tests based on PBI content and returns a list of test cases.
    """
    print(f"\n📝 Initiating test case generation for PBI #{pbi_id}...", file=sys.stderr)

    pbi_content_to_print = ""

    try:
        pbi = get_pbi_details(session, config, pbi_id)
        print(f"\nRetrieved details for PBI #{pbi['id']}: '{pbi['title']}'", file=sys.stderr)

        if pbi['acceptance']:
            pbi_content_to_print = format_html_text(pbi['acceptance'])
        elif pbi['description']:
            pbi_content_to_print = format_html_text(pbi['description'])

    except requests.exceptions.RequestException:
        print(f"Error: Failed to retrieve PBI details for #{pbi_id}. Aborting.", file=sys.stderr)
        return None, None, None

    parameters, cleaned_optional_prompt_for_ai = extract_parameters(raw_optional_prompt_text)
    if parameters:
        print("Parameters extracted from optional prompt:", parameters, file=sys.stderr)

    encoded_screenshots = []
    print(f"\nAttempting to process {len(screenshot_files)} screenshots from config/arguments...", file=sys.stderr)
    if not screenshot_files:
        print("No local screenshots specified in config/arguments.", file=sys.stderr)

    for s_file in screenshot_files:
        print(f"Read local screenshot: {s_file}. Compressing and encoding...", file=sys.stderr)
        base64_img = encode_image_from_path(s_file)
        if base64_img:
            encoded_screenshots.append(base64_img)
    print(f"Finished processing local screenshots. Successfully encoded {len(encoded_screenshots)} new images.", file=sys.stderr)

    print(f"\nAttempting to process {len(pbi['screenshots'])} screenshots attached to PBI #{pbi_id}...", file=sys.stderr)
    if not pbi['screenshots']:
        print(f"No screenshots attached directly to PBI #{pbi_id}.", file=sys.stderr)

    initial_encoded_count = len(encoded_screenshots)
    if pbi['screenshots']:
        for screenshot_url in pbi['screenshots']:
            base64_img = download_and_encode_image(session, screenshot_url)
            if base64_img:
                encoded_screenshots.append(base64_img)
    print(f"Finished processing PBI-attached screenshots. Successfully encoded {len(encoded_screenshots) - initial_encoded_count} new images from PBI attachments.", file=sys.stderr)

    print("\n🧠 Generating test cases using Azure OpenAI...", file=sys.stderr)
    try:
        prompt = generate_test_prompt(pbi, dynamic_instructions_for_ai=cleaned_optional_prompt_for_ai)
        gpt_output = generate_tests_with_gpt(config, prompt, screenshots=encoded_screenshots)
        print("\n✅ Test case generation completed successfully.", file=sys.stderr)
    except requests.exceptions.RequestException:
        return None, None, None

    exported_test_cases, summary_description = parse_test_cases(gpt_output)

    if not exported_test_cases:
        print("No test cases were parsed from the AI output. Please check the AI's response format.", file=sys.stderr)
        return None, None, None

    # Clean up any literal "Steps." lines that the AI might have generated
    for test_case in exported_test_cases:
        if "steps" in test_case and test_case["steps"]:
        # Split by lines if it's a single string, otherwise assume it's already a list
            if isinstance(test_case["steps"], str):
                step_lines = test_case["steps"].splitlines()
            else:
                step_lines = test_case["steps"]
        test_case["steps"] = clean_steps(step_lines)

    return exported_test_cases, summary_description, parameters

def push_tests_to_ado(session, config, pbi_id, test_cases_json, target_suite_id):
    """
    Pushes test cases from a JSON string to Azure DevOps and links them to PBI and Test Suite.
    Handles both same-project and cross-project setups automatically.
    """
    try:
        test_cases = json.loads(test_cases_json)
    except json.JSONDecodeError:
        print("Error: Invalid JSON provided for pushing test cases.", file=sys.stderr)
        return

    print(f"\n🚀 Publishing {len(test_cases)} AI-generated test cases to Azure DevOps...", file=sys.stderr)

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] Pushing Test Case: '{test_case['title']}'", file=sys.stderr)
        try:
            # Step 1: Create the test case in the Test Project
            test_case_id = create_test_case_in_ado(
                session,
                config,
                test_case['title'],
                test_case['steps'],
                test_case.get('parameters', {}),
                test_case.get('summary', "")
            )

            # Step 2: Link the test case to the PBI (works cross-project)
            attach_test_case_to_pbi(session, config, pbi_id, test_case_id)

            # Step 3: Add the test case to the target Test Suite using POST
            suite_url = (
                f"{config['ado_org']}/{config['ado_project_test']}/_apis/test/plans/"
                f"{config['test_plan_id']}/suites/{target_suite_id}/testcases/{test_case_id}?api-version=7.0"
            )
            body = {"testCase": {"id": test_case_id}}
            headers = {**session.headers, "Content-Type": "application/json"}
            response = session.post(suite_url, headers=headers, json=body)
            response.raise_for_status()

            print(f"🔗 Successfully added Test Case #{test_case_id} to Test Suite #{target_suite_id}.", file=sys.stderr)

        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error for '{test_case['title']}': {e}. Response: {response.text}", file=sys.stderr)
            continue
        except requests.exceptions.RequestException as e:
            print(f"Network/Request Error for '{test_case['title']}': {e}", file=sys.stderr)
            continue

    print("\n✅ All test cases successfully published to Azure DevOps.", file=sys.stderr)


def main():
    """
    Main function to orchestrate the entire process, handling two distinct modes:
    'generate' (for AI generation) and 'push' (for pushing edited tests).
    """
    parser = argparse.ArgumentParser(description="Generate and push test cases to Azure DevOps.")
    parser.add_argument("command", choices=['generate', 'push'], help="The command to execute: 'generate' or 'push'.")
    parser.add_argument("pbi_id", type=int, help="The PBI ID.")
    parser.add_argument("--prompt", "-p", type=str, default="", help="Optional text or path to a file containing additional instructions for the AI.")
    parser.add_argument("--screenshots", "-s", nargs='*', default=[], help="Path(s) to local screenshot files to include.")
    parser.add_argument("--test_cases_json", type=str, default="[]", help="JSON string of test cases to push. Required for 'push' command.")
    parser.add_argument("--ado_org", type=str, required=True, help="Azure DevOps Organization URL")
    parser.add_argument("--ado_project", type=str, required=True, help="Azure DevOps Project Name")
    parser.add_argument("--ado_project_pbi", type=str, default=None, help="Azure DevOps Project Name for PBI (defaults to ado_project)")
    parser.add_argument("--ado_project_test", type=str, default=None, help="Azure DevOps Project Name for Test Cases (defaults to ado_project)")
    parser.add_argument("--ado_area_path", type=str, required=True, help="Azure DevOps Area Path")
    parser.add_argument("--ado_iteration_path", type=str, required=True, help="Azure DevOps Iteration Path")
    parser.add_argument("--ado_pat", type=str, required=True, help="Azure DevOps Personal Access Token")
    parser.add_argument("--test_plan_id", type=int, required=True, help="Azure DevOps Test Plan ID")
    parser.add_argument("--target_test_suite_id", type=int, required=True, help="Azure DevOps Test Suite ID")
    parser.add_argument("--openai_endpoint", type=str, required=True, help="Azure OpenAI Endpoint")
    parser.add_argument("--openai_api_key", type=str, required=True, help="Azure OpenAI API Key")
    parser.add_argument("--deployment_name", type=str, required=True, help="Azure OpenAI Deployment Name")
    parser.add_argument("--api_version", type=str, required=True, help="Azure OpenAI API Version")

    args = parser.parse_args()

    # Construct a single config dictionary from the command-line arguments
    config = {
        "ado_org": args.ado_org,
        "ado_project": args.ado_project,
        "ado_project_pbi": args.ado_project_pbi if args.ado_project_pbi else args.ado_project,
        "ado_project_test": args.ado_project_test if args.ado_project_test else args.ado_project,
        "ado_area_path": args.ado_area_path,
        "ado_iteration_path": args.ado_iteration_path,
        "ado_pat": args.ado_pat,
        "test_plan_id": args.test_plan_id,
        "target_test_suite_id": args.target_test_suite_id,
        "openai_endpoint": args.openai_endpoint,
        "openai_api_key": args.openai_api_key,
        "deployment_name": args.deployment_name,
        "api_version": args.api_version
    }

    session = setup_sessions(config)

    # --- FIX: Read prompt content from file if it exists, otherwise use the string directly ---
    optional_prompt_content = args.prompt
    if optional_prompt_content and os.path.exists(optional_prompt_content) and os.path.isfile(optional_prompt_content):
        with open(optional_prompt_content, 'r', encoding='utf-8') as f:
            optional_prompt_content = f.read()
    # --- END FIX ---


    if args.command == 'generate':
        exported_test_cases, summary_description, parameters = generate_and_parse_tests(
            session, config, args.pbi_id, optional_prompt_content, args.screenshots
        )
        # Retrieve and format PBI content for acceptanceCriteria
        try:
            pbi = get_pbi_details(session, config, args.pbi_id)
            if pbi['acceptance']:
                pbi_content_to_print = format_html_text(pbi['acceptance'])
            elif pbi['description']:
                pbi_content_to_print = format_html_text(pbi['description'])
            else:
                pbi_content_to_print = ""
        except Exception:
            pbi_content_to_print = ""

        if exported_test_cases:
    # Clean up any literal "Steps:" lines that the AI might have generated
            for test_case in exported_test_cases:
                if 'steps' in test_case and test_case['steps']:
            # Only split if steps is a string
                    if isinstance(test_case['steps'], str):
                        step_lines = test_case['steps'].splitlines()
                    else:
                        step_lines = test_case['steps']  # already a list
            test_case['steps'] = clean_steps(step_lines)

    # Print the generated test cases as a single JSON object for the extension to capture
        output_data = {
        "testCases": [
            {
                "title": case["title"],
                "steps": case["steps"],  # now already a list
                "summary": summary_description,
                "parameters": parameters,
            }
            for case in exported_test_cases
            ],
            "acceptanceCriteria": pbi_content_to_print.splitlines()
        }
        print(json.dumps(output_data))

    elif args.command == 'push':
        push_tests_to_ado(session, config, args.pbi_id, args.test_cases_json, args.target_test_suite_id)

if __name__ == "__main__":
    main()