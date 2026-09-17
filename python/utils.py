import html
import re
import sys
import re

def extract_parameters(raw_text):
    """
    Extracts parameter key-value pairs from the raw text, typically from the optional prompt file.
    Returns a dictionary of parameters and the text with parameter definitions removed.
    """
    parameters = {}
    cleaned_lines = []
    
    param_pattern = re.compile(r'^\s*(?:-?\s*|@)(\w+)\s*(?:here\s+@\w+\s+value\s+is)?\s*[:=]?\s*(.+)$', re.IGNORECASE)

    for line in raw_text.split('\n'):
        match = param_pattern.match(line.strip())
        if match:
            param_name = match.group(1).strip()
            param_value = match.group(2).strip()
            
            if "value is" in param_value.lower():
                param_value = param_value.split("value is", 1)[1].strip()
            
            param_value = re.sub(r'[.,;]$', '', param_value).strip()
            param_value = param_value.strip("() ")

            parameters[param_name] = param_value
        else:
            cleaned_lines.append(line)
            
    return parameters, "\n".join(cleaned_lines).strip()

def parse_test_cases(gpt_output):
    """
    Parses the GPT output based on the structured format.
    """
    test_cases = []
    parts = gpt_output.split("###")
    summary_match = re.search(r"PBI Test Cases Summary:(.*?)(?=\nTest Case Title:)", parts[0], re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else "Test cases generated based on product backlog item acceptance criteria."

    for part in parts[1:]:
        part = part.strip()
        if not part:
            continue
            
        lines = part.split("\n")
        title_line = lines[0]
        title_match = re.search(r"Test Case Title:\s*(.*)", title_line, re.IGNORECASE)
        title = title_match.group(1).strip() if title_match else "Untitled Test Case"

        steps_content = "\n".join(lines[1:]).strip()
        
        if title:
            test_cases.append({
                "title": title,
                "steps": steps_content
            })

    return test_cases, summary

def format_html_text(raw_html_text):
    """
    Cleans up HTML content from ADO into a more readable format for the AI prompt.
    """
    if not raw_html_text:
        return ""

    temp_text = raw_html_text.replace("<p>", "").replace("</p>", "\n")
    temp_text = re.sub(r'<div[^>]*>', '\n', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'</div[^>]*>', '\n', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'<br[^>]*>', '\n', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'<ul[^>]*>', '\n', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'</ul[^>]*>', '', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'<ol[^>]*>', '\n', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'</ol[^>]*>', '', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'<li[^>]*>', '\n* ', temp_text, flags=re.IGNORECASE)
    temp_text = re.sub(r'</li[^>]*>', '', temp_text, flags=re.IGNORECASE)

    cleaned_text = re.sub(r'<[^>]+>', '', temp_text)
    cleaned_text = re.sub(r'\n\s*\n+', '\n\n', cleaned_text).strip() 
    
    cleaned_lines = [line.strip() for line in cleaned_text.split('\n')]
    cleaned_text = '\n'.join(filter(None, cleaned_lines))

    cleaned_text = re.sub(r'[ \t]+', ' ', cleaned_text)

    return cleaned_text.strip()