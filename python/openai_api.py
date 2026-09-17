import requests
import base64
from io import BytesIO
from PIL import Image
import re

def compress_and_encode_image(image_bytes, max_size=(1024, 1024), quality=85):
    """
    Resizes and compresses an image from bytes, then encodes it as a base64 string.
    """
    try:
        image = Image.open(BytesIO(image_bytes))

        if image.mode in ('RGBA', 'P'):
            image = image.convert('RGB')

        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        buffered = BytesIO()
        image.save(buffered, format="JPEG", quality=quality)
        
        base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return f"data:image/jpeg;base64,{base64_image}"
    except Exception as e:
        print(f"Warning: Could not process image. Error: {e}")
        return None

def download_and_encode_image(session, image_url):
    """
    Downloads an image from a URL, compresses it, and encodes it as a base64 string.
    """
    try:
        response = session.get(image_url, auth=session.auth)
        response.raise_for_status()
        
        print(f"Downloaded image from {image_url}. Compressing and encoding...")
        return compress_and_encode_image(response.content)
        
    except requests.exceptions.RequestException as e:
        print(f"Warning: Could not download image from {image_url}. Error: {e}")
        return None
        
def encode_image_from_path(image_path):
    """
    Encodes an image file from a local path to a base64 string after compression.
    """
    try:
        with open(image_path, "rb") as image_file:
            print(f"Read local screenshot: {image_path}. Compressing and encoding...")
            return compress_and_encode_image(image_file.read())
    except FileNotFoundError:
        print(f"Warning: Screenshot file not found: {image_path}. Skipping.")
        return None

