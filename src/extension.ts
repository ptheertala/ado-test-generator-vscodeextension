// src/extension.ts
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getWebviewContent } from './webviewContent';

let outputChannel: vscode.OutputChannel;
let currentPanel: vscode.WebviewPanel | undefined = undefined;

// Keys for VS Code Secret Storage and Workspace State
const ADO_PAT_SECRET_KEY = 'adoTestGenerator.adoPat';
const OPENAI_API_KEY_SECRET_KEY = 'adoTestGenerator.azureOpenAIApiKey';
const PBI_STATE_KEY = 'adoTestGenerator.pbiState';

// Define the PBI state structure to be stored
interface PBIState {
    pbiId: string;
    testCases: any[];
    acceptanceCriteria: string;
    pushed: boolean;
    optionalPromptText: string;
    screenshotPaths: string[];
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "ado-test-generator" is now active!');

    outputChannel = vscode.window.createOutputChannel("ADO Test Generator Output");
    context.subscriptions.push(outputChannel);

    // --- Secret Storage Functions ---
    async function getAndStoreSecret(key: string, promptMessage: string, forcePrompt: boolean = false): Promise<string | undefined> {
        let secret = await context.secrets.get(key);
        if (!secret || forcePrompt) {
            secret = await vscode.window.showInputBox({
                prompt: promptMessage,
                ignoreFocusOut: true,
                password: true
            });
            if (secret) {
                await context.secrets.store(key, secret);
                vscode.window.showInformationMessage(`Secret for ${key} stored securely.`);
            } else {
                vscode.window.showErrorMessage(`Secret for ${key} is required to proceed.`);
            }
        }
        return secret;
    }

    async function clearAllSecrets() {
        await context.secrets.delete(ADO_PAT_SECRET_KEY);
        await context.secrets.delete(OPENAI_API_KEY_SECRET_KEY);
        vscode.window.showInformationMessage('All ADO Test Generator secrets have been cleared.');
    }

