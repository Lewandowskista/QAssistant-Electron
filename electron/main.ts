const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');

import { setCredential, getCredential, deleteCredential, listCredentials, initCredentials } from './credentialService';
import { initFileStorage } from './fileStorage';
import { GeminiService } from './gemini';
import { startServer, stopServer } from './server';
import { startReminderService } from './reminders';
import * as health from './health';
import * as report from './report';
import * as integrations from './integrations';
import { saveFile, saveBytes, deleteFile } from './fileStorage';
import * as bugReport from './bug-report';
import { trayIconBase64 } from './tray-icon';
// BOOTSTRAP: This self-executing function finds the REAL Electron API even if shadowed.
const electron = (function() {
    try {
        const e = require('electron');
        if (typeof e === 'object' && e.app) return e;
    } catch {}

    try {
        const e = require('node:electron');
        if (typeof e === 'object' && e.app) return e;
    } catch {}

    // CACHE SEARCH: The ultimate fallback for shadowing.
    for (const key in require.cache) {
        const exp = (require.cache[key] as any).exports;
        if (exp && typeof exp === 'object' && exp.app && exp.BrowserWindow) return exp;
    }

    // RESCUE FROM TEMP: Bypasses parent node_modules lookup
    try {
        const rescuePath = path.join(os.tmpdir(), `rescue-${Date.now()}.js`);
        fs.writeFileSync(rescuePath, 'module.exports = require("electron");');
        const e = require(rescuePath);
        try { fs.unlinkSync(rescuePath); } catch {}
        if (typeof e === 'object' && e.app) return e;
    } catch {}

    return require('electron'); 
})();

const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu } = electron || {};

