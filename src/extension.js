"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
let outputChannel;
function activate(context) {
    console.log('Congratulations, your extension "ado-test-generator" is now active!');
    outputChannel = vscode.window.createOutputChannel("ADO Test Generator Output");
    context.subscriptions.push(outputChannel);
    // Reusable function to get configuration from VS Code settings
    const getPythonConfigArgs = () => {
        const config = vscode.workspace.getConfiguration('adoTestGenerator');
        const adoOrg = config.get('adoOrg');
        const adoProject = config.get('adoProject');
        const adoProjectPBI = config.get('adoProjectPBI') || adoProject;
        const adoProjectTest = config.get('adoProjectTest') || adoProject;
        const adoAreaPath = config.get('adoAreaPath');
        const adoIterationPath = config.get('adoIterationPath');
        const adoPat = config.get('adoPat');
        const testPlanId = config.get('testPlanId');
        const targetTestSuiteId = config.get('targetTestSuiteId');
        const azureOpenAIEndpoint = config.get('azureOpenAIEndpoint');
        const azureOpenAIApiKey = config.get('azureOpenAIApiKey');
        const azureDeploymentName = config.get('azureDeploymentName');
        const azureApiVersion = config.get('azureApiVersion');
        const requiredConfigs = {
            'Azure DevOps Organization URL (adoTestGenerator.adoOrg)': adoOrg,
            'Azure DevOps Project Name (adoTestGenerator.adoProject)': adoProject,
            'Azure DevOps Area Path (adoTestGenerator.adoAreaPath)': adoAreaPath,
            'Azure DevOps Iteration Path (adoTestGenerator.adoIterationPath)': adoIterationPath,
            'Azure DevOps Personal Access Token (adoTestGenerator.adoPat)': adoPat,
            'Azure DevOps Test Plan ID (adoTestGenerator.testPlanId)': testPlanId,
            'Azure DevOps Target Test Suite ID (adoTestGenerator.targetTestSuiteId)': targetTestSuiteId,
            'Azure OpenAI Endpoint (adoTestGenerator.azureOpenAIEndpoint)': azureOpenAIEndpoint,
            'Azure OpenAI API Key (adoTestGenerator.azureOpenAIApiKey)': azureOpenAIApiKey,
            'Azure OpenAI Deployment Name (adoTestGenerator.azureDeploymentName)': azureDeploymentName,
            'Azure OpenAI API Version (adoTestGenerator.azureApiVersion)': azureApiVersion
        };
        // Use Object.keys to iterate over keys, and assert 'key' is a valid ConfigKey
        for (const key of Object.keys(requiredConfigs)) {
            if (!requiredConfigs[key]) {
                const msg = `Missing required setting: ${key}. Please configure it in extension settings.`;
                outputChannel.appendLine(`🛑 ${msg}`);
                vscode.window.showErrorMessage(msg);
                return null; // Indicate failure to retrieve configs
            }
        }
        return [
            `--ado_org=${adoOrg}`,
            `--ado_project=${adoProject}`,
            `--ado_project_pbi=${adoProjectPBI}`,
            `--ado_project_test=${adoProjectTest}`,
            `--ado_area_path=${adoAreaPath}`,
            `--ado_iteration_path=${adoIterationPath}`,
            `--ado_pat=${adoPat}`,
            `--test_plan_id=${testPlanId}`,
            `--target_test_suite_id=${targetTestSuiteId}`,
            `--openai_endpoint=${azureOpenAIEndpoint}`,
            `--openai_api_key=${azureOpenAIApiKey}`,
            `--deployment_name=${azureDeploymentName}`,
            `--api_version=${azureApiVersion}`
        ];
    };
    const runPythonScript = async (pbiInput, optionalPromptText, screenshotPaths, processTitle) => {
        outputChannel.show(); // Show the output channel
        outputChannel.appendLine(`Starting: ${processTitle}`);
        const configArgs = getPythonConfigArgs();
        if (!configArgs) {
            return; // Configuration missing, error message already shown
        }
        const pythonScriptPath = path.join(context.extensionPath, 'python', 'generate_and_push_tests.py');
        const pythonExecutable = 'python'; // Ensure Python is in PATH or provide full path
        const args = [
            pythonScriptPath,
            pbiInput, // This is either the PBI ID or the config file path
            ...configArgs // All the required configuration arguments
        ];
        let tempPromptFilePath;
        if (optionalPromptText) {
            // Write prompt to a temporary file, pass path to Python
            tempPromptFilePath = path.join(os.tmpdir(), `vsc_ado_prompt_${Date.now()}.txt`);
            fs.writeFileSync(tempPromptFilePath, optionalPromptText);
            args.push('--prompt', tempPromptFilePath);
            outputChannel.appendLine(`Temporary prompt file created: ${tempPromptFilePath}`);
        }
        if (screenshotPaths.length > 0) {
            args.push('--screenshots', ...screenshotPaths);
        }
        outputChannel.appendLine(`Executing Python script: ${pythonExecutable} ${args.join(' ')}`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "ADO Test Generator",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: processTitle });
            const pythonProcess = (0, child_process_1.spawn)(pythonExecutable, args);
            pythonProcess.stdout.on('data', (data) => {
                outputChannel.append(data.toString());
            });
            pythonProcess.stderr.on('data', (data) => {
                outputChannel.append(`[Python Error] ${data.toString()}`);
            });
            return new Promise((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        outputChannel.appendLine('✅ Process completed successfully.');
                        vscode.window.showInformationMessage(`${processTitle} completed successfully! Check 'ADO Test Generator Output' for details.`);
                        resolve();
                    }
                    else {
                        outputChannel.appendLine(`🛑 Process failed with exit code ${code}.`);
                        vscode.window.showErrorMessage(`${processTitle} failed. Check 'ADO Test Generator Output' for errors.`);
                        reject(new Error(`Python script exited with code ${code}`));
                    }
                    if (tempPromptFilePath && fs.existsSync(tempPromptFilePath)) {
                        fs.unlinkSync(tempPromptFilePath);
                        outputChannel.appendLine(`Cleaned up temporary prompt file: ${tempPromptFilePath}`);
                    }
                });
                pythonProcess.on('error', (err) => {
                    const errorMessage = `Failed to start Python process. Please ensure Python is installed and accessible in your PATH. Error: ${err.message}`;
                    outputChannel.appendLine(`🛑 ${errorMessage}`);
                    vscode.window.showErrorMessage(errorMessage);
                    reject(err);
                    if (tempPromptFilePath && fs.existsSync(tempPromptFilePath)) {
                        fs.unlinkSync(tempPromptFilePath);
                        outputChannel.appendLine(`Cleaned up temporary prompt file: ${tempPromptFilePath}`);
                    }
                });
            });
        });
    };
    // Command for Single PBI processing
    let disposableGenerateSingle = vscode.commands.registerCommand('ado-test-generator.generateTests', async () => {
        // 1. Get PBI ID from user input
        const pbiId = await vscode.window.showInputBox({
            prompt: 'Enter PBI ID:',
            placeHolder: 'e.g., 12345',
            validateInput: text => /^\d+$/.test(text) ? null : 'Please enter a valid number for PBI ID.'
        });
        if (!pbiId) {
            outputChannel.appendLine('PBI ID input cancelled. Aborting.');
            vscode.window.showWarningMessage('PBI ID is required to generate tests.');
            return;
        }
        // 2. Get optional prompt text from user input or file
        const optionalPromptInput = await vscode.window.showInputBox({
            prompt: 'Enter optional AI prompt text or path to a prompt file:',
            placeHolder: 'e.g., "Focus on validation of form fields" or "C:\\prompts\\my_prompt.txt"',
            ignoreFocusOut: true
        });
        let rawOptionalPromptText = '';
        if (optionalPromptInput) {
            const promptPath = path.resolve(optionalPromptInput);
            if (fs.existsSync(promptPath) && fs.lstatSync(promptPath).isFile()) {
                try {
                    rawOptionalPromptText = fs.readFileSync(promptPath, 'utf8');
                    outputChannel.appendLine(`Loaded prompt from file: ${promptPath}`);
                }
                catch (error) {
                    outputChannel.appendLine(`Error reading prompt file ${promptPath}: ${error}`);
                    vscode.window.showErrorMessage(`Could not read prompt file: ${promptPath}`);
                    return;
                }
            }
            else {
                rawOptionalPromptText = optionalPromptInput;
            }
        }
        // 3. Get screenshots from user input
        const screenshotPathsInput = await vscode.window.showInputBox({
            prompt: 'Enter comma-separated paths to local screenshot files (optional):',
            placeHolder: 'e.g., C:\\images\\ss1.png, /home/user/ss2.jpg',
            ignoreFocusOut: true
        });
        const screenshotFiles = [];
        if (screenshotPathsInput) {
            screenshotPathsInput.split(',').forEach(p => {
                const trimmedPath = p.trim();
                if (trimmedPath) {
                    const resolvedPath = path.resolve(trimmedPath);
                    if (fs.existsSync(resolvedPath) && fs.lstatSync(resolvedPath).isFile()) {
                        screenshotFiles.push(resolvedPath);
                    }
                    else {
                        outputChannel.appendLine(`Warning: Screenshot file not found or is not a file: ${resolvedPath}. Skipping.`);
                    }
                }
            });
        }
        await runPythonScript(pbiId, rawOptionalPromptText, screenshotFiles, `Generating tests for PBI ${pbiId}...`);
    });
    context.subscriptions.push(disposableGenerateSingle);
    // Command for Batch Processing from Config File
    let disposableGenerateBatch = vscode.commands.registerCommand('ado-test-generator.generateTestsFromConfig', async () => {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON Files': ['json']
            },
            title: 'Select config.json file for batch processing'
        });
        if (!fileUri || fileUri.length === 0) {
            outputChannel.appendLine('Config file selection cancelled. Aborting batch processing.');
            vscode.window.showWarningMessage('A config.json file is required for batch processing.');
            return;
        }
        const configFilePath = fileUri[0].fsPath;
        outputChannel.appendLine(`Selected config file for batch processing: ${configFilePath}`);
        // For batch mode, the Python script expects the config file path as its primary 'input' argument
        // The optional prompt and screenshots are expected to be *within* the config.json for each PBI
        // so we pass empty for those specific args from the extension's side.
        await runPythonScript(configFilePath, '', [], `Generating tests from config file: ${path.basename(configFilePath)}`);
    });
    context.subscriptions.push(disposableGenerateBatch);
    // Command to open extension settings easily
    let disposableSettings = vscode.commands.registerCommand('ado-test-generator.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'adoTestGenerator');
    });
    context.subscriptions.push(disposableSettings);
}
function deactivate() {
    outputChannel.dispose();
}
//# sourceMappingURL=extension.js.map