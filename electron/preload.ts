import electron from 'electron';
const { contextBridge, ipcRenderer } = (electron as any).default || electron;

contextBridge.exposeInMainWorld('electronAPI', {
    // ── Data persistence ─────────────────────────────────────────────────
    getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
    readProjectsFile: () => ipcRenderer.invoke('read-projects-file'),
    writeProjectsFile: (data: unknown) => ipcRenderer.invoke('write-projects-file', data),
    readSettingsFile: () => ipcRenderer.invoke('read-settings-file'),
    writeSettingsFile: (data: unknown) => ipcRenderer.invoke('write-settings-file', data),

    // ── Credentials / Secure store ───────────────────────────────────────
    secureStoreSet: (key: string, value: string) => ipcRenderer.invoke('secure-store-set', key, value),
    secureStoreGet: (key: string) => ipcRenderer.invoke('secure-store-get', key),
    secureStoreDelete: (key: string) => ipcRenderer.invoke('secure-store-delete', key),

    // ── Window controls ──────────────────────────────────────────────────
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    onMaximizedStatus: (callback: (isMaximized: boolean) => void) => {
        const listener = (_event: any, isMaximized: boolean) => callback(isMaximized);
        ipcRenderer.on('window-maximized-status', listener);
        return () => ipcRenderer.removeListener('window-maximized-status', listener);
    },

    // ── File operations ──────────────────────────────────────────────────
    selectFile: () => ipcRenderer.invoke('select-file'),
    copyToAttachments: (sourcePath: string) => ipcRenderer.invoke('copy-to-attachments', sourcePath),
    deleteAttachment: (filePath: string) => ipcRenderer.invoke('delete-attachment', filePath),
    openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
    openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
    saveFileDialog: (defaultName: string, content: string) =>
        ipcRenderer.invoke('save-file-dialog', { defaultName, content }),

    // ── Linear integration ───────────────────────────────────────────────
    syncLinear: (args: any) => ipcRenderer.invoke('sync-linear', args),
    getLinearComments: (args: any) => ipcRenderer.invoke('get-linear-comments', args),
    addLinearComment: (args: any) => ipcRenderer.invoke('add-linear-comment', args),
    getLinearWorkflowStates: (args: any) => ipcRenderer.invoke('get-linear-workflow-states', args),
    updateLinearStatus: (args: any) => ipcRenderer.invoke('update-linear-status', args),
    getLinearHistory: (args: any) => ipcRenderer.invoke('get-linear-history', args),
    createLinearIssue: (args: any) => ipcRenderer.invoke('create-linear-issue', args),

    // ── Jira integration ─────────────────────────────────────────────────
    syncJira: (args: any) => ipcRenderer.invoke('sync-jira', args),
    getJiraComments: (args: any) => ipcRenderer.invoke('get-jira-comments', args),
    addJiraComment: (args: any) => ipcRenderer.invoke('add-jira-comment', args),
    transitionJiraIssue: (args: any) => ipcRenderer.invoke('transition-jira-issue', args),
    getJiraHistory: (args: any) => ipcRenderer.invoke('get-jira-history', args),

    // ── AI / Gemini ───────────────────────────────────────────────────────
    aiGenerateCases: (args: any) => ipcRenderer.invoke('ai-generate-cases', args),
    aiAnalyzeIssue: (args: any) => ipcRenderer.invoke('ai-analyze-issue', args),
    aiAnalyze: (apiKey: string, context: string) => ipcRenderer.invoke('ai-analyze', { apiKey, context }),
    aiCriticality: (apiKey: string, tasks: any[], testPlans: any[], executions: any[], project?: any) =>
        ipcRenderer.invoke('ai-criticality', { apiKey, tasks, testPlans, executions, project }),
    aiTestRunSuggestions: (apiKey: string, testPlans: any[], executions: any[], project?: any) =>
        ipcRenderer.invoke('ai-test-run-suggestions', { apiKey, testPlans, executions, project }),
    aiSmokeSubset: (apiKey: string, candidates: any[], doneTasks: any[], project?: any) =>
        ipcRenderer.invoke('ai-smoke-subset', { apiKey, candidates, doneTasks, project }),

    // ── SAP HAC ──────────────────────────────────────────────────────────
    sapHacRequest: (opts: { url: string; method: string; headers?: Record<string, string>; body?: string; ignoreSsl?: boolean }) =>
        ipcRenderer.invoke('sap-hac-request', opts),

    // ── Bug Report service ────────────────────────────────────────────────
    generateBugReportFromTask: (task: any, environment?: string, reporter?: string, aiAnalysis?: string) =>
        ipcRenderer.invoke('generate-bug-report-task', { task, environment, reporter, aiAnalysis }),
    generateBugReportFromTestCase: (tc: any, testPlanName?: string, environment?: string, reporter?: string, executions?: any[], aiAnalysis?: string) =>
        ipcRenderer.invoke('generate-bug-report-testcase', { tc, testPlanName, environment, reporter, executions, aiAnalysis }),

    // ── Report / CSV service ──────────────────────────────────────────────
    generateTestCasesCsv: (project: any, filterPlanIds?: string[]) =>
        ipcRenderer.invoke('generate-test-cases-csv', { project, filterPlanIds }),
    generateExecutionsCsv: (project: any, filterIds?: string[]) =>
        ipcRenderer.invoke('generate-executions-csv', { project, filterIds }),
    generateTestSummaryMarkdown: (project: any, filterPlanIds?: string[], criticalityAssessment?: string) =>
        ipcRenderer.invoke('generate-test-summary-markdown', { project, filterPlanIds, criticalityAssessment }),
    parseCsvString: (content: string) =>
        ipcRenderer.invoke('parse-csv-string', { content }),
    readCsvFile: (filePath: string) =>
        ipcRenderer.invoke('read-csv-file', { filePath }),
    readJsonFile: (filePath: string) =>
        ipcRenderer.invoke('read-json-file', { filePath }),

    // ── Webhook service ────────────────────────────────────────────────────
    sendWebhook: (webhook: any, title: string, message: string, color?: string) =>
        ipcRenderer.invoke('send-webhook', { webhook, title, message, color }),
    notifyTestPlanResult: (webhooks: any[], projectName: string, planName: string, passed: number, failed: number, total: number) =>
        ipcRenderer.invoke('notify-test-plan-result', { webhooks, projectName, planName, passed, failed, total }),

    // ── Environment health ────────────────────────────────────────────────
    checkEnvironmentsHealth: (environments: any[]) =>
        ipcRenderer.invoke('check-environments-health', { environments }),
    startHealthService: (environments: any[], intervalMs?: number) =>
        ipcRenderer.invoke('start-health-service', { environments, intervalMs }),
    stopHealthService: () => ipcRenderer.invoke('stop-health-service'),

    // ── CCv2 Management API ───────────────────────────────────────────────
    ccv2GetEnvironments: (subscriptionCode: string, apiToken: string, apiBase?: string) =>
        ipcRenderer.invoke('ccv2-get-environments', { subscriptionCode, apiToken, apiBase }),
    ccv2GetDeployments: (subscriptionCode: string, apiToken: string, environmentCode?: string, top?: number, apiBase?: string) =>
        ipcRenderer.invoke('ccv2-get-deployments', { subscriptionCode, apiToken, environmentCode, top, apiBase }),
    ccv2GetBuild: (subscriptionCode: string, apiToken: string, buildCode: string, apiBase?: string) =>
        ipcRenderer.invoke('ccv2-get-build', { subscriptionCode, apiToken, buildCode, apiBase }),

    // ── Notifications & shortcuts ─────────────────────────────────────────
    showNotification: (title: string, body: string) => ipcRenderer.send('show-notification', { title, body }),
    onCommandPalette: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('trigger-command-palette', listener);
        return () => ipcRenderer.removeListener('trigger-command-palette', listener);
    },
    onAddTask: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('trigger-add-task', listener);
        return () => ipcRenderer.removeListener('trigger-add-task', listener);
    },

    // ── System ────────────────────────────────────────────────────────────
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('set-always-on-top', flag),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    quit: () => ipcRenderer.send('app-quit'),

    testLinearConnection: (apiKey: string) => ipcRenderer.invoke('test-linear-connection', { apiKey }),
    testJiraConnection: (domain: string, email: string, apiKey: string) => ipcRenderer.invoke('test-jira-connection', { domain, email, apiKey }),

    automationApiStart: (apiToken: string, port: number) => ipcRenderer.invoke('automation-api-start', { apiToken, port }),
    automationApiStop: () => ipcRenderer.invoke('automation-api-stop'),
    automationApiRestart: (apiToken: string, port: number) => ipcRenderer.invoke('automation-api-restart', { apiToken, port }),
    automationApiStatus: () => ipcRenderer.invoke('automation-api-status'),
});
