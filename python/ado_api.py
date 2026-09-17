import requests
import html
import re
import json
import time

def setup_sessions(config):
    """
    Sets up a requests session for Azure DevOps API calls.
    """
    session = requests.Session()
    session.auth = ('', config["ado_pat"])
    session.headers.update({"Content-Type": "application/json"})
    return session

def get_pbi_details(session, config, pbi_id):
    """
    Fetches details of a specified Product Backlog Item (PBI) from Azure DevOps.
    """
    url = f"{config['ado_org']}/{config['ado_project_pbi']}/_apis/wit/workitems/{pbi_id}?$expand=all&api-version=7.0"
    try:
        response = session.get(url)
        response.raise_for_status()
        item = response.json()

        screenshots = []
        relations = item.get("relations", [])
        for relation in relations:
            if relation.get("rel") == "AttachedFile":
                screenshots.append(relation["url"])

        return {
            'id': item['id'],
            'title': item['fields'].get('System.Title'),
            'description': item['fields'].get('System.Description', ''),
            'acceptance': item['fields'].get('Microsoft.VSTS.Common.AcceptanceCriteria', ''),
            'screenshots': screenshots
        }
    except requests.exceptions.RequestException as e:
        print(f"Error retrieving PBI {pbi_id}. Check ID, PAT, or network connectivity. Error: {e}")
        raise

def create_test_case_in_ado(session, config, title, steps_list, parameters, summary_description, max_retries=3, initial_delay=2):
    """
    Creates a new test case in Azure DevOps with retry logic, including parameters.
    """
    steps_html_parts = []
    for i, step in enumerate(steps_list, 1):
        if isinstance(step, dict):  # Structured steps from Preview UI
            action_text = step.get("action", "").strip()
            expected_text = step.get("expectedResult", "").strip()
        else:  # Fallback for old string-based steps
            step_text = str(step)
            action_text = step_text.strip().replace(f"{i}.", "").strip()
            expected_text = ""
            if "Expected Result:" in action_text:
                parts = action_text.split("Expected Result:", 1)
                action_text = parts[0].strip()
                expected_text = parts[1].strip()

        # Clean expected text
        expected_text = re.sub(r'[-*#`\s]+$', '', expected_text).strip()

        steps_html_parts.append(
            f"<step id='{i}' type='ActionStep'>"
            f"<parameterizedString>{html.escape(action_text)}</parameterizedString>"
            f"<parameterizedString isExpected='true'>{html.escape(expected_text)}</parameterizedString>"
            f"</step>"
        )

    steps_html = "<steps id='0'>" + "".join(steps_html_parts) + "</steps>"

    param_definitions = [{'name': p} for p in parameters.keys()]
    param_values_list = [list(parameters.values())]

    parameter_data_json = json.dumps({
        'parameterDefinitions': param_definitions,
        'parameterValues': param_values_list
    })

    url = f"{config['ado_org']}/{config['ado_project_test']}/_apis/wit/workitems/$Test%20Case?api-version=7.0"
    description_value = summary_description if summary_description.strip() else "See steps below for testing details."

    body = [
        {"op": "add", "path": "/fields/System.Title", "value": title},
        {"op": "add", "path": "/fields/System.AreaPath", "value": config['ado_area_path']},
        {"op": "add", "path": "/fields/System.IterationPath", "value": config['ado_iteration_path']},
        {"op": "add", "path": "/fields/System.Description", "value": description_value},
        {"op": "add", "path": "/fields/Microsoft.VSTS.TCM.Steps", "value": steps_html},
        {"op": "add", "path": "/fields/Microsoft.VSTS.TCM.Parameters", "value": parameter_data_json}
    ]

    for attempt in range(max_retries):
        try:
            response = session.patch(url, json=body, headers={"Content-Type": "application/json-patch+json"})
            response.raise_for_status()
            test_case_id = response.json()['id']
            print(f"✅ Created Test Case #{test_case_id} in Azure DevOps.")
            return test_case_id
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error for '{title}': {e}. Response: {response.text}")
            raise
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                print(f"Network/Request Error for '{title}': {e}. Retrying in {initial_delay * (2 ** attempt)} seconds...")
                time.sleep(initial_delay * (2 ** attempt))
            else:
                print(f"Failed to create test case '{title}' due to network/request error after {max_retries} attempts.")
                raise


def attach_test_case_to_pbi(session, config, pbi_id, test_case_id):
    """
    Links a test case to its parent PBI in Azure DevOps using a Tested By link.
    """
    url = f"{config['ado_org']}/{config['ado_project_pbi']}/_apis/wit/workitems/{pbi_id}?api-version=7.0"
    headers = {**session.headers, "Content-Type": "application/json-patch+json"}
    test_case_url = f"{config['ado_org']}/_apis/wit/workitems/{test_case_id}"

    body = [{
        "op": "add",
        "path": "/relations/-",
        "value": {
            "rel": "Microsoft.VSTS.Common.TestedBy-Forward", 
            "url": test_case_url,
            "attributes": {"comment": "Linked test case for PBI"}
        }
    }]
    try:
        response = session.patch(url, headers=headers, json=body)
        response.raise_for_status()
        print(f"🔗 Successfully linked Test Case #{test_case_id} to PBI #{pbi_id}.")
    except requests.exceptions.RequestException as e:
        print(f"Error linking test case #{test_case_id} to PBI #{pbi_id}. Error: {e}")
        raise