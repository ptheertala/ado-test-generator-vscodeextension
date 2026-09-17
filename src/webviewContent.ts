// src/webviewContent.ts

// Client-side utility functions (for TypeScript compilation and runtime)
const htmlEscape = (str: string): string => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
};

// Define the interface for the new structured steps
interface Step {
    action: string;
    expectedResult: string;
}

export function getWebviewContent(testCases: any[], pbiId: string, acceptanceCriteria: string[]) {
    // Ensure steps are arrays of objects and add new properties for the review status feature
    testCases = testCases.map(tc => {
        // Handle cases where steps might be a single string or an array of strings
        if (typeof tc.steps === 'string') {
            const lines = tc.steps.split('\n').filter((step: string) => step.trim() !== '');
            tc.steps = lines.map((line: string) => {
                const parts = line.split(/Expected Result:/i);
                return {
                    action: parts[0].replace(/^\s*\d+\.\s*/, '').trim(),
                    expectedResult: parts[1] ? parts[1].trim() : ''
                };
            });
    } else if (Array.isArray(tc.steps) && tc.steps.some((step: unknown) => typeof step === 'string')) {
            // Handle array of strings case
            tc.steps = tc.steps.map((line: string) => {
                const parts = line.split(/Expected Result:/i);
                return {
                    action: parts[0].replace(/^\s*\d+\.\s*/, '').trim(),
                    expectedResult: parts[1] ? parts[1].trim() : ''
                };
            });
        }
        
        // This is a new check to ensure that if the steps array is empty, we add a blank step.
        // Otherwise, the fields will not appear at all.
        if (tc.steps.length === 0) {
            tc.steps.push({ action: '', expectedResult: '' });
        }

        if (!tc.status) {
            tc.status = 'Pending';
        }
        if (!tc.history) {
            tc.history = [];
        }
        if (!tc.rejectionComment) {
            tc.rejectionComment = '';
        }
        return tc;
    });

    const formattedAcceptanceCriteria = acceptanceCriteria && acceptanceCriteria.length > 0
        ? `<ul id="acceptanceCriteria">` +
            acceptanceCriteria.map((ac, i) =>
                `<li class="acceptance-criterion" data-index="${i}">${ac.replace(/^\s*\*\s*/, '')}</li>`
            ).join('') +
          `</ul>`
        : '<ul id="acceptanceCriteria"><li>No acceptance criteria found for this PBI.</li></ul>';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Cases Preview</title>
<link href="https://cdn.jsdelivr.net/npm/@vscode/codicons/dist/codicon.css" rel="stylesheet" />
<style>
body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
h1 { text-align: center; color: var(--vscode-editor-foreground); margin-bottom: 30px; font-size: 28px; letter-spacing: 0.5px; }

/* Dashboard and Main Layout */
.main-layout { display: flex; justify-content: space-between; gap: 20px; padding: 30px; max-width: 1400px; margin: 0 auto; }
.test-cases-panel { flex: 2; background-color: #1e1e1e; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1); padding: 20px; }
.acceptance-criteria-panel { flex: 1; background-color: #252526; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1); padding: 5px 20px 20px 20px; border-left: 5px solid #2563eb; }
.acceptance-criteria-panel ul { list-style-type: disc; padding-left: 20px; margin: 0; }
.acceptance-criteria-panel h3 { margin: 0; color: #3b82f6;}
.scrollable-ac { max-height: 500px; overflow-y: auto; padding-right: 15px; }
/* Custom scrollbar for Acceptance Criteria */
.scrollable-ac::-webkit-scrollbar { width: 8px; }
.scrollable-ac::-webkit-scrollbar-track { background: var(--vscode-editor-background); border-radius: 8px; }
.scrollable-ac::-webkit-scrollbar-thumb { background-color: var(--vscode-scrollbarSlider-background); border-radius: 8px; border: 2px solid var(--vscode-editor-background); }
.scrollable-ac::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground); }

/* New Dashboard Section */
.dashboard { background: var(--vscode-sideBar-background); padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); margin-bottom: 20px; display: flex; flex-direction: column; gap: 15px; position: sticky; top: 0; z-index: 100; }
.status-counters { display: flex; justify-content: space-around; font-size: 1.2em; font-weight: bold; }
.status-counter-item { display: flex; align-items: center; gap: 8px; }
.status-counter-item .codicon { font-size: 1.5em; }
.status-counter-item.approved { color: #10b981; }
.status-counter-item.rejected { color: #ef4444; }
.status-counter-item.pending { color: var(--vscode-notifications-infoIcon-foreground); }

/* Progress Bar */
.progress-bar-container { width: 100%; height: 15px; background-color: #e5e7eb; border-radius: 8px; overflow: hidden; }
.progress-bar-fill { height: 100%; display: flex; transition: width 0.3s ease-in-out; }
.progress-bar-segment { height: 100%; }
.progress-bar-segment.pending { background-color: #facc15; }
.progress-bar-segment.approved { background-color: #22c55e; }
.progress-bar-segment.rejected { background-color: #ef4444; }


/* Filter Buttons */
.filter-buttons { display: flex; gap: 10px; margin-top: 10px; }
.filter-buttons button { padding: 8px 12px; border: 1px solid #4b5563; border-radius: 6px; background: transparent; cursor: pointer; transition: all 0.2s; color: #d1d5db; }
.filter-buttons button.active, .filter-buttons button:hover { background: #374151; color: #fff; }

/* Bulk Actions */
.bulk-actions-container { display: flex; justify-content: flex-start; gap: 10px; margin-top: 15px; margin-bottom: 10px; }
.bulk-actions-container button { padding: 8px 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background-color 0.2s; }
.bulk-actions-container .approve-btn { background-color: #10b981; color: white; }
.bulk-actions-container .approve-btn:hover { background-color: #059669; }
.bulk-actions-container .reject-btn { background-color: #ef4444; color: white; }
.bulk-actions-container .reject-btn:hover { background-color: #dc2626; }

/* Test Case Block & Summary */
details.test-case-block { margin-bottom: 20px; border-radius: 10px; border: 1px solid var(--vscode-editorWidget-border); background: var(--vscode-input-background); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
details.test-case-block:hover {
    border-color: #3b82f6;
    box-shadow: 0 0 10px rgba(59,130,246,0.3);
}
summary { padding: 12px 16px; cursor: pointer; font-weight: bold; color: var(--vscode-editor-foreground); background: var(--vscode-list-hoverBackground); border-bottom: 1px solid var(--vscode-editorWidget-border); list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
summary::-webkit-details-marker { display: none; }
.test-case-title-display { flex-grow: 1; padding-right: 10px; display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 1.1em; }
.test-case-title-input {
    flex-grow: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}
/* New style for grouping the dropdown and delete button */
.test-case-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}
/* Style for the delete button */
.delete-btn {
    padding: 5px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    color: #dc2626;
    font-size: 1.1em;
    transition: background-color 0.2s;
}
.delete-btn:hover {
    background-color: var(--vscode-list-hoverBackground);
}

/* New Status Badges */
.status-badge { display: flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 12px; font-size: 0.9em; font-weight: bold; text-transform: uppercase; }
.status-badge.approved { background-color: #dcfce7; color: #166534; }
.status-badge.rejected { background-color: #fee2e2; color: #b91c1c; }
.status-badge.pending { background-color: #fef9c3; color: #92400e; }

/* Custom styled dropdown */
.review-status-select { padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 14px; font-weight: bold; color: var(--vscode-dropdown-foreground); background-color: var(--vscode-dropdown-background); cursor: pointer; -webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-down"><polyline points="6 9 12 15 18 9"></polyline></svg>'); background-repeat: no-repeat; background-position: right 8px center; background-size: 12px; }
.review-status-select.pending { background-color: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.review-status-select.approved { background-color: #d1fae5; border-color: #6ee7b7; color: #065f46; }
.review-status-select.rejected { background-color: #fee2e2; border-color: #fca5a5; color: #DD1122; }

.test-case-actions { display: flex; align-items: center; gap: 10px; }

/* Reviewer Comment Section */
.review-comment { margin-top: 10px; }
.review-comment textarea { width: 100%; min-height: 80px; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 6px; resize: vertical; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); }
.review-comment-header { display: flex; justify-content: space-between; align-items: center; }

/* Save/Push Buttons and Validation */
.bottom-buttons { display: flex; justify-content: space-between; align-items: center; margin-top: 30px; gap: 10px; flex-wrap: wrap; }
.bottom-buttons button { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; padding: 12px 24px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: bold; flex-grow: 1; text-align: center; transition: background-color 0.2s; }
.bottom-buttons button:hover:not([disabled]) { background: linear-gradient(135deg, #1d4ed8, #1e40af); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); }
.bottom-buttons button:disabled { background-color: var(--vscode-button-secondaryBackground); cursor: not-allowed; opacity: 0.7; }
.bottom-buttons .secondary-btn {
  background: transparent;
  border: 2px solid #2563eb;
  color: #2563eb;
}
.bottom-buttons .secondary-btn:hover {
  background: #2563eb;
  color: #fff;
}
.validation-summary { padding: 10px; border-radius: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); flex-grow: 1; text-align: center; }

/* Test Case Content and Steps */
.test-case-content { padding: 16px; }
.test-case-content label { font-weight: bold; display: block; margin: 8px 0 4px; color: var(--vscode-foreground); }
.test-case-content input[type="text"] { width: 100%; padding: 10px; border: 1px solid var(--vscode-input-border); border-radius: 6px; font-family: inherit; font-size: 14px; margin-bottom: 10px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); }
.steps-editor { border: 1px solid var(--vscode-input-border); border-radius: 6px; font-family: inherit; font-size: 14px; padding: 10px; background-color: var(--vscode-input-background); outline: none; }
.step-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 40px; /* Provides a fixed width for the delete button column */
    gap: 10px;
    align-items: flex-start; /* Aligns items to the top to prevent overlapping with expanding textareas */
    margin-bottom: 10px;
    border: 1px solid var(--vscode-input-border);
    padding: 10px;
    border-radius: 6px;
    background-color: var(--vscode-editor-background);
}
.step-grid:hover {
    background-color: var(--vscode-editor-hoverBackground);
}
.step-grid .step-number { font-weight: bold; color: var(--vscode-textLink-foreground); }
.step-grid input, .step-grid textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-family: inherit;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    min-height: 40px; /* Ensure textareas have a minimum height */
}
.step-grid textarea {
    resize: vertical;
}
.step-grid .step-input-container {
    display: flex;
    flex-direction: column;
}
.step-grid .step-input-container label {
    font-size: 0.8em;
    font-weight: normal;
    color: var(--vscode-textLink-foreground);
    margin-bottom: 4px;
}

.step-actions {
    display: flex;
    align-items: center; /* Aligns the button to the top of its grid cell */
    justify-content: flex-end;
    height: 100%;
    padding-right: 5px; /* Adds a small space from the right edge */
}
.step-actions button {
    padding: 5px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    color: var(--vscode-editor-foreground);
    transition: background-color 0.2s;
}
.step-actions button:hover {
    background-color: var(--vscode-list-hoverBackground);
}
.delete-step-btn .codicon, .delete-btn .codicon { color: #dc2626; }
.add-step-btn {
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background-color 0.2s;
}
.add-step-btn:hover {
    background: var(--vscode-button-hoverBackground);
}


/* History Modal */
.modal-overlay { 
    position: fixed; 
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 100%; 
    background: rgba(0,0,0,0.6); 
    display: none; 
    justify-content: center; 
    align-items: center; 
    z-index: 1000; 
}
.modal-content { 
    background: var(--vscode-editor-background); 
    padding: 25px; 
    border-radius: 10px; 
    max-width: 500px; 
    width: 90%; 
    box-shadow: 0 8px 24px rgba(0,0,0,0.3); 
    animation: fadeIn 0.3s ease-out;
    color: var(--vscode-foreground);
}
.modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--vscode-dropdown-border); padding-bottom: 10px; margin-bottom: 15px; }
.modal-header h3 { margin: 0; }
.modal-close { font-size: 1.5em; cursor: pointer; color: var(--vscode-icon-foreground); }
.modal-body { display: flex; flex-direction: column; gap: 15px; }
.modal-body ul { list-style: none; padding: 0; }
.modal-body li { background: var(--vscode-list-activeSelectionBackground); padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid var(--vscode-textLink-foreground); }
.modal-body li strong { color: var(--vscode-textLink-foreground); }
.modal-body button { margin-top: 15px; }
.modal-body textarea { width: 100%; min-height: 80px; padding: 8px; border: 1px solid var(--vscode-input-border); border-radius: 6px; resize: vertical; margin-top: 5px; }

/* Animations */
@keyframes fadeIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
}

/* History Block styling */
.history-block { 
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
    padding: 10px; 
    border-radius: 8px; 
    margin-top: 15px;
    border: 1px solid var(--vscode-editorWidget-border); 
}

/* Checkbox for Bulk Actions */
.test-case-checkbox { margin-right: 10px; }

/* Responsive Adjustments */
@media (max-width: 600px) {
    .main-layout { flex-direction: column; }
    .bottom-buttons { flex-direction: column; }
}

/* Specific Modal UI improvements */
.modal-body .info-note {
    background-color: var(--vscode-inputValidation-infoBackground);
    border: 1px solid var(--vscode-inputValidation-infoBorder);
    color: var(--vscode-inputValidation-infoForeground);
    padding: 10px 15px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-weight: bold;
    text-align: center;
}
.modal-summary-box {
    background-color: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 15px;
    border-radius: 8px;
}
.modal-body p { margin: 0; }
.modal-body p strong { color: var(--vscode-textLink-foreground); }
.modal-body .push-button {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    font-weight: bold;
    width: 100%;
    transition: background-color 0.2s;
}
.modal-body .push-button:hover {
    background-color: var(--vscode-button-hoverBackground);
}

/* Specific Modal UI improvements for delete confirmation*/
.modal-body .secondary-btn {
  background: transparent;
  border: 2px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.modal-body .secondary-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}
.modal-body .reject-btn {
    background-color: #ef4444;
    color: white;
}
.modal-body .reject-btn:hover {
    background-color: #dc2626;
}
/* Styling for the dynamic test case title in the modal */
#testCaseTitleToDelete {
    color: #3b82f6;
    font-weight: bold;
}

/* Styling for the "cannot be undone" warning */
.cannot-undo {
    color: #ef4444; /* Use the same red as the reject button */
    font-weight: bold;
    font-size: 0.9em;
    text-transform: uppercase;
}
</style>
</head>
<body>
<h1>Test Cases Preview for PBI #${pbiId}</h1>

<div class="dashboard">
    <div class="status-counters">
        <div class="status-counter-item pending">
            <span class="codicon codicon-watch"></span>
            <span id="pendingCount">0</span> Pending
        </div>
        <div class="status-counter-item approved">
            <span class="codicon codicon-pass"></span>
            <span id="approvedCount">0</span> Approved
        </div>
        <div class="status-counter-item rejected">
            <span class="codicon codicon-error"></span>
            <span id="rejectedCount">0</span> Rejected
        </div>
    </div>
    <div class="progress-bar-container">
        <div class="progress-bar-fill" id="progressBar"></div>
    </div>
    <div class="filter-buttons">
        <button id="filterAll" class="active">Show All</button>
        <button id="filterPending">Show Pending</button>
        <button id="filterApproved">Show Approved</button>
        <button id="filterRejected">Show Rejected</button>
    </div>
    <div class="bulk-actions-container" style="display: none;">
        <button class="approve-btn codicon codicon-pass-all" id="bulkApproveBtn">Approve Selected</button>
        <button class="reject-btn codicon codicon-error" id="bulkRejectBtn">Reject Selected</button>
    </div>
</div>

<div class="main-layout">
    <div class="test-cases-panel">
        <div id="testCasesContainer"></div>
        <div class="bottom-buttons">
            <button id="addNewTestBtn" class="codicon codicon-add secondary-btn">New Test Case</button>
            <button id="finalPushBtn" class="codicon codicon-cloud-upload" disabled>Save & Push to ADO</button>
        </div>
        <div class="validation-summary">
            <div id="summaryText">Review status required for all test cases.</div>
        </div>
    </div>
     <details class="acceptance-criteria-panel" open>
        <summary><h3>Acceptance Criteria 📌</h3></summary>
        <div class="scrollable-ac">
            <ul>
                ${formattedAcceptanceCriteria}
            </ul>
        </div>
    </details> 
</div>

<div id="confirmationModal" class="modal-overlay">
    <div class="modal-content">
        <div class="modal-header">
            <h3>Push Approved Test Cases to ADO</h3>
            <span class="codicon codicon-close modal-close"></span>
        </div>
        <div class="modal-body">
            <div class="info-note">Only Approved test cases will be pushed to ADO.</div>
            <div id="modalSummary" class="modal-summary-box"></div>
            <div class="review-comment">
                <label>Reviewer Notes:</label>
                <textarea id="pushNotes" placeholder="Add any final notes..."></textarea>
            </div>
            <button id="confirmPushBtn" class="codicon codicon-cloud-upload push-button">Push Approved Cases</button>
        </div>
    </div>
</div>

<div id="deleteConfirmationModal" class="modal-overlay">
    <div class="modal-content">
        <div class="modal-header">
            <h3>Confirm Deletion</h3>
            <span class="codicon codicon-close modal-close-delete"></span>
        </div>
        <div class="modal-body">
            <p>Are you sure you want to delete the test case named: <span id="testCaseTitleToDelete"></span>?</p>
            <p><span class="cannot-undo">This action cannot be undone.</span></p>
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                <button id="cancelDeleteBtn" class="secondary-btn">Cancel</button>
                <button id="confirmDeleteBtn" class="reject-btn">Yes, Delete</button>
            </div>
        </div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    let testCases = ${JSON.stringify(testCases)};
    const pbiId = "${pbiId}";
    let currentFilter = 'All';
    const reviewerName = "Current User";

    const previousState = vscode.getState();
    if (previousState && previousState.testCases) {
        testCases = previousState.testCases;
    }

    // Utility to save the current state
    function saveState() {
        vscode.setState({ testCases });
    }

    // Helper to escape HTML for display
    function htmlEscape(str) {
        if (!str) {
            return '';
        }
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    let saveTimeout = null;

    function sendSaveChangesMessage() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            const allTestCases = getTestCasesFromDOM();

            // Extract acceptance criteria list items
            const acNodes = document.querySelectorAll('#acceptanceCriteria .acceptance-criterion');
            const acceptanceCriteria = Array.from(acNodes).map(el => el.innerText.trim());

            vscode.postMessage({
                command: 'saveChanges',
                testCases: allTestCases,
                acceptanceCriteria
            });
            console.log('Test case changes saved to workspace state.');

        }, 500);
    }

    
    // Helper function to extract all test cases from the current DOM state
   function getTestCasesFromDOM() {
        const testCaseElements = document.querySelectorAll('.test-case-block');
        const extracted = [];
        testCaseElements.forEach(tcEl => {
            const index = tcEl.getAttribute('data-index');
            const title = tcEl.querySelector('.test-case-title-input')?.value || '';
            const status = tcEl.querySelector('.review-status-select')?.value || 'Pending';
            const reviewComment = tcEl.querySelector('.review-comment-input')?.value || '';

            const steps = [];
            tcEl.querySelectorAll('.step-grid').forEach(stepEl => {
                const action = stepEl.querySelector('.step-input-action')?.value || '';
                const expectedResult = stepEl.querySelector('.step-input-expected')?.value || '';
                steps.push({ action, expectedResult });
            });

            extracted.push({
                id: index,
                title,
                steps,
                status,
                reviewComment,
                rejectionComment: reviewComment,
                history: testCases[index]?.history || []
            });
        });
        return extracted;
    }

    function renderTestCases() {
        const container = document.getElementById('testCasesContainer');
        if (!container) return;
        container.innerHTML = '';
        
        testCases.forEach((tc, tcIndex) => {
            if (currentFilter !== 'All' && tc.status !== currentFilter) {
                return;
            }
            let rejectionCommentHtml = '';
            const isRejected = tc.status === 'Rejected';
            if (isRejected && tc.rejectionComment) {
                rejectionCommentHtml = ''
                    + '<div class="review-comment">'
                    + '<label>Rejection Comment:</label>'
                    + '<textarea readonly disabled>' + htmlEscape(tc.rejectionComment) + '</textarea>'
                    + '</div>';
            }
            let historyHtml = '';
            if (tc.history && tc.history.length > 0) {
                historyHtml = ''
                    + '<details class="history-block">'
                    + '    <summary>History (' + tc.history.length + ')</summary>'
                    + '    <ul>'
                    + '        ' + tc.history.map(h => '<li><strong>' + h.status + '</strong> by ' + h.reviewerName + ' on ' + h.timestamp + ' - ' + htmlEscape(h.comment) + '</li>').join('') + ''
                    + '    </ul>'
                    + '</details>';
            }
            const bulkCheckbox = ''
                + '<input type="checkbox" class="test-case-checkbox" data-index="' + tcIndex + '" style="display: none;">';
            const stepsHtml = tc.steps.map((step, stepIndex) => {
                return ''
                    + '<div class="step-grid" data-test-case-index="' + tcIndex + '" data-step-index="' + stepIndex + '">'
                    + '    <div class="step-input-container">'
                    + '        <label>Action:</label>'
                    + '        <textarea class="step-input-action" placeholder="Enter action here">' + htmlEscape(step.action) + '</textarea>'
                    + '    </div>'
                    + '    <div class="step-input-container">'
                    + '        <label>Expected Result:</label>'
                    + '        <textarea class="step-input-expected" placeholder="Enter expected result here">' + htmlEscape(step.expectedResult) + '</textarea>'
                    + '    </div>'
                    + '    <div class="step-actions">'
                    + '        <button class="delete-step-btn codicon codicon-trash" title="Delete Step"></button>'
                    + '    </div>'
                    + '</div>';
            }).join('');
            const testCaseHtml = ''
                + '<details class="test-case-block" data-index="' + tcIndex + '" data-status="' + tc.status + '">'
                + '    <summary>'
                + '        <div class="test-case-title-display">'
                + '            ' + bulkCheckbox
                + '            <input type="text" value="' + htmlEscape(tc.title) + '" class="test-case-title-input" data-index="' + tcIndex + '" />'
                + '        </div>'
                + '        <div class="test-case-actions">'
                + '            <select class="review-status-select ' + tc.status.toLowerCase() + '" data-index="' + tcIndex + '">'
                + '                <option value="Pending" ' + (tc.status === 'Pending' ? 'selected' : '') + '>Pending</option>'
                + '                <option value="Approved" ' + (tc.status === 'Approved' ? 'selected' : '') + '>Approved</option>'
                + '                <option value="Rejected" ' + (tc.status === 'Rejected' ? 'selected' : '') + '>Rejected</option>'
                + '            </select>'
                + '            <button class="delete-btn codicon codicon-trash" data-index="' + tcIndex + '" title="Delete Test Case"></button>'
                + '        </div>'
                + '    </summary>'
                + '    <div class="test-case-content">'
                + '        <label for="steps-' + tcIndex + '">Test Steps:</label>'
                + '        <div class="steps-container" id="steps-' + tcIndex + '">'
                + '            ' + stepsHtml
                + '        </div>'
                + '        <div style="margin-top: 10px;">'
                + '            <button class="add-step-btn codicon codicon-add" data-index="' + tcIndex + '">Add Step</button>'
                + '        </div>'
                + '        <div class="review-comment">'
                + '            <label>Reviewer Comment:</label>'
                + '            <textarea data-index="' + tcIndex + '" class="review-comment-input" placeholder="Add a comment...">' + htmlEscape(tc.rejectionComment) + '</textarea>'
                + '        </div>'
                + '        ' + historyHtml
                + '    </div>'
                + '</details>';
            container.insertAdjacentHTML('beforeend', testCaseHtml);
        });
        updateDashboard();
        togglePushBtn();
        toggleBulkActionButtons();
    }

    function updateDashboard() {
        const total = testCases.length;
        const pendingCount = testCases.filter(tc => tc.status === 'Pending').length;
        const approvedCount = testCases.filter(tc => tc.status === 'Approved').length;
        const rejectedCount = testCases.filter(tc => tc.status === 'Rejected').length;

        document.getElementById('pendingCount').textContent = pendingCount;
        document.getElementById('approvedCount').textContent = approvedCount;
        document.getElementById('rejectedCount').textContent = rejectedCount;

        const progressBar = document.getElementById('progressBar');
        if (total === 0) {
            progressBar.style.width = '0%';
        } else {
            const approvedWidth = (approvedCount / total) * 100;
            const rejectedWidth = (rejectedCount / total) * 100;
            const pendingWidth = (pendingCount / total) * 100;
            
            progressBar.innerHTML = ''
                + '<div class="progress-bar-segment pending" style="width: ' + pendingWidth + '%"></div>'
                + '<div class="progress-bar-segment approved" style="width: ' + approvedWidth + '%"></div>'
                + '<div class="progress-bar-segment rejected" style="width: ' + rejectedWidth + '%"></div>';
            progressBar.style.display = 'flex';
        }
    }

    function togglePushBtn() {
        const allReviewed = testCases.every(tc => tc.status !== 'Pending');
        const pushBtn = document.getElementById('finalPushBtn');
        const summaryText = document.getElementById('summaryText');

        if (allReviewed) {
            pushBtn.disabled = false;
            summaryText.textContent = "All test cases have been reviewed. Ready to push.";
        } else {
            pushBtn.disabled = true;
            summaryText.textContent = "Review status required for all test cases.";
        }
    }
    
    function toggleBulkActionButtons() {
        const checkboxes = document.querySelectorAll('.test-case-checkbox');
        const bulkContainer = document.querySelector('.bulk-actions-container');
        const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
        bulkContainer.style.display = anyChecked ? 'flex' : 'none';
    }

    function handleBulkAction(status) {
        const checkedBoxes = document.querySelectorAll('.test-case-checkbox:checked');
        checkedBoxes.forEach(checkbox => {
            const index = checkbox.getAttribute('data-index');
            testCases[index].status = status;
            testCases[index].history.push({
                status: status,
                reviewerName: reviewerName,
                timestamp: new Date().toLocaleString(),
                comment: 'Bulk action'
            });
        });
        renderTestCases();
        saveState();
        toggleBulkActionButtons();
        sendSaveChangesMessage();
    }

    function handleStatusChange(e) {
        const target = e.target;
        const index = target.getAttribute('data-index');
        const newStatus = target.value;
        const tc = testCases[index];
        const oldStatus = tc.status;
        
        if (newStatus === oldStatus) return;

        tc.status = newStatus;
        
        // Add to history
        tc.history.push({
            status: newStatus,
            reviewerName: reviewerName,
            timestamp: new Date().toLocaleString(),
            comment: ''
        });
        
        if (newStatus === 'Approved') {
            tc.rejectionComment = '';
        }
        
        renderTestCases();
        saveState();
        scrollToNextPending();
    }

// Function to scroll to the next pending test case
    function scrollToNextPending() {
        const visibleTestCases = Array.from(document.querySelectorAll('.test-case-block')).filter(block => {
            return block.offsetParent !== null;
        });

        const nextPending = visibleTestCases.find(block => {
            const index = block.getAttribute('data-index');
            return testCases[index] && testCases[index].status === 'Pending';
        });

        if (nextPending) {
            nextPending.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextPending.open = true;
            const titleInput = nextPending.querySelector('.test-case-title-input');
            if (titleInput) {
                    titleInput.focus();
            }
        }
    }

    function handleTitleChange(e) {
        const index = e.target.getAttribute('data-index');
        testCases[index].title = e.target.value;
        saveState();
    }

    function handleCommentChange(e) {
        const index = e.target.getAttribute('data-index');
        testCases[index].rejectionComment = e.target.value;
        saveState();
    }
    
    function handleStepInput(e) {
        const target = e.target;
        const stepGrid = target.closest('.step-grid');
        if (!stepGrid) return;
        const tcIndex = parseInt(stepGrid.getAttribute('data-test-case-index'));
        const stepIndex = parseInt(stepGrid.getAttribute('data-step-index'));
        const isAction = target.classList.contains('step-input-action');
        
        if (isAction) {
            testCases[tcIndex].steps[stepIndex].action = target.value;
        } else {
            testCases[tcIndex].steps[stepIndex].expectedResult = target.value;
        }
        saveState();
    }

    function handleStatusChange(e) {
        const target = e.target;
        const testCaseBlock = target.closest('.test-case-block');
        const tcIndex = parseInt(testCaseBlock.getAttribute('data-index'));
        const newStatus = target.value;
        const testCase = testCases[tcIndex];

        if (testCase.status !== newStatus) {
            testCase.status = newStatus;
            testCase.history.push({
                status: newStatus,
                reviewerName: 'You',
                timestamp: new Date().toLocaleString(),
                comment: testCase.rejectionComment || ''
            });
        }

        testCases.sort((a, b) => {
            const statusOrder = { 'Pending': 1, 'Approved': 2, 'Rejected': 3 };
            return statusOrder[a.status] - statusOrder[b.status];
        });
    
        renderTestCases(testCases);
        saveState();

        const nextPendingIndex = testCases.findIndex(tc => tc.status === 'Pending');
        if (nextPendingIndex !== -1) {
            const nextPendingBlock = document.querySelector('.test-case-block[data-index="' + nextPendingIndex + '"]');
            if (nextPendingBlock) {
                nextPendingBlock.open = true;
            }
        }
    }
    
    function addNewTestCase() {
        const newTestCase = {
            title: 'New Test Case ' + (testCases.length + 1),
            steps: [{ action: '', expectedResult: '' }],
            status: 'Pending',
            history: [],
            rejectionComment: ''
        };
        testCases.push(newTestCase);
        renderTestCases();
        saveState();
        sendSaveChangesMessage();
        const lastTestCase = document.querySelector('.test-case-block:last-child');
        if (lastTestCase) {
            lastTestCase.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }
    
    function addStep(e) {
        const target = e.target.closest('button');
        const tcIndex = parseInt(target.getAttribute('data-index'));
        const newStep = { action: '', expectedResult: '' };

        if (testCases[tcIndex].status !== 'Pending') {
            testCases[tcIndex].status = 'Pending';
            testCases[tcIndex].history.push({
                status: 'Pending',
                reviewerName: 'System',
                timestamp: new Date().toLocaleString(),
                comment: 'Step added, status reset to Pending'
            });
        }

        testCases[tcIndex].steps.push(newStep);
        saveState();
        renderTestCases(); // Re-render the whole UI
        sendSaveChangesMessage();
        const testCaseBlock = document.querySelector('.test-case-block[data-index="' + tcIndex + '"]');
        if (testCaseBlock) {
            testCaseBlock.open = true;
            const newStepElement = document.querySelector('.step-grid[data-test-case-index="' + tcIndex + '"][data-step-index="' + (testCases[tcIndex].steps.length - 1) + '"]');
            if (newStepElement) {
                newStepElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }
    }

    function deleteStep(e) {
        const stepGrid = e.target.closest('.step-grid');
        if (!stepGrid) return;
        const tcIndex = parseInt(stepGrid.getAttribute('data-test-case-index'));
        const stepIndex = parseInt(stepGrid.getAttribute('data-step-index'));

        if (testCases[tcIndex].status !== 'Pending') {
            testCases[tcIndex].status = 'Pending';
            testCases[tcIndex].history.push({
                status: 'Pending',
                reviewerName: 'System',
                timestamp: new Date().toLocaleString(),
                comment: 'Step deleted, status reset to Pending'
            });
        }

        testCases[tcIndex].steps.splice(stepIndex, 1);
        saveState();
        renderTestCases(); // Re-render the whole UI
        sendSaveChangesMessage();
        const testCaseBlock = document.querySelector('.test-case-block[data-index="' + tcIndex + '"]');
        if (testCaseBlock) {
            testCaseBlock.open = true;
        }
    }

    // --- Main Event Listeners ---
    document.addEventListener('DOMContentLoaded', () => {
        renderTestCases();
    });

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('.add-step-btn, .add-step-btn *')) {
            addStep(e);
        }
        if (target.matches('.delete-step-btn, .delete-step-btn *')) {
            deleteStep(e);
        }
        // if (target.matches('.delete-btn, .delete-btn *')) {
        //     const testCaseBlock = target.closest('.test-case-block');
        //     if (!testCaseBlock) return;
        //     const index = parseInt(testCaseBlock.dataset.index, 10);
        //     testCases.splice(index, 1);
        //     saveState();
        //     renderTestCases();
        // }

        // **NEW:** Handle the initial delete button click
        if (target.matches('.delete-btn, .delete-btn *')) {
            const testCaseBlock = target.closest('.test-case-block');
            if (!testCaseBlock) return;
            const index = parseInt(testCaseBlock.dataset.index, 10);
            const testCaseTitle = testCases[index].title;

            // Store the index and set the dynamic title
            document.getElementById('deleteConfirmationModal').dataset.indexToDelete = index;
            document.getElementById('testCaseTitleToDelete').textContent = htmlEscape(testCaseTitle);
            document.getElementById('deleteConfirmationModal').style.display = 'flex';
    
            // Set focus to the "Cancel" button for better accessibility
            document.getElementById('cancelDeleteBtn').focus();
        }

        // **NEW:** Handle the confirmation "Yes" button click
        if (target.id === 'confirmDeleteBtn') {
            const index = parseInt(document.getElementById('deleteConfirmationModal').dataset.indexToDelete, 10);
            if (!isNaN(index)) { // Ensure a valid index exists
                testCases.splice(index, 1);
                saveState();
                renderTestCases();
            }
            document.getElementById('deleteConfirmationModal').style.display = 'none';
        }
        
        // **NEW:** Handle the "No" or modal close button clicks
        if (target.id === 'cancelDeleteBtn' || target.classList.contains('modal-close-delete')) {
            document.getElementById('deleteConfirmationModal').style.display = 'none';
        }
        if (target.id === 'filterAll') {
            currentFilter = 'All';
            document.querySelectorAll('.filter-buttons button').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            renderTestCases();
        }
        if (target.id === 'filterPending') {
            currentFilter = 'Pending';
            document.querySelectorAll('.filter-buttons button').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            renderTestCases();
        }
        if (target.id === 'filterApproved') {
            currentFilter = 'Approved';
            document.querySelectorAll('.filter-buttons button').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            renderTestCases();
        }
        if (target.id === 'filterRejected') {
            currentFilter = 'Rejected';
            document.querySelectorAll('.filter-buttons button').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            renderTestCases();
        }
        if (target.id === 'bulkApproveBtn') {
            handleBulkAction('Approved');
        }
        if (target.id === 'bulkRejectBtn') {
            handleBulkAction('Rejected');
        }
        if (target.id === 'finalPushBtn') {
            const modalSummary = document.getElementById('modalSummary');
            const approvedCount = testCases.filter(tc => tc.status === 'Approved').length;
            modalSummary.innerHTML = '<p>You are about to push <strong>' + approvedCount + '</strong> approved test cases to ADO.</p>';
            document.getElementById('confirmationModal').style.display = 'flex';
        }
        if (target.id === 'confirmPushBtn') {
            const approvedTestCases = testCases.filter(tc => tc.status === 'Approved');
            const pushNotes = document.getElementById('pushNotes').value;
            vscode.postMessage({ command: "finalPush", testCases: approvedTestCases, pushNotes });
            document.getElementById('confirmationModal').style.display = 'none';
        }
        if (target.classList.contains('modal-close')) {
            document.getElementById('confirmationModal').style.display = 'none';
        }
        if (target.id === 'addNewTestBtn') {
            addNewTestCase();
        }
    });

    document.addEventListener('input', (e) => {
        const target = e.target;
        if (target.matches('.test-case-title-input')) {
            handleTitleChange(e);
            sendSaveChangesMessage();
        } else if (target.matches('.review-comment-input')) {
            handleCommentChange(e);
            sendSaveChangesMessage();
        } else if (target.matches('.step-input-action') || target.matches('.step-input-expected')) {
            handleStepInput(e);
            sendSaveChangesMessage();
        }
    });

    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target.matches('.review-status-select')) {
            handleStatusChange(e);
            sendSaveChangesMessage();
        }
        if (target.matches('.test-case-checkbox')) {
            toggleBulkActionButtons();
        }
    });
    
    document.addEventListener('keypress', (e) => {
        const target = e.target;
        // Check if the target is the test case title input and the key is the space bar
        if (target.matches('.test-case-title-input') && e.key === ' ') {
            e.stopPropagation();
        }
    });
</script>
</body>
</html>
`;
}