if (app) {
    const _cacheRunId = `${Date.now().toString(36)}-${process.pid}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
    const _chromiumCacheRoot = path.join(os.tmpdir(), 'qassistant-chrome-cache');
    const _runCacheDir = path.join(_chromiumCacheRoot, _cacheRunId);

    try {
        if (!fs.existsSync(_chromiumCacheRoot)) fs.mkdirSync(_chromiumCacheRoot, { recursive: true });
    } catch (e) {
        console.warn('Could not prepare Chromium cache root directory:', e);
    }

    let mainWindow: any = null;
    let APP_DATA_DIR = '';
    let PROJECTS_FILE = '';
    let CREDENTIALS_FILE = '';
    let ATTACHMENTS_DIR = '';
    let SETTINGS_FILE = '';
    let tray: any = null;

    const isMac = process.platform === 'darwin';

    // SECURITY: Helper to validate paths are within allowed directories
    function isPathWithin(targetPath: string, baseDir: string): boolean {
        const resolvedTarget = path.resolve(targetPath);
        const resolvedBase = path.resolve(baseDir);
        return resolvedTarget.startsWith(resolvedBase);
    }

    // SECURITY: Helper to validate external URLs
    function isValidExternalUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return ['https:', 'http:', 'mailto:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 1000,
            minHeight: 700,
            frame: false,
            titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
            webPreferences: {
                preload: path.join(__dirname, '../preload/preload.js'),
                additionalArguments: [`--disk-cache-dir=${_runCacheDir}`],
                contextIsolation: true,
                nodeIntegration: false,
                webviewTag: true,
                sandbox: false
            },
            backgroundColor: '#0f0f13',
            show: false
        });

        mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
            if (isValidExternalUrl(url)) {
                shell.openExternal(url);
            } else {
                console.warn('Blocked opening potentially dangerous external URL:', url);
            }
            return { action: 'deny' };
        });

        // SECURITY: Prevent window from navigating away from the app
        mainWindow.webContents.on('will-navigate', (event: any, url: string) => {
            if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return;
            if (!url.startsWith('file://')) {
                event.preventDefault();
                console.warn('Blocked main window navigation to:', url);
            }
        });

        if (process.env.VITE_DEV_SERVER_URL) {
            mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        } else {
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
        }

        mainWindow.once('ready-to-show', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.webContents.send('window-maximized-status', mainWindow.isMaximized());
            }
        });

        ipcMain.on('window-minimize', () => mainWindow?.minimize());
        ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
        ipcMain.on('window-close', async () => {
            if (mainWindow) {
                let settings: any = {};
                try {
                    if (fs.existsSync(SETTINGS_FILE)) {
                        const content = await fsp.readFile(SETTINGS_FILE, 'utf8');
                        settings = JSON.parse(content);
                    }
                } catch (e) {
                    console.error('Error reading settings during close:', e);
                }
                
                if (settings.minimizeToTray) {
                    mainWindow.hide();
                } else {
                    mainWindow.close();
                }
            }
        });
        ipcMain.on('app-quit', () => {
            tray?.destroy();
            app.quit();
        });
        ipcMain.on('show-notification', (_e: any, { title, body }: any) => {
            if (mainWindow) {
                // You could use Electron's Notification API here, or just send to webContents 
                // but usually this means native notification.
                const { Notification } = electron;
                new Notification({ title, body }).show();
            }
        });
        ipcMain.on('set-always-on-top', (_e: any, flag: any) => mainWindow?.setAlwaysOnTop(flag));
    }

    function setupIpc() {
        ipcMain.handle('get-app-data-path', () => APP_DATA_DIR);
        ipcMain.handle('read-projects-file', async () => {
            try {
                if (fs.existsSync(PROJECTS_FILE)) {
                    const content = await fsp.readFile(PROJECTS_FILE, 'utf8');
                    return JSON.parse(content);
                }
            } catch (e) {
                console.error('Error reading projects file:', e);
            }
            return [];
        });
        ipcMain.handle('write-projects-file', async (_e: any, data: any) => { 
            try {
                await fsp.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2)); 
                return true; 
            } catch (e) {
                console.error('Error writing projects file:', e);
                return false;
            }
        });
        ipcMain.handle('read-settings-file', async () => {
            try {
                if (fs.existsSync(SETTINGS_FILE)) {
                    const content = await fsp.readFile(SETTINGS_FILE, 'utf8');
                    return JSON.parse(content);
                }
            } catch (e) {
                console.error('Error reading settings file:', e);
            }
            return {};
        });
        ipcMain.handle('write-settings-file', async (_e: any, data: any) => { 
            try {
                await fsp.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2)); 
                return true; 
            } catch (e) {
                console.error('Error writing settings file:', e);
                return false;
            }
        });
        ipcMain.handle('secure-store-set', async (_e: any, key: any, value: any) => { await setCredential(key, value); return true; });
        ipcMain.handle('secure-store-get', async (_e: any, key: any) => await getCredential(key));
        ipcMain.handle('secure-store-delete', async (_e: any, key: any) => await deleteCredential(key));
        ipcMain.handle('secure-store-list', async () => await listCredentials());
        ipcMain.handle('select-file', async () => {
            if (!mainWindow) return null;
            const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
            return res.canceled ? null : res.filePaths[0];
        });
        ipcMain.handle('open-url', async (_e: any, url: any) => { 
            try { 
                if (isValidExternalUrl(url)) {
                    await shell.openExternal(url); 
                    return { success: true }; 
                } else {
                    return { success: false, error: 'Invalid URL protocol' };
                }
            } catch (e: any) { 
                return { success: false, error: e.message }; 
            } 
        });
        ipcMain.handle('ai-generate-cases', async (_e: any, { apiKey, tasks, sourceName, project, designDoc, modelName }: any) => { const s = new GeminiService(apiKey); return await s.generateTestCases(tasks, sourceName, project, designDoc, modelName); });
        ipcMain.handle('automation-api-start', async (_e: any, { apiKey, port }: any) => startServer(apiKey, port));
        ipcMain.handle('automation-api-stop', () => stopServer());
        ipcMain.handle('automation-api-restart', async (_e: any, { apiKey, port }: any) => { stopServer(); return startServer(apiKey, port); });
        ipcMain.handle('test-linear-connection', async (_e: any, { apiKey }: any) => await integrations.getLinearTeams(apiKey));
        ipcMain.handle('test-jira-connection', async (_e: any, { domain, email, apiToken, token }: any) => await integrations.getJiraProjects(domain, email, apiToken || token));
        ipcMain.handle('ccv2-get-environments', async (_e: any, { subscriptionCode, apiToken }: any) => await health.ccv2GetEnvironments(subscriptionCode, apiToken));
        ipcMain.handle('ccv2-get-deployments', async (_e: any, { subscriptionCode, apiToken, environmentCode }: any) => await health.ccv2GetDeployments(subscriptionCode, apiToken, environmentCode));
        ipcMain.handle('ccv2-get-build', async (_e: any, { subscriptionCode, apiToken, buildCode }: any) => await health.ccv2GetBuild(subscriptionCode, apiToken, buildCode));
        ipcMain.handle('check-environments-health', async (_e: any, { environments }: any) => await health.checkEnvironmentsNow(environments));
        ipcMain.handle('start-health-service', (_e: any, { environments, intervalMs }: any) => health.startHealthService(environments, intervalMs));
        ipcMain.handle('stop-health-service', () => health.stopHealthService());

        // File/Attachment Management
        ipcMain.handle('copy-to-attachments', async (_e: any, sourcePath: string) => {
            // We allow copying FROM anywhere (user selects file), but we validate destination in saveFile
            return await saveFile(sourcePath);
        });
        ipcMain.handle('save-bytes-attachment', async (_e: any, { bytes, fileName }: any) => await saveBytes(bytes, fileName));
        ipcMain.handle('delete-attachment', async (_e: any, filePath: string) => {
            if (isPathWithin(filePath, ATTACHMENTS_DIR)) {
                return deleteFile(filePath);
            }
            console.warn('Blocked attempt to delete file outside attachments:', filePath);
            return false;
        });

        // Bug Reporting
        ipcMain.handle('generate-bug-report-task', async (_e: any, { task, environment, reporter, aiAnalysis }: any) => {
            const md = bugReport.generateBugReportFromTask(task, environment, reporter, aiAnalysis);
            const fileName = `BugReport_Task_${Date.now()}.md`;
            return await saveBytes(new TextEncoder().encode(md), fileName);
        });
        ipcMain.handle('generate-bug-report-testcase', async (_e: any, { tc, testPlanName, environment, reporter, executions, aiAnalysis }: any) => {
            const md = bugReport.generateBugReportFromTestCase(tc, testPlanName, environment, reporter, executions, aiAnalysis);
            const fileName = `BugReport_TC_${Date.now()}.md`;
            return await saveBytes(new TextEncoder().encode(md), fileName);
        });

        ipcMain.handle('read-json-file', async (_e: any, { filePath }: any) => {
            try { 
                if (!isPathWithin(filePath, APP_DATA_DIR) && !isPathWithin(filePath, ATTACHMENTS_DIR)) {
                    return { success: false, error: 'Access denied: Path outside application data directory' };
                }
                const content = await fsp.readFile(filePath, 'utf8');
                return { success: true, data: JSON.parse(content) }; 
            }
            catch (e: any) { return { success: false, error: e.message }; }
        });
        ipcMain.handle('open-file', (_e: any, { filePath }: any) => {
            if (fs.existsSync(filePath)) {
                if (!isPathWithin(filePath, APP_DATA_DIR) && !isPathWithin(filePath, ATTACHMENTS_DIR)) {
                    console.warn('Blocked attempt to open file outside app data:', filePath);
                    return;
                }
                if (fs.statSync(filePath).isDirectory()) { shell.openPath(filePath); }
                else { shell.showItemInFolder(filePath); }
            }
        });
        ipcMain.handle('ai-list-models', async (_e: any, { apiKey }: any) => { const s = new GeminiService(apiKey); return await s.listAvailableModels(); });
        ipcMain.handle('ai-analyze-issue', async (_e: any, { apiKey, task, comments, project, modelName }: any) => { const s = new GeminiService(apiKey); return await s.analyzeIssue(task, comments, project, 0, modelName); });
        ipcMain.handle('ai-analyze', async (_e: any, { apiKey, context, project, modelName }: any) => { const s = new GeminiService(apiKey); return await s.analyzeProject(context, project, modelName); });
        ipcMain.handle('ai-criticality', async (_e: any, { apiKey, tasks, testPlans, executions, project, modelName }: any) => { const s = new GeminiService(apiKey); return await s.assessCriticality(tasks, testPlans, executions, project, modelName); });
        ipcMain.handle('ai-test-run-suggestions', async (_e: any, { apiKey, testPlans, executions, project, modelName }: any) => { const s = new GeminiService(apiKey); return await s.getTestRunSuggestions(testPlans, executions, project, modelName); });
        ipcMain.handle('ai-smoke-subset', async (_e: any, { apiKey, candidates, doneTasks, project, modelName }: any) => { const s = new GeminiService(apiKey); return await s.selectSmokeSubset(candidates, doneTasks, project, modelName); });
        
        // Report Handlers
        ipcMain.handle('generate-test-cases-csv', (_e: any, { project: p }: any) => report.generateTestCasesCsv(p));
        ipcMain.handle('generate-executions-csv', (_e: any, { project: p }: any) => report.generateExecutionsCsv(p));
        ipcMain.handle('generate-test-summary-markdown', (_e: any, { project: p, filterPlanIds, aiResult }: any) => report.generateTestSummaryMarkdown(p, filterPlanIds, aiResult));
        ipcMain.handle('export-test-summary-pdf', async (_e: any, { project: p, filterPlanIds, aiResult }: any) => {
            if (!mainWindow) return { success: false, error: 'No main window' };
            const html = report.generateTestSummaryHtml(p, filterPlanIds, aiResult);
            const res = await dialog.showSaveDialog(mainWindow, { defaultPath: `${p.name.replace(/\s+/g, '-')}-test-summary.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
            if (res.canceled) return { success: false };
            const printWindow = new BrowserWindow({ show: false });
            await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            const data = await printWindow.webContents.printToPDF({});
            await fsp.writeFile(res.filePath!, data);
            printWindow.close();
            return { success: true, path: res.filePath };
        });

        // File/CSV Handlers
        ipcMain.handle('read-csv-file', async (_e: any, { filePath }: any) => {
            try {
                // Allow reading from anywhere since this is often used for importing external data
                // but we should still be careful. For now, we trust the import process.
                const content = fs.readFileSync(filePath, 'utf8');
                // If it looks like a design doc (not strictly CSV), just return the raw string
                if (!content.includes(',') && content.split('\n').length > 5) return content;
                const { headers, rows } = report.parseCsvString(content);
                const mappings = report.autoDetectCsvMappings(headers);
                return { success: true, headers, rows, mappings, content }; // return content too for design doc legacy
            } catch (e: any) { return { success: false, error: e.message }; }
        });
        ipcMain.handle('save-file-dialog', async (_e: any, { defaultName, content }: any) => {
            if (!mainWindow) return { success: false };
            const res = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
            if (res.canceled) return { success: false };
            await fsp.writeFile(res.filePath!, content);
            return { success: true, path: res.filePath };
        });

        // Integration Handlers
        ipcMain.handle('sync-linear', async (_e: any, { apiKey, teamKey, connectionId }: any) => await integrations.fetchLinearIssues(apiKey, teamKey, connectionId));
        ipcMain.handle('get-linear-comments', async (_e: any, { apiKey, issueId, connectionId }: any) => await integrations.getLinearComments(apiKey, issueId));
        ipcMain.handle('add-linear-comment', async (_e: any, { apiKey, issueId, body, connectionId }: any) => { await integrations.addLinearComment(apiKey, issueId, body); return { success: true }; });
        ipcMain.handle('get-linear-workflow-states', async (_e: any, { apiKey, connectionId }: any) => await integrations.getLinearWorkflowStates(apiKey));
        ipcMain.handle('update-linear-status', async (_e: any, { apiKey, issueId, stateId, connectionId }: any) => { await integrations.updateLinearIssueStatus(apiKey, issueId, stateId); return { success: true }; });
        ipcMain.handle('get-linear-history', async (_e: any, { apiKey, issueId, connectionId }: any) => await integrations.getLinearIssueHistory(apiKey, issueId));
        ipcMain.handle('create-linear-issue', async (_e: any, { apiKey, teamId, title, description, priority, connectionId }: any) => await integrations.createLinearIssue(apiKey, teamId, title, description, priority));
        
        ipcMain.handle('sync-jira', async (_e: any, { domain, email, apiKey, projectKey, connectionId }: any) => await integrations.fetchJiraIssues(domain, email, apiKey, projectKey, connectionId));
        ipcMain.handle('get-jira-comments', async (_e: any, { domain, email, apiKey, issueKey, connectionId }: any) => await integrations.getJiraComments(domain, email, apiKey, issueKey));
        ipcMain.handle('add-jira-comment', async (_e: any, { domain, email, apiKey, issueKey, body, connectionId }: any) => { await integrations.addJiraComment(domain, email, apiKey, issueKey, body); return { success: true }; });
        ipcMain.handle('transition-jira-issue', async (_e: any, { domain, email, apiKey, issueKey, transitionName, connectionId }: any) => { await integrations.transitionJiraIssue(domain, email, apiKey, issueKey, transitionName); return { success: true }; });
        ipcMain.handle('get-jira-history', async (_e: any, { domain, email, apiKey, issueKey, connectionId }: any) => await integrations.getJiraIssueHistory(domain, email, apiKey, issueKey));
        ipcMain.handle('create-jira-issue', async (_e: any, { domain, email, apiKey, projectKey, title, description, issueTypeName, connectionId }: any) => await integrations.createJiraIssue(domain, email, apiKey, projectKey, title, description, issueTypeName));

        ipcMain.handle('get-system-info', () => ({ platform: process.platform }));
        ipcMain.handle('get-app-version', () => app.getVersion());
        ipcMain.handle('is-minimized-to-tray', async () => {
            try {
                if (fs.existsSync(SETTINGS_FILE)) {
                    const content = await fsp.readFile(SETTINGS_FILE, 'utf8');
                    const settings = JSON.parse(content);
                    return !!settings.minimizeToTray;
                }
            } catch (e) {
                console.error('Error reading settings for tray check:', e);
            }
            return false;
        });
    }

    function createTray() {
        const { nativeImage } = electron;
        let image = nativeImage.createFromDataURL(trayIconBase64);
        
        // Resize to standard tray icon size otherwise it may not show on some OS/DPI scales
        image = image.resize({ width: 16, height: 16 });

        tray = new Tray(image);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Restore QAssistant', click: () => mainWindow?.show() },
            { type: 'separator' },
            { label: 'Quit', click: () => {
                tray?.destroy();
                app.quit();
            }}
        ]);

        tray.setToolTip('QAssistant');
        tray.setContextMenu(contextMenu);

        tray.on('double-click', () => {
            mainWindow?.show();
        });
    }

    app.whenReady().then(async () => {
        APP_DATA_DIR = path.join(app.getPath('userData'), 'QAssistantData');
        PROJECTS_FILE = path.join(APP_DATA_DIR, 'projects.json');
        CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'credentials.json');
        ATTACHMENTS_DIR = path.join(APP_DATA_DIR, 'attachments');
        SETTINGS_FILE = path.join(APP_DATA_DIR, 'settings.json');

        if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
        if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

        initFileStorage(ATTACHMENTS_DIR);
        initCredentials(CREDENTIALS_FILE);

        setupIpc();
        createWindow();
        createTray();
        startReminderService(PROJECTS_FILE);
    });

    app.on('window-all-closed', () => { 
        const settings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};
        if (process.platform !== 'darwin' && !settings.minimizeToTray) {
            app.quit(); 
        }
    });
} else {
    console.error('CRITICAL: Electron app object is undefined even after all rescue attempts!');
}
