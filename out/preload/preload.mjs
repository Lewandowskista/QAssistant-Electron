import electron from "electron";
const { contextBridge, ipcRenderer } = electron.default || electron;
contextBridge.exposeInMainWorld("electronAPI", {
  // ── Data persistence ─────────────────────────────────────────────────
  getAppDataPath: () => ipcRenderer.invoke("get-app-data-path"),
  readProjectsFile: () => ipcRenderer.invoke("read-projects-file"),
  writeProjectsFile: (data) => ipcRenderer.invoke("write-projects-file", data),
  readSettingsFile: () => ipcRenderer.invoke("read-settings-file"),
  writeSettingsFile: (data) => ipcRenderer.invoke("write-settings-file", data),
  // ── Credentials / Secure store ───────────────────────────────────────
  secureStoreSet: (key, value) => ipcRenderer.invoke("secure-store-set", key, value),
  secureStoreGet: (key) => ipcRenderer.invoke("secure-store-get", key),
  secureStoreDelete: (key) => ipcRenderer.invoke("secure-store-delete", key),
  // ── Window controls ──────────────────────────────────────────────────
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onMaximizedStatus: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window-maximized-status", listener);
    return () => ipcRenderer.removeListener("window-maximized-status", listener);
  },
  // ── File operations ──────────────────────────────────────────────────
  selectFile: () => ipcRenderer.invoke("select-file"),
  copyToAttachments: (sourcePath) => ipcRenderer.invoke("copy-to-attachments", sourcePath),
  deleteAttachment: (filePath) => ipcRenderer.invoke("delete-attachment", filePath),
  openFile: (filePath) => ipcRenderer.invoke("open-file", filePath),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  saveFileDialog: (defaultName, content) => ipcRenderer.invoke("save-file-dialog", { defaultName, content }),
  // ── Linear integration ───────────────────────────────────────────────
  syncLinear: (args) => ipcRenderer.invoke("sync-linear", args),
  getLinearComments: (args) => ipcRenderer.invoke("get-linear-comments", args),
  addLinearComment: (args) => ipcRenderer.invoke("add-linear-comment", args),
  getLinearWorkflowStates: (args) => ipcRenderer.invoke("get-linear-workflow-states", args),
  updateLinearStatus: (args) => ipcRenderer.invoke("update-linear-status", args),
  getLinearHistory: (args) => ipcRenderer.invoke("get-linear-history", args),
  createLinearIssue: (args) => ipcRenderer.invoke("create-linear-issue", args),
  // ── Jira integration ─────────────────────────────────────────────────
  syncJira: (args) => ipcRenderer.invoke("sync-jira", args),
  getJiraComments: (args) => ipcRenderer.invoke("get-jira-comments", args),
  addJiraComment: (args) => ipcRenderer.invoke("add-jira-comment", args),
  transitionJiraIssue: (args) => ipcRenderer.invoke("transition-jira-issue", args),
  getJiraHistory: (args) => ipcRenderer.invoke("get-jira-history", args),
  // ── AI / Gemini ───────────────────────────────────────────────────────
  aiGenerateCases: (args) => ipcRenderer.invoke("ai-generate-cases", args),
  aiAnalyzeIssue: (args) => ipcRenderer.invoke("ai-analyze-issue", args),
  aiAnalyze: (apiKey, context) => ipcRenderer.invoke("ai-analyze", { apiKey, context }),
  aiCriticality: (apiKey, tasks, testPlans, executions, project) => ipcRenderer.invoke("ai-criticality", { apiKey, tasks, testPlans, executions, project }),
  aiTestRunSuggestions: (apiKey, testPlans, executions, project) => ipcRenderer.invoke("ai-test-run-suggestions", { apiKey, testPlans, executions, project }),
  aiSmokeSubset: (apiKey, candidates, doneTasks, project) => ipcRenderer.invoke("ai-smoke-subset", { apiKey, candidates, doneTasks, project }),
  // ── SAP HAC ──────────────────────────────────────────────────────────
  sapHacRequest: (opts) => ipcRenderer.invoke("sap-hac-request", opts),
  // ── Bug Report service ────────────────────────────────────────────────
  generateBugReportFromTask: (task, environment, reporter, aiAnalysis) => ipcRenderer.invoke("generate-bug-report-task", { task, environment, reporter, aiAnalysis }),
  generateBugReportFromTestCase: (tc, testPlanName, environment, reporter, executions, aiAnalysis) => ipcRenderer.invoke("generate-bug-report-testcase", { tc, testPlanName, environment, reporter, executions, aiAnalysis }),
  // ── Report / CSV service ──────────────────────────────────────────────
  generateTestCasesCsv: (project, filterPlanIds) => ipcRenderer.invoke("generate-test-cases-csv", { project, filterPlanIds }),
  generateExecutionsCsv: (project, filterIds) => ipcRenderer.invoke("generate-executions-csv", { project, filterIds }),
  generateTestSummaryMarkdown: (project, filterPlanIds, criticalityAssessment) => ipcRenderer.invoke("generate-test-summary-markdown", { project, filterPlanIds, criticalityAssessment }),
  parseCsvString: (content) => ipcRenderer.invoke("parse-csv-string", { content }),
  readCsvFile: (filePath) => ipcRenderer.invoke("read-csv-file", { filePath }),
  readJsonFile: (filePath) => ipcRenderer.invoke("read-json-file", { filePath }),
  // ── Webhook service ────────────────────────────────────────────────────
  sendWebhook: (webhook, title, message, color) => ipcRenderer.invoke("send-webhook", { webhook, title, message, color }),
  notifyTestPlanResult: (webhooks, projectName, planName, passed, failed, total) => ipcRenderer.invoke("notify-test-plan-result", { webhooks, projectName, planName, passed, failed, total }),
  // ── Environment health ────────────────────────────────────────────────
  checkEnvironmentsHealth: (environments) => ipcRenderer.invoke("check-environments-health", { environments }),
  startHealthService: (environments, intervalMs) => ipcRenderer.invoke("start-health-service", { environments, intervalMs }),
  stopHealthService: () => ipcRenderer.invoke("stop-health-service"),
  // ── CCv2 Management API ───────────────────────────────────────────────
  ccv2GetEnvironments: (subscriptionCode, apiToken, apiBase) => ipcRenderer.invoke("ccv2-get-environments", { subscriptionCode, apiToken, apiBase }),
  ccv2GetDeployments: (subscriptionCode, apiToken, environmentCode, top, apiBase) => ipcRenderer.invoke("ccv2-get-deployments", { subscriptionCode, apiToken, environmentCode, top, apiBase }),
  ccv2GetBuild: (subscriptionCode, apiToken, buildCode, apiBase) => ipcRenderer.invoke("ccv2-get-build", { subscriptionCode, apiToken, buildCode, apiBase }),
  // ── Notifications & shortcuts ─────────────────────────────────────────
  showNotification: (title, body) => ipcRenderer.send("show-notification", { title, body }),
  onCommandPalette: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("trigger-command-palette", listener);
    return () => ipcRenderer.removeListener("trigger-command-palette", listener);
  },
  onAddTask: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("trigger-add-task", listener);
    return () => ipcRenderer.removeListener("trigger-add-task", listener);
  },
  // ── System ────────────────────────────────────────────────────────────
  setAlwaysOnTop: (flag) => ipcRenderer.send("set-always-on-top", flag),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  quit: () => ipcRenderer.send("app-quit"),
  testLinearConnection: (apiKey) => ipcRenderer.invoke("test-linear-connection", { apiKey }),
  testJiraConnection: (domain, email, apiKey) => ipcRenderer.invoke("test-jira-connection", { domain, email, apiKey }),
  automationApiStart: (apiToken, port) => ipcRenderer.invoke("automation-api-start", { apiToken, port }),
  automationApiStop: () => ipcRenderer.invoke("automation-api-stop"),
  automationApiRestart: (apiToken, port) => ipcRenderer.invoke("automation-api-restart", { apiToken, port }),
  automationApiStatus: () => ipcRenderer.invoke("automation-api-status")
});
