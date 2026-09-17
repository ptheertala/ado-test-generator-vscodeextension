  

# ADO Test Generator  

**AI-Powered Test Case Generation for Azure DevOps**  

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue)](https://code.visualstudio.com/)  

[![Python](https://img.shields.io/badge/Python-3.x-blue)](https://www.python.org/)  

[![Azure DevOps](https://img.shields.io/badge/Azure%20DevOps-Integration-blue)](https://azure.microsoft.com/en-us/services/devops/)  

---

## 🔹 Short Description

Generate **fully detailed, AI-powered test cases** directly in Azure DevOps from PBIs — all from inside Visual Studio Code.  

Supports **interactive human-in-the-loop review**, optional **screenshot-based context**, and **automatic Azure DevOps Test Suite integration**.

---

## 📖 Overview

The **ADO Test Generator** is a Visual Studio Code extension that transforms how you create and manage test cases in Azure DevOps.  

By integrating with **Azure OpenAI**, it intelligently generates comprehensive, actionable test cases from **Product Backlog Items (PBIs)**, optional AI prompts, and screenshots.  

This interactive workflow allows **human review and approval** before test cases are pushed to Azure DevOps, ensuring higher quality, accuracy, and confidence.

---

## 📊 Workflow Diagram

```

            ┌───────────────────────────┐
            │   Start in VS Code        │                            
            │ (Run ADO Test Generator)  │
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │   Fetch PBI Details from  │
            │   Azure DevOps (ID, Desc, │
            │   Acceptance Criteria)    │
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │   Add Context (Optional)  │
            │   - AI Prompt             │
            │   - Screenshots           │
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │   Send to Azure OpenAI    │
            │   for Test Case Generation│
            └─────────────┬─────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │ Human-in-the-Loop Review  │
            │ - Preview test cases      │
            │ - Edit titles & steps     │
            │ - Approve before push     │
            └─────────────┬─────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│ 🔄 Regenerate             │   │ ♻ Restore                │
│ - Generate new set        │   │ - Preserve edits/additions|
│ - Overwrite current cases │   │ - Reload saved version    │
└─────────────┬─────────────┘   └─────────────┬─────────────┘
              │                               │
              └─────────────┬─────────────────┘
                            ▼
            ┌───────────────────────────┐
            │ Push Approved Test Cases  │
            │ to Azure DevOps Test Plan │
            │ & Suite                   │
            └───────────────────────────┘


```

---

## ✨ Key Features

  
- **🤖 Intelligent Test Case Generation**  

  Analyzes PBI descriptions & acceptance criteria to produce **detailed, ready-to-use test cases**.


- **🧑‍💻 Human-in-the-Loop Review**  

  Preview, edit, and approve AI-generated test cases in a **dedicated VS Code panel** before pushing to Azure DevOps.


- **🔁 Managing Test Cases: Regenerate & Restore**  
  The interactive review panel provides two key functions to manage your test cases before pushing them to Azure DevOps: **Regenerate** and **Restore**.  

  - **🔄 Regenerate**  
    If the initial AI-generated test cases do not meet your quality standards, click **Regenerate**.  
    - Sends the same PBI data, context, and screenshots back to the AI model.  
    - Generates a new set of test cases.  
    - Overwrites the currently displayed tests, giving you a clean fresh start.  

  - **♻ Restore**  
   
    If you’ve made edits to the test cases and want to undo them, click **Restore**.  
    - Reload the **latest saved or modified version of the test cases** from the session.  
    - Preserve your manual edits and additions, instead of discarding them.  
    - Only fall back to the last AI-generated set if no session changes exist.  



- **⚡ Direct Azure DevOps Integration**  

  Push approved test cases directly to your PBIs in the specified **Test Plan & Suite**.

- **🖼 Contextual AI Enhancement**  

  Improve AI accuracy with optional **custom prompts** and **screenshots**.

---

## 🛠 Prerequisites

- **Visual Studio Code** `v1.80.0+`  
- **Python 3.x** installed and added to system **PATH**  
- **Azure DevOps** account with:  
  - Personal Access Token (PAT) with *Work Items: Read & Write* permissions  
- **Python libraries** (install by running the following in the **VS Code terminal**):  

  ```bash
  pip install -r requirements.txt
  ```
- **Azure OpenAI Service**:  

  - Access to deployed model (e.g., `gpt-4`, `gpt-4o`)  

  - API Key  

---

## 📥 Installation

This extension is not published to the VS Code Marketplace. Install it from the packaged `.vsix` file:

1. Build the package (or download a released `.vsix`):

   ```bash
   npm install
   npx @vscode/vsce package
   ```

2. Open **Visual Studio Code**.

3. Go to the **Extensions** view (`Ctrl+Shift+X` / `Cmd+Shift+X`).

4. Click the **`...`** menu → **Install from VSIX...** and select the generated file.

5. After installation, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to access commands:  

   - **`ADO: Generate & Push Test Cases for PBI (with Review)`**  

   - **`ADO: Reset Secrets`**  

---

## ⚙️ Configuration
 
Your API keys are securely stored and prompted for upon first use. All other configurations are managed in VS Code settings.
 
1. Open VS Code → Press:  

   `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)  

2. Select: **`ADO: Open Settings`**  

3. Fill in the required fields:

  

| Setting | Description |

|---|---|

| `adoTestGenerator.pythonPath` | Path to Python interpreter (e.g., `python3` or `C:\Python\python.exe`) |

| `adoTestGenerator.adoOrg` | Azure DevOps Organization URL |

| `adoTestGenerator.adoProject` | Azure DevOps Project Name |

| `adoTestGenerator.testPlanId` | Test Plan ID |

| `adoTestGenerator.targetTestSuiteId` | Default Test Suite ID |

| `adoTestGenerator.azureOpenAIEndpoint` | Azure OpenAI Endpoint URL |

| `adoTestGenerator.azureDeploymentName` | Deployed model name (e.g., `gpt-4o`) |

| `adoTestGenerator.azureApiVersion` | Azure OpenAI API Version (default: `2024-02-15-preview`) |

| *(Optional)* `adoTestGenerator.adoProjectPBI` | Alternate PBI project |

| *(Optional)* `adoTestGenerator.adoProjectTest` | Alternate Test Case project |

| *(Optional)* `adoTestGenerator.adoAreaPath` | Default Area Path |

| *(Optional)* `adoTestGenerator.adoIterationPath` | Default Iteration Path |


---
  
## 🚀 Quick Start

1. Run: **`ADO: Generate & Push Test Cases for PBI (with Review)`**  

2. Enter the **PBI ID** when prompted.  

3. Optionally provide **custom prompt** and **screenshot paths**.  

4. **Review and edit** the generated test cases in the interactive panel. 

5. Use **Regenerate** or **Restore** if needed.   

6. Click **Approve & Push** to create and link the test cases directly in Azure DevOps.
  
## 🛠 Troubleshooting

- **"Missing required setting"** → Open `ADO: Open Settings` and fill in all required fields.  

- **"Failed to start Python process"** → Ensure Python 3.x is installed and path is correctly set in `adoTestGenerator.pythonPath`.  

- **"Error retrieving PBI"** → Check PAT permissions, PBI ID, and network connectivity.