    // --- Reusable function to get configuration from VS Code settings ---
    const getPythonConfigArgs = async () => {
        const config = vscode.workspace.getConfiguration('adoTestGenerator');
        const adoOrg = config.get<string>('adoOrg');
        const adoProject = config.get<string>('adoProject');
        const adoProjectPBI = config.get<string>('adoProjectPBI') || adoProject;
        const adoProjectTest = config.get<string>('adoProjectTest') || adoProject;
        const adoAreaPath = config.get<string>('adoAreaPath');
        const adoIterationPath = config.get<string>('adoIterationPath');
        const testPlanId = config.get<number>('testPlanId');
        const targetTestSuiteId = config.get<number>('targetTestSuiteId');
        const azureOpenAIEndpoint = config.get<string>('azureOpenAIEndpoint');
        const azureDeploymentName = config.get<string>('azureDeploymentName');
        const azureApiVersion = config.get<string>('azureApiVersion');

        const adoPat = await getAndStoreSecret(ADO_PAT_SECRET_KEY, "Enter your Azure DevOps Personal Access Token:");
        const azureOpenAIApiKey = await getAndStoreSecret(OPENAI_API_KEY_SECRET_KEY, "Enter your Azure OpenAI API Key:");

        const requiredConfigs: { name: string, value: any }[] = [
            { name: 'Azure DevOps Organization URL (adoTestGenerator.adoOrg)', value: adoOrg },
            { name: 'Azure DevOps Project Name (adoTestGenerator.adoProject)', value: adoProject },
            { name: 'Azure DevOps Area Path (adoTestGenerator.adoAreaPath)', value: adoAreaPath },
            { name: 'Azure DevOps Iteration Path (adoTestGenerator.adoIterationPath)', value: adoIterationPath },
            { name: 'Azure DevOps Test Plan ID (adoTestGenerator.testPlanId)', value: testPlanId },
            { name: 'Azure DevOps Target Test Suite ID (adoTestGenerator.targetTestSuiteId)', value: targetTestSuiteId },
            { name: 'Azure OpenAI Endpoint (adoTestGenerator.azureOpenAIEndpoint)', value: azureOpenAIEndpoint },
            { name: 'Azure OpenAI Deployment Name (adoTestGenerator.azureDeploymentName)', value: azureDeploymentName },
            { name: 'Azure OpenAI API Version (adoTestGenerator.azureApiVersion)', value: azureApiVersion },
            { name: 'Azure DevOps Personal Access Token', value: adoPat },
            { name: 'Azure OpenAI API Key', value: azureOpenAIApiKey }
        ];

        for (const config of requiredConfigs) {
            if (!config.value) {
                const msg = `Missing required setting: ${config.name}. Please configure it in extension settings or provide the secret.`;
                outputChannel.appendLine(`🛑 ${msg}`);
                vscode.window.showErrorMessage(msg);
                return null;
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

    // --- Reusable function to run the Python script ---
    const runPythonScript = async (pbiId: string, command: 'generate' | 'push', optionalPromptText: string, screenshotPaths: string[], testCasesJson?: string) => {
        outputChannel.show();

        if (command === 'generate') {
            outputChannel.appendLine(`🚀 Starting AI-powered test case generation for PBI #${pbiId}...`);
        } else if (command === 'push') {
            outputChannel.appendLine(`\n📤 Preparing to publish test cases for PBI #${pbiId}...`);
        }
        
        const configArgs = await getPythonConfigArgs();
        if (!configArgs) {
            throw new Error('Missing required configurations or secrets.');
        }

        const pythonScriptPath = path.join(context.extensionPath, 'python', 'generate_and_push_tests.py');
        const pythonExecutable = 'python';

        let args: string[] = [
            pythonScriptPath,
            command,
            pbiId,
            ...configArgs
        ];

        let tempPromptFilePath: string | undefined;

        if (optionalPromptText) {
            const promptPath = path.resolve(optionalPromptText);
            if (fs.existsSync(promptPath) && fs.lstatSync(promptPath).isFile()) {
                args.push('--prompt', promptPath);
                outputChannel.appendLine(`Using prompt from file: ${promptPath}`);
            } else {
                tempPromptFilePath = path.join(os.tmpdir(), `vsc_ado_prompt_${Date.now()}.txt`);
                fs.writeFileSync(tempPromptFilePath, optionalPromptText);
                args.push('--prompt', tempPromptFilePath);
                outputChannel.appendLine(`Temporary prompt file created for text input: ${tempPromptFilePath}`);
            }
        }

        if (screenshotPaths.length > 0) {
            args.push('--screenshots', ...screenshotPaths);
        }

        if (testCasesJson) {
            // Revert to passing the JSON string directly to the Python script
            args.push('--test_cases_json', testCasesJson);
        }
        
        return new Promise<string>((resolve, reject) => {
            const pythonProcess = spawn(pythonExecutable, args);
            let stdoutData = '';
            let stderrData = '';

            pythonProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                const dataStr = data.toString();
                outputChannel.append(dataStr);
                stderrData += dataStr;
            });

            pythonProcess.on('close', (code) => {
                if (tempPromptFilePath && fs.existsSync(tempPromptFilePath)) {
                    fs.unlinkSync(tempPromptFilePath);
                }
                
                if (code === 0) {
                    resolve(stdoutData);
                } else {
                    reject(new Error(`Python script exited with code ${code}. Error: ${stderrData}`));
                }
            });
        });
    };

    // --- Main Command Handler ---
    let disposableGenerate = vscode.commands.registerCommand('ado-test-generator.generateAndPushTests', async () => {
        // Step 1: Prompt for PBI ID
        const pbiInput = await vscode.window.showInputBox({
            prompt: "Enter the PBI ID",
            placeHolder: "e.g., 12345",
            validateInput: text => /^\d+$/.test(text) ? null : 'Please enter a valid number.'
        });

        if (!pbiInput) {
            vscode.window.showInformationMessage('PBI ID input cancelled. Operation aborted.');
            return;
        }
        const pbiId = pbiInput;

        // Step 2: Check for existing state and determine action
        let pbiState: PBIState | undefined = context.workspaceState.get(PBI_STATE_KEY);
        let action: 'Restore' | 'Regenerate' | 'Continue' = 'Continue';

        if (pbiState && pbiState.pbiId === pbiId) {
            if (!pbiState.pushed) {
                const selectedAction = await vscode.window.showQuickPick(['Restore', 'Regenerate'], {
                    placeHolder: 'Unpushed test cases found for this PBI. What would you like to do?'
                });

                if (selectedAction) {
                    action = selectedAction as 'Restore' | 'Regenerate';
                } else {
                    vscode.window.showInformationMessage('Operation cancelled.');
                    return;
                }
            } else {
                vscode.window.showInformationMessage('Test cases for this PBI have been pushed previously. Proceeding with new generation.');
            }
        }

        // Step 3: Handle the user's selected action
        if (action === 'Restore') {
            if (currentPanel) {
                currentPanel.reveal(vscode.ViewColumn.One);
            } else {
                createWebviewPanel(context, pbiId, pbiState!.testCases, pbiState!.acceptanceCriteria);
            }
            return;
        }

        // Proceed with new generation (for 'Regenerate' or 'Continue' actions)
        let optionalPromptText: string = '';
        let screenshotPaths: string[] = [];
        
        // --- Optional Prompt Input ---
        const promptOptions = ['Type/Paste Prompt Text', 'Browse for a Prompt File', 'Skip'];
        const selectedPromptOption = await vscode.window.showQuickPick(promptOptions, {
            placeHolder: 'How would you like to provide the optional prompt?',
            ignoreFocusOut: true
        });

        if (selectedPromptOption === undefined) {
            vscode.window.showInformationMessage('Optional prompt input cancelled. Operation aborted.');
            return;
        } else if (selectedPromptOption === 'Type/Paste Prompt Text') {
            const typedPrompt = await vscode.window.showInputBox({
                prompt: "Enter optional prompt text",
                placeHolder: "e.g., Create comprehensive test cases that cover all scenario variations",
                ignoreFocusOut: true
            });
            if (typedPrompt !== undefined) {
                optionalPromptText = typedPrompt;
            } else {
                vscode.window.showInformationMessage('Prompt text input cancelled. Operation aborted.');
                return;
            }
        } else if (selectedPromptOption === 'Browse for a Prompt File') {
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Text Files': ['txt', 'md', 'json'],
                    'All Files': ['*']
                },
                title: 'Select a prompt file'
            });
            if (fileUri && fileUri.length > 0) {
                optionalPromptText = fileUri[0].fsPath;
            } else {
                vscode.window.showInformationMessage('No prompt file selected. Operation aborted.');
                return;
            }
        }

