/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = (function() {
    try {
        const e = require('electron');
        if (typeof e === 'object') return e;
    } catch {} // eslint-disable-line no-empty

    // In preload, shadowing is rarer but possible if someone messed with the the sandbox
    return require('electron');
})();
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Wrapper around ipcRenderer.invoke that normalises the two main-process error
 * patterns into a thrown Error so callers only need a single try/catch:
 *   • { __isError: true, message }  – used by AI handlers
 *   • { success: false, error }     – used by file/report handlers
 */
async function invoke(channel: string, ...args: any[]): Promise<any> {
    const res = await ipcRenderer.invoke(channel, ...args);
    if (res && typeof res === 'object') {
        if (res.__isError) throw new Error(res.message ?? channel);
    }
    return res;
}

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onMaximizedStatus: (callback: (status: boolean) => void) => {
    const listener = (_event: any, value: boolean) => callback(value);
    ipcRenderer.on('window-maximized-status', listener);
    return () => ipcRenderer.removeListener('window-maximized-status', listener);
  },
  onCommandPalette: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('open-command-palette', listener);
    return () => ipcRenderer.removeListener('open-command-palette', listener);
  },
  onAddTask: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('add-task', listener);
    return () => ipcRenderer.removeListener('add-task', listener);
  },
  onOpenSettings: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('open-settings', listener);
    return () => ipcRenderer.removeListener('open-settings', listener);
  },
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  readProjectsFile: () => ipcRenderer.invoke('read-projects-file'),
  writeProjectsFile: (data: any) => ipcRenderer.invoke('write-projects-file', data),
  readSettingsFile: () => ipcRenderer.invoke('read-settings-file'),
  writeSettingsFile: (data: any) => ipcRenderer.invoke('write-settings-file', data),
  getCredentialStorageStatus: () => ipcRenderer.invoke('get-credential-storage-status'),
  scanOrphanedAttachments: (referencedPaths: string[]) => ipcRenderer.invoke('scan-orphaned-attachments', { referencedPaths }),
  deleteOrphanedAttachments: (filePaths: string[]) => ipcRenderer.invoke('delete-orphaned-attachments', { filePaths }),
  secureStoreSet: (key: string, value: string) => ipcRenderer.invoke('secure-store-set', key, value),
  secureStoreGet: (key: string) => ipcRenderer.invoke('secure-store-get', key),
  secureStoreDelete: (key: string) => ipcRenderer.invoke('secure-store-delete', key),
  secureStoreList: () => ipcRenderer.invoke('secure-store-list'),
  selectFile: (filters?: { name: string; extensions: string[] }[]) => ipcRenderer.invoke('select-file', filters),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  aiGenerateCases: (args: any) => invoke('ai-generate-cases', args),
  aiListModels: (args: any) => invoke('ai-list-models', args),
  aiAnalyzeIssue: (args: any) => invoke('ai-analyze-issue', args),
  aiAnalyze: (args: any) => invoke('ai-analyze', args),
  aiCriticality: (args: any) => invoke('ai-criticality', args),
  aiTestRunSuggestions: (args: any) => invoke('ai-test-run-suggestions', args),
  aiSmokeSubset: (args: any) => invoke('ai-smoke-subset', args),
  aiChat: (args: any) => invoke('ai-chat', args),
  readCsvFile: (args: any) => ipcRenderer.invoke('read-csv-file', typeof args === 'string' ? { filePath: args } : args),
  saveFileDialog: (args: any, content?: string) => ipcRenderer.invoke('save-file-dialog', typeof args === 'string' ? { defaultName: args, content } : args),
  generateTestSummaryMarkdown: (project: any, filterPlanIds?: string[], aiResult?: string) => ipcRenderer.invoke('generate-test-summary-markdown', { project, filterPlanIds, aiResult }),
  generateTestCasesCsv: (project: any) => ipcRenderer.invoke('generate-test-cases-csv', { project }),
  generateExecutionsCsv: (project: any) => ipcRenderer.invoke('generate-executions-csv', { project }),
  exportTestSummaryPdf: (project: any, filterPlanIds?: string[], aiResult?: string) => ipcRenderer.invoke('export-test-summary-pdf', { project, filterPlanIds, aiResult }),
  syncLinear: (args: any) => ipcRenderer.invoke('sync-linear', args),
  getLinearComments: (args: any) => ipcRenderer.invoke('get-linear-comments', args),
  addLinearComment: (args: any) => ipcRenderer.invoke('add-linear-comment', args),
  getLinearWorkflowStates: (args: any) => ipcRenderer.invoke('get-linear-workflow-states', args),
  updateLinearStatus: (args: any) => ipcRenderer.invoke('update-linear-status', args),
  getLinearHistory: (args: any) => ipcRenderer.invoke('get-linear-history', args),
  createLinearIssue: (args: any) => ipcRenderer.invoke('create-linear-issue', args),
  syncJira: (args: any) => ipcRenderer.invoke('sync-jira', args),
  getJiraComments: (args: any) => ipcRenderer.invoke('get-jira-comments', args),
  addJiraComment: (args: any) => ipcRenderer.invoke('add-jira-comment', args),
  transitionJiraIssue: (args: any) => ipcRenderer.invoke('transition-jira-issue', args),
  getJiraHistory: (args: any) => ipcRenderer.invoke('get-jira-history', args),
  getJiraStatuses: (args: any) => ipcRenderer.invoke('get-jira-statuses', args),
  createJiraIssue: (args: any) => ipcRenderer.invoke('create-jira-issue', args),
  automationApiStart: (args: any) => ipcRenderer.invoke('automation-api-start', args),
  automationApiStop: () => ipcRenderer.invoke('automation-api-stop'),
  automationApiRestart: (args: any) => ipcRenderer.invoke('automation-api-restart', args),
  automationApiStatus: () => ipcRenderer.invoke('automation-api-status'),
  testLinearConnection: (args: any) => ipcRenderer.invoke('test-linear-connection', args),
  testJiraConnection: (args: any) => ipcRenderer.invoke('test-jira-connection', args),
  ccv2GetEnvironments: (args: any) => ipcRenderer.invoke('ccv2-get-environments', args),
  ccv2GetDeployments: (args: any) => ipcRenderer.invoke('ccv2-get-deployments', args),
  ccv2GetBuild: (args: any) => ipcRenderer.invoke('ccv2-get-build', args),
  copyToAttachments: (sourcePath: string) => ipcRenderer.invoke('copy-to-attachments', sourcePath),
  saveBytesAttachment: (bytes: Uint8Array, fileName: string) => ipcRenderer.invoke('save-bytes-attachment', { bytes, fileName }),
  deleteAttachment: (args: any) => ipcRenderer.invoke('delete-attachment', typeof args === 'string' ? { filePath: args } : args),
  readAttachmentPreview: (args: any) => ipcRenderer.invoke('read-attachment-preview', typeof args === 'string' ? { filePath: args } : args),
  generateBugReportTask: (args: { task: any, environment?: string, reporter?: string, aiAnalysis?: string }) => ipcRenderer.invoke('generate-bug-report-task', args),
  generateBugReportTestcase: (args: { tc: any, testPlanName?: string, environment?: string, reporter?: string, executions?: any[], aiAnalysis?: string }) => ipcRenderer.invoke('generate-bug-report-testcase', args),
  readJsonFile: (args: any) => ipcRenderer.invoke('read-json-file', typeof args === 'string' ? { filePath: args } : args),
  checkEnvironmentsHealth: (environments: any[]) => ipcRenderer.invoke('check-environments-health', { environments }),
  startHealthService: (environments: any[], intervalMs?: number) => ipcRenderer.invoke('start-health-service', { environments, intervalMs }),
  stopHealthService: () => ipcRenderer.invoke('stop-health-service'),
  openFile: (args: any) => ipcRenderer.invoke('open-file', typeof args === 'string' ? { filePath: args } : args),
  showNotification: (title: string, body: string) => ipcRenderer.send('show-notification', { title, body }),
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('set-always-on-top', flag),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  isMinimizedToTray: () => ipcRenderer.invoke('is-minimized-to-tray'),
  sapHacLogin: (baseUrl: string, user: string, pass: string, ignoreSsl?: boolean) => ipcRenderer.invoke('sap-hac-login', { baseUrl, user, pass, ignoreSsl }),
  sapHacGetCronJobs: (baseUrl: string) => ipcRenderer.invoke('sap-hac-get-cronjobs', { baseUrl }),
  sapHacFlexibleSearch: (baseUrl: string, query: string, max?: number) => ipcRenderer.invoke('sap-hac-flexible-search', { baseUrl, query, max }),
  sapHacImportImpEx: (baseUrl: string, script: string, enableCode?: boolean) => ipcRenderer.invoke('sap-hac-import-impex', { baseUrl, script, enableCode }),
  sapHacGetCatalogVersions: (baseUrl: string) => ipcRenderer.invoke('sap-hac-get-catalog-versions', { baseUrl }),
  sapHacGetCatalogIds: (baseUrl: string) => ipcRenderer.invoke('sap-hac-get-catalog-ids', { baseUrl }),
  sapHacGetCatalogSyncDiff: (baseUrl: string, catalogId: string, maxMissing?: number) => ipcRenderer.invoke('sap-hac-get-catalog-sync-diff', { baseUrl, catalogId, maxMissing }),
  appQuit: () => ipcRenderer.send('app-quit'),

  // User profile
  readUserProfile: () => ipcRenderer.invoke('read-user-profile'),
  writeUserProfile: (data: any) => ipcRenderer.invoke('write-user-profile', data),

  // OAuth
  oauthStart: (provider: string) => ipcRenderer.invoke('oauth-start', { provider }),
  oauthLogout: (provider: string) => ipcRenderer.invoke('oauth-logout', { provider }),
  oauthGetStatus: (provider: string) => ipcRenderer.invoke('oauth-get-status', { provider }),
  onOAuthComplete: (callback: (data: { provider: string; userInfo: any }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('oauth-complete', listener);
    return () => ipcRenderer.removeListener('oauth-complete', listener);
  },

  // GitHub Integration
  githubCheckScope: () => ipcRenderer.invoke('github-check-scope'),
  githubGetRepos: (args?: any) => ipcRenderer.invoke('github-get-repos', args || {}),
  githubGetPullRequests: (args: any) => ipcRenderer.invoke('github-get-pull-requests', args),
  githubGetPrDetail: (args: any) => ipcRenderer.invoke('github-get-pr-detail', args),
  githubGetPrReviews: (args: any) => ipcRenderer.invoke('github-get-pr-reviews', args),
  githubGetPrCheckStatus: (args: any) => ipcRenderer.invoke('github-get-pr-check-status', args),
  githubGetCommits: (args: any) => ipcRenderer.invoke('github-get-commits', args),
  githubGetBranches: (args: any) => ipcRenderer.invoke('github-get-branches', args),
  githubGetReviewRequests: (args?: any) => ipcRenderer.invoke('github-get-review-requests', args || {}),
  githubGetMyOpenPrs: (args?: any) => ipcRenderer.invoke('github-get-my-open-prs', args || {}),
  githubGetWorkflowRuns: (args: any) => ipcRenderer.invoke('github-get-workflow-runs', args),
  githubGetDeployments: (args: any) => ipcRenderer.invoke('github-get-deployments', args),
  githubRerunWorkflow: (args: any) => ipcRenderer.invoke('github-rerun-workflow', args),
  githubGetPrComments: (args: any) => ipcRenderer.invoke('github-get-pr-comments', args),
  githubGetWorkflowJobs: (args: any) => ipcRenderer.invoke('github-get-workflow-jobs', args),
  githubGetWorkflowsList: (args: any) => ipcRenderer.invoke('github-get-workflows-list', args),
  githubDispatchWorkflow: (args: any) => ipcRenderer.invoke('github-dispatch-workflow', args),

  // Report Builder (M1)
  generateCustomReport: (args: any) => ipcRenderer.invoke('generate-custom-report', args),
  exportCustomReportPdf: (args: any) => ipcRenderer.invoke('export-custom-report-pdf', args),

  // AI Accuracy Testing
  readDocumentText: (args: any) => ipcRenderer.invoke('read-document-text', typeof args === 'string' ? { filePath: args } : args),
  aiAccuracyExtractClaims: (args: any) => invoke('ai-accuracy-extract-claims', args),
  aiAccuracyVerifyClaims: (args: any) => invoke('ai-accuracy-verify-claims', args),
  aiAccuracyScoreDimensions: (args: any) => invoke('ai-accuracy-score-dimensions', args),
  aiAccuracyRerankChunks: (args: any) => invoke('ai-accuracy-rerank-chunks', args),
});
