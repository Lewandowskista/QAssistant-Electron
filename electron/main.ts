import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, Notification, dialog, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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

// Blocked file extensions (mirrors C# FileStorageService.cs)
const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.psm1', '.psd1',
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.scr', '.pif',
    '.application', '.gadget', '.msp', '.mst', '.jar', '.reg', '.inf',
    '.lnk', '.url', '.sh', '.bash', '.zsh', '.fish', '.ksh',
    '.elf', '.bin', '.dmg', '.pkg', '.deb', '.rpm', '.apk',
    '.dll', '.so', '.dylib', '.sys', '.drv',
]);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 900,
        minWidth: 900,
        minHeight: 600,
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

    // ── Credentials store ──────────────────────────────────────────────────
    ipcMain.handle('secure-store-set', async (_: any, key: string, value: string) => {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                return { success: false, error: 'Encryption is not available on this system.' };
            }

            let credentials: Record<string, string> = {};
            if (fs.existsSync(CREDENTIALS_FILE)) {
                credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            }

            const encrypted = safeStorage.encryptString(value);
            credentials[key] = encrypted.toString('hex');

            fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('secure-store-get', async (_: any, key: string) => {
        try {
            if (!fs.existsSync(CREDENTIALS_FILE)) return null;
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            const encryptedValue = credentials[key];
            if (!encryptedValue) return null;

            if (!safeStorage.isEncryptionAvailable()) {
                console.error("Encryption not available, cannot decrypt credential.");
                return null;
            }

            try {
                const buffer = Buffer.from(encryptedValue, 'hex');
                return safeStorage.decryptString(buffer);
            } catch (e) {
                // Fallback: if decryption fails, maybe it's still plaintext from old version
                // We return null to force re-entry or handle gracefully in UI
                console.error(`Decryption failed for key ${key}:`, e);
                return null;
            }
        } catch {
            return null;
        }
    });

    ipcMain.handle('secure-store-delete', async (_: any, key: string) => {
        try {
            if (!fs.existsSync(CREDENTIALS_FILE)) return { success: true };
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
            delete credentials[key];
            fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
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
        try {
            if (!fs.existsSync(sourcePath)) {
                return { success: false, error: 'Source file does not exist.' };
            }

            const ext = path.extname(sourcePath).toLowerCase();
            if (BLOCKED_EXTENSIONS.has(ext)) {
                return { success: false, error: `File type '${ext}' is not allowed for security reasons.` };
            }

            const fileName = `${Date.now()}-${path.basename(sourcePath)}`;
            const destPath = path.join(ATTACHMENTS_DIR, fileName);

            // Check file size (max 50MB)
            const stats = fs.statSync(sourcePath);
            if (stats.size > 50 * 1024 * 1024) {
                return { success: false, error: 'File size exceeds 50MB limit.' };
            }

            fs.copyFileSync(sourcePath, destPath);
            return { success: true, path: destPath, fileName };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-attachment', async (_: any, filePath: string) => {
        try {
            // Only allow deletion of files within the attachments directory
            if (!filePath.startsWith(ATTACHMENTS_DIR)) {
                return { success: false, error: 'Access denied: path is outside attachments directory.' };
            }
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('open-file', async (_: any, filePath: string) => {
        try {
            await shell.openPath(filePath);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
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

app.whenReady().then(() => {
    APP_DATA_DIR = path.join(app.getPath('userData'), 'QAssistantData');
    PROJECTS_FILE = path.join(APP_DATA_DIR, 'projects.json');
    CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'credentials.json');
    ATTACHMENTS_DIR = path.join(APP_DATA_DIR, 'attachments');
    SETTINGS_FILE = path.join(APP_DATA_DIR, 'settings.json');

    if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

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
});