        // --- Screenshot Input ---
        const screenshotOptions = ['Type/Paste File Paths (comma-separated)', 'Browse for Screenshot Files', 'Skip'];
        const selectedScreenshotOption = await vscode.window.showQuickPick(screenshotOptions, {
            placeHolder: 'How would you like to provide screenshots?',
            ignoreFocusOut: true
        });

        if (selectedScreenshotOption === undefined) {
            vscode.window.showInformationMessage('Screenshot input cancelled. Operation aborted.');
            return;
        } else if (selectedScreenshotOption === 'Type/Paste File Paths (comma-separated)') {
            const typedPaths = await vscode.window.showInputBox({
                prompt: "Enter comma-separated screenshot file paths",
                placeHolder: "e.g., C:\\img1.png, C:\\img2.jpg",
                ignoreFocusOut: true
            });
            if (typedPaths !== undefined) {
                screenshotPaths = typedPaths.split(',').map(p => p.trim()).map(p => p.replace(/^"|"$/g, '')).filter(p => p.length > 0);
            } else {
                vscode.window.showInformationMessage('Screenshot paths input cancelled. Operation aborted.');
                return;
            }
        } else if (selectedScreenshotOption === 'Browse for Screenshot Files') {
            const fileUris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                filters: {
                    'Images': ['png', 'jpg', 'jpeg', 'gif']
                },
                title: 'Select screenshot files'
            });
            if (fileUris && fileUris.length > 0) {
                screenshotPaths = fileUris.map(uri => uri.fsPath);
            } else {
                vscode.window.showInformationMessage('No screenshot files selected. Operation aborted.');
                return;
            }
        }

        // Step 4: Run the generation process with the inputs
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "ADO Test Generator",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Generating test cases..." });
            try {
                const pythonOutput = await runPythonScript(pbiId, 'generate', optionalPromptText, screenshotPaths);
                
                if (!pythonOutput) {
                    vscode.window.showErrorMessage('No output from Python script.');
                    return;
                }
                
                const firstBracketIndex = pythonOutput.indexOf('{');
                const lastBracketIndex = pythonOutput.lastIndexOf('}');
                
                if (firstBracketIndex === -1 || lastBracketIndex === -1) {
                    throw new Error("Failed to parse JSON output from Python script. The output did not contain a valid JSON object.");
                }
                
                const jsonStr = pythonOutput.substring(firstBracketIndex, lastBracketIndex + 1);
                const result = JSON.parse(jsonStr);

                if (!result.testCases || result.testCases.length === 0) {
                    vscode.window.showWarningMessage("The AI did not generate any test cases. Please check the output for errors.");
                    return;
                }

                // Save the generated but unpushed test cases and acceptance criteria to the workspace state
                await context.workspaceState.update(PBI_STATE_KEY, { pbiId: pbiId, testCases: result.testCases, acceptanceCriteria: result.acceptanceCriteria, pushed: false, optionalPromptText: optionalPromptText, screenshotPaths: screenshotPaths });

                // Create and show the webview panel
                createWebviewPanel(context, pbiId, result.testCases, result.acceptanceCriteria);

                vscode.window.showInformationMessage('Test cases have been generated. Review and edit in the new window.');
            } catch (error) {
                vscode.window.showErrorMessage(`An error occurred: ${error}`);
            }
        });
    });

    context.subscriptions.push(disposableGenerate);

    // --- Helper function for webview panel creation and message handling ---
    function createWebviewPanel(context: vscode.ExtensionContext, pbiId: string, testCases: any[], acceptanceCriteria: string) {
        if (currentPanel) {
            currentPanel.dispose();
        }

        currentPanel = vscode.window.createWebviewPanel(
            'testCasesPreview',
            `Test Cases for PBI #${pbiId}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out')), vscode.Uri.file(path.join(context.extensionPath, 'python'))]
            }
        );

        currentPanel.webview.html = getWebviewContent(testCases, pbiId, Array.isArray(acceptanceCriteria) ? acceptanceCriteria : acceptanceCriteria.split('\n').filter(line => line.trim() !== ''));

        currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'saveChanges':
                        // Save the user's edits to the workspace state
                        let pbiState: PBIState | undefined = context.workspaceState.get(PBI_STATE_KEY);
                        if (pbiState) {
                            pbiState.testCases = message.testCases;
                            pbiState.acceptanceCriteria = message.acceptanceCriteria;
                            await context.workspaceState.update(PBI_STATE_KEY, pbiState);
                        }
                        return;

                    case 'finalPush':
                        await vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: "ADO Test Generator",
                            cancellable: false
                        }, async (progress) => {
                            progress.report({ message: "Pushing test cases to ADO..." });
                            try {
                                const testCasesJson = JSON.stringify(message.testCases);
                                await runPythonScript(pbiId, 'push', '', [], testCasesJson);
                                
                                // Update the state after a successful push
                                await context.workspaceState.update(PBI_STATE_KEY, { 
                                    pbiId: pbiId, 
                                    testCases: message.testCases, 
                                    acceptanceCriteria: message.acceptanceCriteria,
                                    pushed: true, 
                                    optionalPromptText: '', 
                                    screenshotPaths: [] 
                                });
                                vscode.window.showInformationMessage('🎉 All test cases have been successfully pushed to Azure DevOps!');
                            } catch (error) {
                                vscode.window.showErrorMessage(`Failed to push test cases: ${error}`);
                            }
                        });
                        currentPanel?.dispose();
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

        currentPanel.onDidDispose(
            () => {
                currentPanel = undefined;
            },
            null,
            context.subscriptions
        );
    }
    
    // Command to open extension settings easily
    let disposableSettings = vscode.commands.registerCommand('ado-test-generator.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'adoTestGenerator');
    });
    context.subscriptions.push(disposableSettings);

    // New command to reset secrets
    let disposableResetSecrets = vscode.commands.registerCommand('ado-test-generator.resetSecrets', async () => {
        const confirmReset = await vscode.window.showWarningMessage(
            "Are you sure you want to reset all stored secrets (ADO PAT, OpenAI Key)? You will be prompted to re-enter them.",
            { modal: true },
            "Yes", "No"
        );
        if (confirmReset === "Yes") {
            await clearAllSecrets();
        }
    });
    context.subscriptions.push(disposableResetSecrets);
}

export function deactivate() {
    outputChannel.dispose();
}