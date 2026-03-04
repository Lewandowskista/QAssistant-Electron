import { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell, Notification, Tray, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
const isDev = process.env.NODE_ENV === "development";
let APP_DATA_DIR;
let PROJECTS_FILE;
let CREDENTIALS_FILE;
let ATTACHMENTS_DIR;
let SETTINGS_FILE;
let mainWindow = null;
let tray = null;
let isQuitting = false;
const BLOCKED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".ps1",
  ".psm1",
  ".psd1",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".wsf",
  ".wsh",
  ".scr",
  ".pif",
  ".application",
  ".gadget",
  ".msp",
  ".mst",
  ".jar",
  ".reg",
  ".inf",
  ".lnk",
  ".url",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ksh",
  ".elf",
  ".bin",
  ".dmg",
  ".pkg",
  ".deb",
  ".rpm",
  ".apk",
  ".dll",
  ".so",
  ".dylib",
  ".sys",
  ".drv"
]);
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hidden",
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname$1, "../preload/preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
    }
  });
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow?.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow?.loadFile(path.join(__dirname$1, "../renderer/index.html"));
  }
  mainWindow?.on("maximize", () => {
    mainWindow?.webContents.send("window-maximized-status", true);
  });
  mainWindow?.on("unmaximize", () => {
    mainWindow?.webContents.send("window-maximized-status", false);
  });
  mainWindow?.on("close", (event) => {
    if (!isQuitting) {
      try {
        if (fs.existsSync(SETTINGS_FILE)) {
          const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
          if (settings.minimizeToTray) {
            event.preventDefault();
            mainWindow?.hide();
            return;
          }
        }
      } catch (e) {
        console.error("Error reading settings for tray behavior:", e);
      }
    }
  });
  mainWindow?.on("closed", () => {
    mainWindow = null;
  });
  globalShortcut.register("CommandOrControl+Shift+S", () => {
    mainWindow?.show();
    mainWindow?.webContents.send("trigger-command-palette");
  });
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    mainWindow?.show();
    mainWindow?.webContents.send("trigger-add-task");
  });
}
function setupIpc() {
  ipcMain.handle("get-app-data-path", () => APP_DATA_DIR);
  ipcMain.handle("read-projects-file", () => {
    try {
      if (!fs.existsSync(PROJECTS_FILE)) return [];
      return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8"));
    } catch {
      return [];
    }
  });
  ipcMain.handle("write-projects-file", async (_, projects) => {
    try {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("read-settings-file", () => {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) return {};
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    } catch {
      return {};
    }
  });
  ipcMain.handle("write-settings-file", async (_, settings) => {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("secure-store-set", async (_, key, value) => {
    try {
      let credentials = {};
      if (fs.existsSync(CREDENTIALS_FILE)) {
        credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
      }
      credentials[key] = value;
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("secure-store-get", async (_, key) => {
    try {
      if (!fs.existsSync(CREDENTIALS_FILE)) return null;
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
      return credentials[key] || null;
    } catch {
      return null;
    }
  });
  ipcMain.handle("secure-store-delete", async (_, key) => {
    try {
      if (!fs.existsSync(CREDENTIALS_FILE)) return { success: true };
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
      delete credentials[key];
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.on("window-minimize", () => mainWindow?.minimize());
  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window-close", () => {
    if (!isQuitting) mainWindow?.hide();
  });
  ipcMain.handle("select-file", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
        { name: "Documents", extensions: ["pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "csv"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("copy-to-attachments", async (_, sourcePath) => {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: "Source file does not exist." };
      }
      const ext = path.extname(sourcePath).toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) {
        return { success: false, error: `File type '${ext}' is not allowed for security reasons.` };
      }
      const fileName = `${Date.now()}-${path.basename(sourcePath)}`;
      const destPath = path.join(ATTACHMENTS_DIR, fileName);
      const stats = fs.statSync(sourcePath);
      if (stats.size > 50 * 1024 * 1024) {
        return { success: false, error: "File size exceeds 50MB limit." };
      }
      fs.copyFileSync(sourcePath, destPath);
      return { success: true, path: destPath, fileName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("delete-attachment", async (_, filePath) => {
    try {
      if (!filePath.startsWith(ATTACHMENTS_DIR)) {
        return { success: false, error: "Access denied: path is outside attachments directory." };
      }
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("open-file", async (_, filePath) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("open-url", async (_, url) => {
    try {
      const parsed = new URL(url);
      if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)) {
        return { success: false, error: "Cannot open local network URLs." };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("sync-linear", async (_, { apiKey, teamKey, connectionId }) => {
    const { fetchLinearIssues } = await import("./integrations-Bz2dOfWl.js");
    return await fetchLinearIssues(apiKey, teamKey, connectionId);
  });
  ipcMain.handle("get-linear-comments", async (_, { apiKey, issueId }) => {
    const { getLinearComments } = await import("./integrations-Bz2dOfWl.js");
    return await getLinearComments(apiKey, issueId);
  });
  ipcMain.handle("add-linear-comment", async (_, { apiKey, issueId, body }) => {
    const { addLinearComment } = await import("./integrations-Bz2dOfWl.js");
    await addLinearComment(apiKey, issueId, body);
    return { success: true };
  });
  ipcMain.handle("get-linear-workflow-states", async (_, { apiKey }) => {
    const { getLinearWorkflowStates } = await import("./integrations-Bz2dOfWl.js");
    return await getLinearWorkflowStates(apiKey);
  });
  ipcMain.handle("update-linear-status", async (_, { apiKey, issueId, stateId }) => {
    const { updateLinearIssueStatus } = await import("./integrations-Bz2dOfWl.js");
    await updateLinearIssueStatus(apiKey, issueId, stateId);
    return { success: true };
  });
  ipcMain.handle("get-linear-history", async (_, { apiKey, issueId }) => {
    const { getLinearIssueHistory } = await import("./integrations-Bz2dOfWl.js");
    return await getLinearIssueHistory(apiKey, issueId);
  });
  ipcMain.handle("create-linear-issue", async (_, { apiKey, teamId, title, description, priority }) => {
    const { createLinearIssue } = await import("./integrations-Bz2dOfWl.js");
    return await createLinearIssue(apiKey, teamId, title, description, priority);
  });
  ipcMain.handle("sync-jira", async (_, { domain, email, apiKey, projectKey, connectionId }) => {
    const { fetchJiraIssues } = await import("./integrations-Bz2dOfWl.js");
    return await fetchJiraIssues(domain, email, apiKey, projectKey, connectionId);
  });
  ipcMain.handle("get-jira-comments", async (_, { domain, email, apiKey, issueKey }) => {
    const { getJiraComments } = await import("./integrations-Bz2dOfWl.js");
    return await getJiraComments(domain, email, apiKey, issueKey);
  });
  ipcMain.handle("add-jira-comment", async (_, { domain, email, apiKey, issueKey, body }) => {
    const { addJiraComment } = await import("./integrations-Bz2dOfWl.js");
    await addJiraComment(domain, email, apiKey, issueKey, body);
    return { success: true };
  });
  ipcMain.handle("transition-jira-issue", async (_, { domain, email, apiKey, issueKey, transitionName }) => {
    const { transitionJiraIssue } = await import("./integrations-Bz2dOfWl.js");
    await transitionJiraIssue(domain, email, apiKey, issueKey, transitionName);
    return { success: true };
  });
  ipcMain.handle("get-jira-history", async (_, { domain, email, apiKey, issueKey }) => {
    const { getJiraIssueHistory } = await import("./integrations-Bz2dOfWl.js");
    return await getJiraIssueHistory(domain, email, apiKey, issueKey);
  });
  ipcMain.handle("ai-generate-cases", async (_, { apiKey, tasks, sourceName, project, designDoc }) => {
    const { GeminiService } = await import("./gemini-Dv_OpCN_.js");
    const service = new GeminiService(apiKey);
    return await service.generateTestCases(tasks, sourceName || "Manual", project, designDoc);
  });
  ipcMain.handle("ai-analyze-issue", async (_, { apiKey, task, comments, project }) => {
    const { GeminiService } = await import("./gemini-Dv_OpCN_.js");
    const service = new GeminiService(apiKey);
    return await service.analyzeIssue(task, comments || [], project);
  });
  ipcMain.handle("ai-analyze", async (_, { apiKey, context }) => {
    const { GeminiService } = await import("./gemini-Dv_OpCN_.js");
    const service = new GeminiService(apiKey);
    return await service.analyzeProject(context);
  });
  ipcMain.handle("ai-criticality", async (_, { apiKey, tasks, testPlans, executions, project }) => {
    const { GeminiService } = await import("./gemini-Dv_OpCN_.js");
    const service = new GeminiService(apiKey);
    return await service.assessCriticality(tasks, testPlans, executions, project);
  });
  ipcMain.handle("ai-test-run-suggestions", async (_, { apiKey, testPlans, executions, project }) => {
    const { GeminiService } = await import("./gemini-Dv_OpCN_.js");
    const service = new GeminiService(apiKey);
    return await service.getTestRunSuggestions(testPlans, executions, project);
  });
  ipcMain.handle("ai-smoke-subset", async (_, { apiKey, candidates, doneTasks, project }) => {
    const { GeminiService } = await import("./gemini-Dv_OpCN_.js");
    const service = new GeminiService(apiKey);
    return await service.selectSmokeSubset(candidates, doneTasks, project);
  });
  ipcMain.handle("sap-hac-request", async (_, { url, method, headers, body, ignoreSsl }) => {
    try {
      const fetchOpts = {
        method: method || "GET",
        headers: headers || {}
      };
      if (body) fetchOpts.body = body;
      const res = await fetch(url, fetchOpts);
      const text = await res.text();
      return { success: true, status: res.status, body: text, headers: Object.fromEntries(res.headers.entries()) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.on("show-notification", (_, { title, body }) => {
    if (Notification.isSupported()) {
      const n = new Notification({ title, body, silent: false });
      n.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      n.show();
    }
  });
  ipcMain.on("app-quit", () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.on("set-always-on-top", (_, flag) => {
    mainWindow?.setAlwaysOnTop(flag, "screen-saver");
  });
  ipcMain.handle("get-app-version", () => app.getVersion());
  ipcMain.handle("get-system-info", () => ({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    appVersion: app.getVersion()
  }));
  ipcMain.handle("save-file-dialog", async (_, { defaultName, content }) => {
    if (!mainWindow) return { success: false, error: "No window" };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [
        { name: "CSV Files", extensions: ["csv"] },
        { name: "Markdown", extensions: ["md"] },
        { name: "Text Files", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePath) return { success: false };
    try {
      fs.writeFileSync(result.filePath, content, "utf8");
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("generate-bug-report-task", async (_, { task, environment, reporter, aiAnalysis }) => {
    const { generateBugReportFromTask } = await import("./bug-report-cJC0JOqN.js");
    return generateBugReportFromTask(task, environment, reporter, aiAnalysis);
  });
  ipcMain.handle("generate-bug-report-testcase", async (_, { tc, testPlanName, environment, reporter, executions, aiAnalysis }) => {
    const { generateBugReportFromTestCase } = await import("./bug-report-cJC0JOqN.js");
    return generateBugReportFromTestCase(tc, testPlanName, environment, reporter, executions, aiAnalysis);
  });
  ipcMain.handle("generate-test-cases-csv", async (_, { project, filterPlanIds }) => {
    const { generateTestCasesCsv } = await import("./report-DcjAeI-f.js");
    return generateTestCasesCsv(project, filterPlanIds);
  });
  ipcMain.handle("generate-executions-csv", async (_, { project, filterIds }) => {
    const { generateExecutionsCsv } = await import("./report-DcjAeI-f.js");
    return generateExecutionsCsv(project, filterIds);
  });
  ipcMain.handle("generate-test-summary-markdown", async (_, { project, filterPlanIds, criticalityAssessment }) => {
    const { generateTestSummaryMarkdown } = await import("./report-DcjAeI-f.js");
    return generateTestSummaryMarkdown(project, filterPlanIds, criticalityAssessment);
  });
  ipcMain.handle("parse-csv-string", async (_, { content }) => {
    const { parseCsvString, autoDetectCsvMappings } = await import("./report-DcjAeI-f.js");
    const parsed = parseCsvString(content);
    const mappings = autoDetectCsvMappings(parsed.headers);
    return { ...parsed, mappings };
  });
  ipcMain.handle("read-csv-file", async (_, { filePath }) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const { parseCsvString, autoDetectCsvMappings } = await import("./report-DcjAeI-f.js");
      const parsed = parseCsvString(content);
      const mappings = autoDetectCsvMappings(parsed.headers);
      return { success: true, ...parsed, mappings };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("read-json-file", async (_, { filePath }) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return { success: true, data: JSON.parse(content) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("send-webhook", async (_, { webhook, title, message, color }) => {
    const { sendWebhook } = await import("./webhook-D3fKlbRV.js");
    await sendWebhook(webhook, title, message, color);
    return { success: true };
  });
  ipcMain.handle("notify-test-plan-result", async (_, { webhooks, projectName, planName, passed, failed, total }) => {
    const { notifyTestPlanResult } = await import("./webhook-D3fKlbRV.js");
    await notifyTestPlanResult(webhooks, projectName, planName, passed, failed, total);
    return { success: true };
  });
  ipcMain.handle("check-environments-health", async (_, { environments }) => {
    const { checkEnvironmentsNow } = await import("./health-b8tbo4aA.js");
    return await checkEnvironmentsNow(environments);
  });
  ipcMain.handle("start-health-service", async (_, { environments, intervalMs }) => {
    const { startHealthService } = await import("./health-b8tbo4aA.js");
    startHealthService(environments, intervalMs || 3e4);
    return { success: true };
  });
  ipcMain.handle("stop-health-service", async () => {
    const { stopHealthService } = await import("./health-b8tbo4aA.js");
    stopHealthService();
    return { success: true };
  });
  ipcMain.handle("ccv2-get-environments", async (_, { subscriptionCode, apiToken, apiBase }) => {
    const { ccv2GetEnvironments } = await import("./health-b8tbo4aA.js");
    return await ccv2GetEnvironments(subscriptionCode, apiToken, apiBase);
  });
  ipcMain.handle("ccv2-get-deployments", async (_, { subscriptionCode, apiToken, environmentCode, top, apiBase }) => {
    const { ccv2GetDeployments } = await import("./health-b8tbo4aA.js");
    return await ccv2GetDeployments(subscriptionCode, apiToken, environmentCode, top, apiBase);
  });
  ipcMain.handle("ccv2-get-build", async (_, { subscriptionCode, apiToken, buildCode, apiBase }) => {
    const { ccv2GetBuild } = await import("./health-b8tbo4aA.js");
    return await ccv2GetBuild(subscriptionCode, apiToken, buildCode, apiBase);
  });
  ipcMain.handle("test-linear-connection", async (_, { apiKey }) => {
    const { getLinearTeams } = await import("./integrations-Bz2dOfWl.js");
    return await getLinearTeams(apiKey);
  });
  ipcMain.handle("test-jira-connection", async (_, { domain, email, apiKey }) => {
    const { getJiraProjects } = await import("./integrations-Bz2dOfWl.js");
    return await getJiraProjects(domain, email, apiKey);
  });
  ipcMain.handle("automation-api-start", async (_, { apiToken, port }) => {
    const { startServer } = await import("./server-HrQp6FKp.js");
    startServer(apiToken, port);
    return true;
  });
  ipcMain.handle("automation-api-stop", async () => {
    const { stopServer } = await import("./server-HrQp6FKp.js");
    stopServer();
    return true;
  });
  ipcMain.handle("automation-api-restart", async (_, { apiToken, port }) => {
    const { stopServer, startServer } = await import("./server-HrQp6FKp.js");
    stopServer();
    await new Promise((r) => setTimeout(r, 500));
    startServer(apiToken, port);
    return true;
  });
  ipcMain.handle("automation-api-status", async () => {
    return { running: true };
  });
}
function createTray() {
  const iconPath = isDev ? path.join(__dirname$1, "../../src/assets/tray-icon.png") : path.join(__dirname$1, "../renderer/assets/tray-icon.png");
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "QAssistant",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: "separator" },
    {
      label: "Quick Search (Cmd+Shift+S)",
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send("trigger-command-palette");
      }
    },
    {
      label: "New Task (Cmd+Shift+A)",
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send("trigger-add-task");
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray?.setToolTip("QAssistant");
  tray?.setContextMenu(contextMenu);
  tray?.on("click", () => {
    mainWindow?.isVisible() ? mainWindow.focus() : mainWindow?.show();
  });
}
app.whenReady().then(() => {
  APP_DATA_DIR = path.join(app.getPath("userData"), "QAssistantData");
  PROJECTS_FILE = path.join(APP_DATA_DIR, "projects.json");
  CREDENTIALS_FILE = path.join(APP_DATA_DIR, "credentials.json");
  ATTACHMENTS_DIR = path.join(APP_DATA_DIR, "attachments");
  SETTINGS_FILE = path.join(APP_DATA_DIR, "settings.json");
  if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  setupIpc();
  createWindow();
  createTray();
  let apiToken = "qassistant-automation-token";
  let port = 3030;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      if (settings.automationApiToken) apiToken = settings.automationApiToken;
      if (settings.automationPort) port = parseInt(settings.automationPort, 10);
    }
  } catch {
  }
  import("./server-HrQp6FKp.js").then(({ startServer }) => {
    startServer(apiToken, port);
  }).catch(console.error);
  import("./reminders-BbPcP6w4.js").then(({ startReminderService }) => {
    startReminderService(PROJECTS_FILE);
  }).catch(console.error);
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