def generate_test_prompt(pbi, dynamic_instructions_for_ai=""):
    """
    Generates a natural language prompt for the GPT model with an emphasis on detailed, atomic steps.
    """
    # Your long, detailed prompt template goes here
    # (The existing prompt text is too long to paste again, but it should be moved here)
    prompt_sections = [
    "**Mandatory Instructions for Test Case Generation (Prioritize Quality & Coverage):**",
    "1.  **PBI Test Cases Summary:**",
    "    * Start your response with the heading \"**PBI Test Cases Summary:**\" followed by a single, concise paragraph that summarizes the scope of the generated test cases.",
    "    * Example: `PBI Test Cases Summary: These test cases cover various functionalities and validations associated with the Email Management component in the user's profile settings, ensuring comprehensive testing of the system's behavior under different conditions.`",
    "2.  **Test Case Titles:**",
    "    * Each test case must have a unique title, start with an action verb (e.g., \"Verify\", \"Validate\", \"Ensure\"), and clearly state the scenario being tested.",
    "    * Include key differentiating factors directly in the title (e.g., \"with multiple entries\", \"invalid format\").",
    "3.  **Test Step Phrasing (CRITICAL - Natural Language & Detailed Actions):**",
    "    * **CRITICAL:** Do NOT use phrases that refer to previous steps, such as 'as described above' or 'continue from the last step.' Every test case must be completely self-contained and stand-alone.",
    "    * **Each test step must represent a single, atomic action.** Do not merge multiple actions into one step, except for login. For example, instead of 'Navigate to the Account page and click Edit Profile,' use two steps: '1. Navigate to the Account page.' and '2. Click the 'Edit Profile' button.'",
    "    * **Prerequisite Steps:** For each test case, include a concise prerequisite step that describes the necessary initial state, derived directly from the test case title and the PBI’s description. This step should not require detailed, step-by-step instructions unless the action is a repeatable sequence—as such as login—in which case, provide the full, detailed steps. Examples of prerequisites include ensuring a specific item exists, a particular limit has been reached (e.g., \"The user has 4 phone numbers already saved.\"), or an initial condition is met (e.g., \"The user has an active subscription.\").",
    "    * **Login & Navigation:** For login, write a **single, clear, and detailed step** that combines navigation and login. **DO NOT** break it into separate steps. For example:",
    "        `1. Navigate to @Url and log in with @Username and @Password. Expected Result: The user is successfully logged in and redirected to the appropriate landing page based on the PBI's scope.`",
    "    * **Expected Results:** For *every single step*, the `Expected Result:` must be highly precise and verifiable. Describe the exact visual outcome, data state change, or specific content displayed. **Do not include verification of page content in the login step's expected result.** That verification should be in a separate, subsequent step.",
    "4.  **Comprehensive Coverage (Happy Path, Negative, Boundary):**",
    "    * **CRITICAL:** Explicitly map at least one test case to each clause of the provided Acceptance Criteria. This ensures every stated requirement is directly validated.",
    "    * Generate test cases for happy path, negative testing (invalid inputs), and boundary conditions (e.g., min/max limits). For boundary conditions, include tests for the minimum, maximum, and one value just outside each boundary (e.g., `min-1`, `min`, `max`, `max+1`).",
    "    * Include test cases that validate data integrity and persistence. For example, after an action is completed and a user logs out and back in, the data should remain as expected.",
    "    * Ensure every distinct point or implied requirement is covered. **Identify and create test cases for subtle edge cases** not explicitly listed, such as concurrent actions, race conditions, or interactions with other system components implied by the PBI.",
    "    * **CRITICAL: Only generate test cases that are directly relevant to the PBI Acceptance Criteria. Do not invent new scenarios or components unless they are explicitly in the provided context.**",
    "5.  **Parameter Usage in Steps (CRITICAL):**",
    "    * For steps involving URLs and credentials, **ALWAYS** use the placeholders `@Url`, `@Username`, and `@Password`.",
    "    * **DO NOT** include any parameter values or a \"Parameters:\" section in your output. The script will handle parameter values separately in Azure DevOps' native parameter table.",
    "6.  **Final Output Format (CRITICAL):**",
    "    * Your response must start with the `PBI Test Cases Summary: ` heading.",
    "    * After the summary, each test case must be separated by `###` on a new line.",
    "    * The format for each test case must be:",
    "        `Test Case Title: <A concise, unique title>`",
    "         `Steps:`",
    "         `1. <Action step>. Expected Result: <Precise, verifiable outcome>.`",
    "         `2. <Next action step>. Expected Result: <Precise, verifiable outcome>.`",
    "         `...`",
    "     * **DO NOT** add any concluding remarks or extra text after the final test case."
]

    full_prompt_parts = [
        "You are a highly efficient, meticulous, and experienced QA Engineer specializing in comprehensive test case design."
    ]

    if dynamic_instructions_for_ai:
        full_prompt_parts.append(f"\n**CRITICAL: Your primary task is to generate test cases ONLY for the components and pages mentioned in the following dynamic instructions. IGNORE all other details in the PBI description if they are not relevant to these specific components.**\n\n{dynamic_instructions_for_ai}\n")

    full_prompt_parts.extend([
        f"\n**PBI Details (secondary context):**",
        f"PBI TITLE: {pbi['title']}",
        f"PBI DESCRIPTION:\n{pbi['description']}",
        f"ACCEPTANCE CRITERIA:\n{pbi['acceptance']}",
        "\n" + "\n".join(prompt_sections)
    ])
    
    return "\n".join(full_prompt_parts)

def generate_tests_with_gpt(config, prompt, screenshots=[]):
    """
    Calls Azure OpenAI GPT service to generate test cases based on the provided prompt and images.
    """
    url = f"{config['openai_endpoint']}/openai/deployments/{config['deployment_name']}/chat/completions?api-version={config['api_version']}"
    
    messages = [
        {"role": "system", "content": "You are a QA engineer who writes clear and efficient test cases in simple English. You must follow all formatting rules."},
    ]

    content = [
        {"type": "text", "text": prompt}
    ]
    
    for screenshot in screenshots:
        if screenshot and isinstance(screenshot, str):
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": screenshot
                }
            })
    
    messages.append({
        "role": "user",
        "content": content
    })

    data = {
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4000
    }
    
    try:
        openai_headers = {"api-key": config["openai_api_key"], "Content-Type": "application/json"}
        response = requests.post(url, headers=openai_headers, json=data)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']
    except requests.exceptions.RequestException as e:
        print(f"Error communicating with Azure OpenAI. Check AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, or network. Error: {e}")
        raise