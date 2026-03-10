const { contextBridge, ipcRenderer } = (function() {
    try {
        const e = require('electron');
        if (typeof e === 'object') return e;
    } catch {}
    
    // In preload, shadowing is rarer but possible if someone messed with the the sandbox
    return require('electron');
})();

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
  secureStoreSet: (key: string, value: string) => ipcRenderer.invoke('secure-store-set', key, value),
  secureStoreGet: (key: string) => ipcRenderer.invoke('secure-store-get', key),
  secureStoreDelete: (key: string) => ipcRenderer.invoke('secure-store-delete', key),
  secureStoreList: () => ipcRenderer.invoke('secure-store-list'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  aiGenerateCases: async (args: any) => { const res = await ipcRenderer.invoke('ai-generate-cases', args); if (res?.__isError) throw new Error(res.message); return res; },
  aiListModels: async (args: any) => { const res = await ipcRenderer.invoke('ai-list-models', args); if (res?.__isError) throw new Error(res.message); return res; },
  aiAnalyzeIssue: async (args: any) => { const res = await ipcRenderer.invoke('ai-analyze-issue', args); if (res?.__isError) throw new Error(res.message); return res; },
  aiAnalyze: async (args: any) => { const res = await ipcRenderer.invoke('ai-analyze', args); if (res?.__isError) throw new Error(res.message); return res; },
  aiCriticality: async (args: any) => { const res = await ipcRenderer.invoke('ai-criticality', args); if (res?.__isError) throw new Error(res.message); return res; },
  aiTestRunSuggestions: async (args: any) => { const res = await ipcRenderer.invoke('ai-test-run-suggestions', args); if (res?.__isError) throw new Error(res.message); return res; },
  aiSmokeSubset: async (args: any) => { const res = await ipcRenderer.invoke('ai-smoke-subset', args); if (res?.__isError) throw new Error(res.message); return res; },
  readCsvFile: (filePath: string) => ipcRenderer.invoke('read-csv-file', { filePath }),
  saveFileDialog: (defaultName: string, content: string) => ipcRenderer.invoke('save-file-dialog', { defaultName, content }),
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
  deleteAttachment: (filePath: string) => ipcRenderer.invoke('delete-attachment', filePath),
  generateBugReportTask: (args: { task: any, environment?: string, reporter?: string, aiAnalysis?: string }) => ipcRenderer.invoke('generate-bug-report-task', args),
  generateBugReportTestcase: (args: { tc: any, testPlanName?: string, environment?: string, reporter?: string, executions?: any[], aiAnalysis?: string }) => ipcRenderer.invoke('generate-bug-report-testcase', args),
  readJsonFile: (filePath: string) => ipcRenderer.invoke('read-json-file', { filePath }),
  checkEnvironmentsHealth: (environments: any[]) => ipcRenderer.invoke('check-environments-health', { environments }),
  startHealthService: (environments: any[], intervalMs?: number) => ipcRenderer.invoke('start-health-service', { environments, intervalMs }),
  stopHealthService: () => ipcRenderer.invoke('stop-health-service'),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', { filePath }),
  showNotification: (title: string, body: string) => ipcRenderer.send('show-notification', { title, body }),
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('set-always-on-top', flag),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  isMinimizedToTray: () => ipcRenderer.invoke('is-minimized-to-tray'),
  appQuit: () => ipcRenderer.send('app-quit')
});
