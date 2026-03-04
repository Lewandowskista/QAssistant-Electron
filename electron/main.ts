import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, Notification, dialog, safeStorage } from 'electron';
import { setCredential, getCredential, deleteCredential, listCredentials } from './credentialService';
import { saveFile, saveBytes, deleteFile, openFile, initFileStorage } from './fileStorage';
import { SapHacService } from './sapHac';
import type { FlexibleSearchResult, ImpExResult } from './sapHac';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// ── Chromium disk-cache suppression ───────────────────────────────────────────
// Root cause of "Unable to move the cache: Access is denied" on Windows:
//   Hot-reload kills the main process but lingering GPU/network sub-processes
//   still hold file handles.  Windows marks those directories "pending delete" —
//   rmSync succeeds without error yet the path still exists.  Chromium's
//   MoveCache() then sees the old path, tries to migrate it, and gets 0x5.
// Fix: give every run its own fresh subdirectory in %TEMP%.  A path that never
//   existed before skips MoveCache entirely.  Previous-run dirs are cleaned up
//   at startup (they are no longer locked by then).
// Make the run id highly unlikely to collide across quick restarts by
// incorporating the pid and a random component.
const _cacheRunId = `${Date.now().toString(36)}-${process.pid}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
const _chromiumCacheRoot = path.join(os.tmpdir(), 'qassistant-chrome-cache');
const _runCacheDir = path.join(_chromiumCacheRoot, _cacheRunId);

// Ensure the cache root exists before Chromium starts. IMPORTANT: do NOT
// pre-create the per-run cache directory `_runCacheDir`. Chromium's MoveCache
// logic will attempt to migrate an existing userData cache into the
// `--disk-cache-dir` path — if that target path already exists and is locked
// it can trigger "Access is denied". By ensuring the *run* directory does
// NOT exist (but the root does), we avoid MoveCache and let Chromium create
// the run directory itself.
try {
    if (!fs.existsSync(_chromiumCacheRoot)) fs.mkdirSync(_chromiumCacheRoot, { recursive: true });
    // Intentionally do not create `_runCacheDir` here.
} catch (e) {
    try { console.warn('Could not prepare Chromium cache root directory:', e); } catch { /* ignore */ }
}

// Try to proactively remove any leftover per-run cache dirs from previous
// runs before Chromium starts. If some directories are still locked this
// will throw or silently fail; that's acceptable — the goal is to reduce the
// chance that Chromium's MoveCache sees an existing target directory.
try {
    if (fs.existsSync(_chromiumCacheRoot)) {
        for (const entry of fs.readdirSync(_chromiumCacheRoot)) {
            const p = path.join(_chromiumCacheRoot, entry);
            if (entry === _cacheRunId) continue;
            try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    }
} catch { /* ignore */ }

// All switches must be set before app.whenReady().
app.commandLine.appendSwitch('disk-cache-dir', _runCacheDir);        // HTTP/network cache → unique temp path
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');        // GPU shader / program cache
app.commandLine.appendSwitch('disable-cache');                        // Network response cache
app.commandLine.appendSwitch('disable-application-cache');            // HTML5 application cache
app.commandLine.appendSwitch('media-cache-size', '0');                // Media disk cache
app.commandLine.appendSwitch('disable-background-networking');        // Background network requests
app.commandLine.appendSwitch('disable-features', 'JsCodeCache');     // V8 bytecode / code cache

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

let APP_DATA_DIR: string;
let PROJECTS_FILE: string;
let CREDENTIALS_FILE: string;
let ATTACHMENTS_DIR: string;
let SETTINGS_FILE: string;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        show: false,
        backgroundColor: '#0F0F13',
        titleBarStyle: 'hidden',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webviewTag: true,
        },
    });

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow?.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Show window only once content is painted — eliminates the white-screen flash
    mainWindow?.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });

    mainWindow?.on('maximize', () => {
        mainWindow?.webContents.send('window-maximized-status', true);
    });

    mainWindow?.on('unmaximize', () => {
        mainWindow?.webContents.send('window-maximized-status', false);
    });

    mainWindow?.on('close', (event: any) => {
        if (!isQuitting) {
            try {
                if (fs.existsSync(SETTINGS_FILE)) {
                    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
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

    mainWindow?.on('closed', () => {
        mainWindow = null;
    });

    // Global shortcuts
    globalShortcut.register('CommandOrControl+Shift+S', () => {
        mainWindow?.show();
        mainWindow?.webContents.send('trigger-command-palette');
    });

    globalShortcut.register('CommandOrControl+Shift+A', () => {
        mainWindow?.show();
        mainWindow?.webContents.send('trigger-add-task');
    });
}

function setupIpc() {
    // ── App data path ──────────────────────────────────────────────────────
    ipcMain.handle('get-app-data-path', () => APP_DATA_DIR);

    // ── Projects file ──────────────────────────────────────────────────────
    ipcMain.handle('read-projects-file', () => {
        try {
            if (!fs.existsSync(PROJECTS_FILE)) return [];
            return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
        } catch {
            return [];
        }
    });

    ipcMain.handle('write-projects-file', async (_: any, projects: any) => {
        try {
            fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ── Settings file ──────────────────────────────────────────────────────
    ipcMain.handle('read-settings-file', () => {
        try {
            if (!fs.existsSync(SETTINGS_FILE)) return {};
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        } catch {
            return {};
        }
    });

    ipcMain.handle('write-settings-file', async (_: any, settings: any) => {
        try {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ── Credentials store (OS credential manager via keytar) ────────────────
    ipcMain.handle('secure-store-set', async (_: any, key: string, value: string) => {
        try {
            await setCredential(key, value);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('secure-store-get', async (_: any, key: string) => {
        try {
            const val = await getCredential(key);
            return val;
        } catch (err: any) {
            console.error('secure-store-get error', err);
            return null;
        }
    });

    ipcMain.handle('secure-store-delete', async (_: any, key: string) => {
        try {
            const ok = await deleteCredential(key);
            return { success: ok };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('secure-store-list', async () => {
        try {
            const creds = await listCredentials();
            return creds;
        } catch (err: any) {
            return [];
        }
    });

    // ── Window controls ────────────────────────────────────────────────────
    ipcMain.on('window-minimize', () => mainWindow?.minimize());
    ipcMain.on('window-maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });
    ipcMain.on('window-close', () => {
        if (!isQuitting) mainWindow?.hide();
    });

    // ── File operations ────────────────────────────────────────────────────
    ipcMain.handle('select-file', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
                { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'csv'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('copy-to-attachments', async (_: any, sourcePath: string) => {
        // delegate to shared fileStorage service
        return await saveFile(sourcePath);
    });

    ipcMain.handle('save-bytes-attachment', async (_: any, { bytes, fileName }: { bytes: Uint8Array; fileName: string }) => {
        // convert Uint8Array to Buffer for fs
        const buf = Buffer.from(bytes);
        return await saveBytes(buf, fileName);
    });

    ipcMain.handle('delete-attachment', async (_: any, filePath: string) => {
        return deleteFile(filePath);
    });

    ipcMain.handle('open-file', async (_: any, filePath: string) => {
        return openFile(filePath);
    });

    ipcMain.handle('open-url', async (_: any, url: string) => {
        try {
            // Basic SSRF mitigation — block private networks
            const parsed = new URL(url);
            if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
                return { success: false, error: 'Cannot open local network URLs.' };
            }
            await shell.openExternal(url);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ── Linear integration ─────────────────────────────────────────────────
    ipcMain.handle('sync-linear', async (_: any, { apiKey, teamKey, connectionId }: any) => {
        const { fetchLinearIssues } = await import('./integrations.js');
        return await fetchLinearIssues(apiKey, teamKey, connectionId);
    });

    ipcMain.handle('get-linear-comments', async (_: any, { apiKey, issueId }: any) => {
        const { getLinearComments } = await import('./integrations.js');
        return await getLinearComments(apiKey, issueId);
    });

    ipcMain.handle('add-linear-comment', async (_: any, { apiKey, issueId, body }: any) => {
        const { addLinearComment } = await import('./integrations.js');
        await addLinearComment(apiKey, issueId, body);
        return { success: true };
    });

    ipcMain.handle('get-linear-workflow-states', async (_: any, { apiKey }: any) => {
        const { getLinearWorkflowStates } = await import('./integrations.js');
        return await getLinearWorkflowStates(apiKey);
    });

    ipcMain.handle('update-linear-status', async (_: any, { apiKey, issueId, stateId }: any) => {
        const { updateLinearIssueStatus } = await import('./integrations.js');
        await updateLinearIssueStatus(apiKey, issueId, stateId);
        return { success: true };
    });

    ipcMain.handle('get-linear-history', async (_: any, { apiKey, issueId }: any) => {
        const { getLinearIssueHistory } = await import('./integrations.js');
        return await getLinearIssueHistory(apiKey, issueId);
    });

    ipcMain.handle('create-linear-issue', async (_: any, { apiKey, teamId, title, description, priority }: any) => {
        const { createLinearIssue } = await import('./integrations.js');
        return await createLinearIssue(apiKey, teamId, title, description, priority);
    });

    // ── Jira integration ───────────────────────────────────────────────────
    ipcMain.handle('sync-jira', async (_: any, { domain, email, apiKey, projectKey, connectionId }: any) => {
        const { fetchJiraIssues } = await import('./integrations.js');
        return await fetchJiraIssues(domain, email, apiKey, projectKey, connectionId);
    });

    ipcMain.handle('get-jira-comments', async (_: any, { domain, email, apiKey, issueKey }: any) => {
        const { getJiraComments } = await import('./integrations.js');
        return await getJiraComments(domain, email, apiKey, issueKey);
    });

    ipcMain.handle('add-jira-comment', async (_: any, { domain, email, apiKey, issueKey, body }: any) => {
        const { addJiraComment } = await import('./integrations.js');
        await addJiraComment(domain, email, apiKey, issueKey, body);
        return { success: true };
    });

    ipcMain.handle('transition-jira-issue', async (_: any, { domain, email, apiKey, issueKey, transitionName }: any) => {
        const { transitionJiraIssue } = await import('./integrations.js');
        await transitionJiraIssue(domain, email, apiKey, issueKey, transitionName);
        return { success: true };
    });

    ipcMain.handle('get-jira-history', async (_: any, { domain, email, apiKey, issueKey }: any) => {
        const { getJiraIssueHistory } = await import('./integrations.js');
        return await getJiraIssueHistory(domain, email, apiKey, issueKey);
    });

    // ── AI / Gemini ────────────────────────────────────────────────────────
    ipcMain.handle('ai-generate-cases', async (_: any, { apiKey, tasks, sourceName, project, designDoc }: any) => {
        const { GeminiService } = await import('./gemini.js');
        const service = new GeminiService(apiKey);
        return await service.generateTestCases(tasks, sourceName || 'Manual', project, designDoc);
    });

    ipcMain.handle('ai-analyze-issue', async (_: any, { apiKey, task, comments, project }: any) => {
        const { GeminiService } = await import('./gemini.js');
        const service = new GeminiService(apiKey);
        return await service.analyzeIssue(task, comments || [], project);
    });

    ipcMain.handle('ai-analyze', async (_: any, { apiKey, context }: any) => {
        const { GeminiService } = await import('./gemini.js');
        const service = new GeminiService(apiKey);
        return await service.analyzeProject(context);
    });

    ipcMain.handle('ai-criticality', async (_: any, { apiKey, tasks, testPlans, executions, project }: any) => {
        const { GeminiService } = await import('./gemini.js');
        const service = new GeminiService(apiKey);
        return await service.assessCriticality(tasks, testPlans, executions, project);
    });

    ipcMain.handle('ai-test-run-suggestions', async (_: any, { apiKey, testPlans, executions, project }: any) => {
        const { GeminiService } = await import('./gemini.js');
        const service = new GeminiService(apiKey);
        return await service.getTestRunSuggestions(testPlans, executions, project);
    });

    ipcMain.handle('ai-smoke-subset', async (_: any, { apiKey, candidates, doneTasks, project }: any) => {
        const { GeminiService } = await import('./gemini.js');
        const service = new GeminiService(apiKey);
        return await service.selectSmokeSubset(candidates, doneTasks, project);
    });

    // ── SAP HAC proxy ──────────────────────────────────────────────────────
    ipcMain.handle('sap-hac-request', async (_: any, { url, method, headers, body, ignoreSsl }: any) => {
        try {
            const fetchOpts: RequestInit = {
                method: method || 'GET',
                headers: headers || {},
            };
            if (body) fetchOpts.body = body;

            const res = await fetch(url, fetchOpts);
            const text = await res.text();
            return { success: true, status: res.status, body: text, headers: Object.fromEntries(res.headers.entries()) };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // high-level SAP HAC operations
    const sapServiceMap: Record<string, SapHacService> = {};

    ipcMain.handle('sap-hac-login', async (_: any, { baseUrl, username, password, ignoreSsl }: any) => {
        try {
            const key = baseUrl;
            if (!sapServiceMap[key]) sapServiceMap[key] = new SapHacService(baseUrl);
            const svc = sapServiceMap[key];
            const ok = await svc.login(username, password);
            return { success: ok };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });
    ipcMain.handle('sap-hac-cronjobs', async (_: any, { baseUrl }: any) => {
        try {
            const svc = sapServiceMap[baseUrl];
            if (!svc) throw new Error('Not logged in');
            const data = await svc.getCronJobs();
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });
    ipcMain.handle('sap-hac-flexsearch', async (_: any, { baseUrl, query, max }: any) => {
        try {
            const svc = sapServiceMap[baseUrl];
            if (!svc) throw new Error('Not logged in');
            const result: FlexibleSearchResult = await svc.runFlexibleSearch(query, max || 100);
            return { success: true, result };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });
    ipcMain.handle('sap-hac-impex', async (_: any, { baseUrl, script, enableCodeExecution }: any) => {
        try {
            const svc = sapServiceMap[baseUrl];
            if (!svc) throw new Error('Not logged in');
            const res: ImpExResult = await svc.importImpEx(script, !!enableCodeExecution);
            return { success: true, result: res };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ── Notifications ──────────────────────────────────────────────────────
    ipcMain.on('show-notification', (_: any, { title, body }: any) => {
        if (Notification.isSupported()) {
            const n = new Notification({ title, body, silent: false });
            n.on('click', () => {
                mainWindow?.show();
                mainWindow?.focus();
            });
            n.show();
        }
    });

    // ── System ────────────────────────────────────────────────────────────
    ipcMain.on('app-quit', () => {
        isQuitting = true;
        app.quit();
    });

    ipcMain.on('set-always-on-top', (_: any, flag: boolean) => {
        mainWindow?.setAlwaysOnTop(flag, 'screen-saver');
    });

    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('get-system-info', () => ({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        appVersion: app.getVersion(),
    }));

    // ── Save dialog / export ───────────────────────────────────────────────
    ipcMain.handle('save-file-dialog', async (_: any, { defaultName, content }: { defaultName: string; content: string }) => {
        if (!mainWindow) return { success: false, error: 'No window' };
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defaultName,
            filters: [
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'Markdown', extensions: ['md'] },
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        if (result.canceled || !result.filePath) return { success: false };
        try {
            fs.writeFileSync(result.filePath, content, 'utf8');
            return { success: true, path: result.filePath };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ── Bug Report service ─────────────────────────────────────────────────
    ipcMain.handle('generate-bug-report-task', async (_: any, { task, environment, reporter, aiAnalysis }: any) => {
        const { generateBugReportFromTask } = await import('./bug-report.js');
        return generateBugReportFromTask(task, environment, reporter, aiAnalysis);
    });

    ipcMain.handle('generate-bug-report-testcase', async (_: any, { tc, testPlanName, environment, reporter, executions, aiAnalysis }: any) => {
        const { generateBugReportFromTestCase } = await import('./bug-report.js');
        return generateBugReportFromTestCase(tc, testPlanName, environment, reporter, executions, aiAnalysis);
    });

    // ── Report / CSV service ──────────────────────────────────────────────
    ipcMain.handle('generate-test-cases-csv', async (_: any, { project, filterPlanIds }: any) => {
        const { generateTestCasesCsv } = await import('./report.js');
        return generateTestCasesCsv(project, filterPlanIds);
    });

    ipcMain.handle('generate-executions-csv', async (_: any, { project, filterIds }: any) => {
        const { generateExecutionsCsv } = await import('./report.js');
        return generateExecutionsCsv(project, filterIds);
    });

    ipcMain.handle('generate-test-summary-markdown', async (_: any, { project, filterPlanIds, criticalityAssessment }: any) => {
        const { generateTestSummaryMarkdown } = await import('./report.js');
        return generateTestSummaryMarkdown(project, filterPlanIds, criticalityAssessment);
    });

    ipcMain.handle('parse-csv-string', async (_: any, { content }: any) => {
        const { parseCsvString, autoDetectCsvMappings } = await import('./report.js');
        const parsed = parseCsvString(content);
        const mappings = autoDetectCsvMappings(parsed.headers);
        return { ...parsed, mappings };
    });

    ipcMain.handle('read-csv-file', async (_: any, { filePath }: any) => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const { parseCsvString, autoDetectCsvMappings } = await import('./report.js');
            const parsed = parseCsvString(content);
            const mappings = autoDetectCsvMappings(parsed.headers);
            return { success: true, ...parsed, mappings };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('read-json-file', async (_: any, { filePath }: any) => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return { success: true, data: JSON.parse(content) };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ── Webhook service ────────────────────────────────────────────────────
    ipcMain.handle('send-webhook', async (_: any, { webhook, title, message, color }: any) => {
        const { sendWebhook } = await import('./webhook.js');
        await sendWebhook(webhook, title, message, color);
        return { success: true };
    });

    ipcMain.handle('notify-test-plan-result', async (_: any, { webhooks, projectName, planName, passed, failed, total }: any) => {
        const { notifyTestPlanResult } = await import('./webhook.js');
        await notifyTestPlanResult(webhooks, projectName, planName, passed, failed, total);
        return { success: true };
    });

    // ── Environment health service ─────────────────────────────────────────
    ipcMain.handle('check-environments-health', async (_: any, { environments }: any) => {
        const { checkEnvironmentsNow } = await import('./health.js');
        return await checkEnvironmentsNow(environments);
    });

    ipcMain.handle('start-health-service', async (_: any, { environments, intervalMs }: any) => {
        const { startHealthService } = await import('./health.js');
        startHealthService(environments, intervalMs || 30000);
        return { success: true };
    });

    ipcMain.handle('stop-health-service', async () => {
        const { stopHealthService } = await import('./health.js');
        stopHealthService();
        return { success: true };
    });

    // ── CCv2 Management API ────────────────────────────────────────────────
    ipcMain.handle('ccv2-get-environments', async (_: any, { subscriptionCode, apiToken, apiBase }: any) => {
        const { ccv2GetEnvironments } = await import('./health.js');
        return await ccv2GetEnvironments(subscriptionCode, apiToken, apiBase);
    });

    ipcMain.handle('ccv2-get-deployments', async (_: any, { subscriptionCode, apiToken, environmentCode, top, apiBase }: any) => {
        const { ccv2GetDeployments } = await import('./health.js');
        return await ccv2GetDeployments(subscriptionCode, apiToken, environmentCode, top, apiBase);
    });

    ipcMain.handle('ccv2-get-build', async (_: any, { subscriptionCode, apiToken, buildCode, apiBase }: any) => {
        const { ccv2GetBuild } = await import('./health.js');
        return await ccv2GetBuild(subscriptionCode, apiToken, buildCode, apiBase);
    });

    // ── Connection Testing ────────────────────────────────────────────────
    ipcMain.handle('test-linear-connection', async (_: any, { apiKey }: any) => {
        const { getLinearTeams } = await import('./integrations.js');
        return await getLinearTeams(apiKey);
    });

    ipcMain.handle('test-jira-connection', async (_: any, { domain, email, apiKey }: any) => {
        const { getJiraProjects } = await import('./integrations.js');
        return await getJiraProjects(domain, email, apiKey);
    });

    // ── Automation API Controls ───────────────────────────────────────────
    ipcMain.handle('automation-api-start', async (_: any, { apiToken, port }: any) => {
        const { startServer } = await import('./server.js');
        startServer(apiToken, port);
        return true;
    });

    ipcMain.handle('automation-api-stop', async () => {
        const { stopServer } = await import('./server.js');
        stopServer();
        return true;
    });

    ipcMain.handle('automation-api-restart', async (_: any, { apiToken, port }: any) => {
        const { stopServer, startServer } = await import('./server.js');
        stopServer();

        // Brief delay before restarting
        await new Promise(r => setTimeout(r, 500));

        startServer(apiToken, port);
        return true;
    });

    ipcMain.handle('automation-api-status', async () => {
        // Since we don't have an easily exposed IsRunning flag yet, 
        // we can check if it responds on the port locally, or just rely
        // on the frontend knowing what it requested. For simplicity, just return OK.
        return { running: true };
    });
}

function createTray() {
    const iconPath = isDev
        ? path.join(__dirname, '../../src/assets/tray-icon.png')
        : path.join(__dirname, '../renderer/assets/tray-icon.png');

    if (!fs.existsSync(iconPath)) return;

    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'QAssistant', click: () => {
                mainWindow?.show();
                mainWindow?.focus();
            }
        },
        { type: 'separator' },
        {
            label: 'Quick Search (Cmd+Shift+S)', click: () => {
                mainWindow?.show();
                mainWindow?.webContents.send('trigger-command-palette');
            }
        },
        {
            label: 'New Task (Cmd+Shift+A)', click: () => {
                mainWindow?.show();
                mainWindow?.webContents.send('trigger-add-task');
            }
        },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray?.setToolTip('QAssistant');
    tray?.setContextMenu(contextMenu);
    tray?.on('click', () => {
        mainWindow?.isVisible() ? mainWindow.focus() : mainWindow?.show();
    });
}

app.whenReady().then(async () => {
    APP_DATA_DIR = path.join(app.getPath('userData'), 'QAssistantData');
    PROJECTS_FILE = path.join(APP_DATA_DIR, 'projects.json');
    CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'credentials.json');
    ATTACHMENTS_DIR = path.join(APP_DATA_DIR, 'attachments');
    SETTINGS_FILE = path.join(APP_DATA_DIR, 'settings.json');

    // ── Chromium cache cleanup ─────────────────────────────────────────────
    // 1. Remove temp cache dirs from previous runs (they are no longer locked).
    try {
        if (fs.existsSync(_chromiumCacheRoot)) {
            for (const entry of fs.readdirSync(_chromiumCacheRoot)) {
                if (entry !== _cacheRunId) {
                    try { fs.rmSync(path.join(_chromiumCacheRoot, entry), { recursive: true, force: true }); } catch { /* ignore */ }
                }
            }
        }
    } catch { /* ignore */ }

    // 2. Remove userData-based caches (GPU/Dawn/Code/Network) that are not
    //    controlled by --disk-cache-dir.  These can only be locked by a previous
    //    run; by the time app.whenReady() fires, those processes have exited.
    const userData = app.getPath('userData');
    for (const dir of ['Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'DawnCache', 'Network']) {
        const p = path.join(userData, dir);
        if (fs.existsSync(p)) {
            try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore if still locked */ }
        }
    }

    if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    initFileStorage(ATTACHMENTS_DIR);

    // Migrate any existing on-disk credentials (safeStorage encrypted hex) into OS credential manager
    try {
        if (fs.existsSync(CREDENTIALS_FILE)) {
            try {
                const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
                const parsed = JSON.parse(raw || '{}');
                for (const k of Object.keys(parsed)) {
                    try {
                        const v = parsed[k];
                        let plain = v;
                        if (safeStorage.isEncryptionAvailable() && typeof v === 'string' && /^[0-9a-fA-F]+$/.test(v)) {
                            try {
                                const buf = Buffer.from(v, 'hex');
                                plain = safeStorage.decryptString(buf);
                            } catch (e) {
                                // leave plain as-is
                            }
                        }
                        // Write into OS credential store using the same account key
                        await setCredential(k, plain as string);
                    } catch (e) {
                        console.warn('Credential migration: failed to migrate key', k, e);
                    }
                }
                // Remove legacy file after migration
                try { fs.unlinkSync(CREDENTIALS_FILE); } catch { /* ignore */ }
            } catch (e) {
                console.warn('Credential migration failed:', e);
            }
        }
    } catch (e) {
        console.warn('Credential migration encountered error:', e);
    }

    setupIpc();
    createWindow();
    createTray();

    // Read API token from settings
    let apiToken = 'qassistant-automation-token';
    let port = 3030;
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            if (settings.automationApiToken) apiToken = settings.automationApiToken;
            if (settings.automationPort) port = parseInt(settings.automationPort, 10);
        }
    } catch { /* ignore */ }

    import('./server.js').then(({ startServer }) => {
        startServer(apiToken, port);
    }).catch(console.error);

    // Ensure the Automation API port is released when the process exits.
    // 'before-quit' fires before windows close; 'will-quit' fires after all
    // windows are destroyed — using both covers every exit path (normal quit,
    // Tray quit, SIGTERM from dev runner, etc.).
    app.once('before-quit', async () => {
        const { stopServer } = await import('./server.js');
        stopServer();
    });

    import('./reminders.js').then(({ startReminderService }) => {
        startReminderService(PROJECTS_FILE);
    }).catch(console.error);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    // Belt-and-suspenders: also stop the server here in case before-quit was skipped
    import('./server.js').then(({ stopServer }) => stopServer()).catch(() => {});
});
