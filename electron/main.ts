const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');

// Load .env file from project root (dev mode — production builds have vars baked in via electron.vite.config.ts)
;(function loadDotEnv() {
    try {
        const envPath = path.join(__dirname, '../../.env')
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf8').split('\n')
            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || trimmed.startsWith('#')) continue
                const eq = trimmed.indexOf('=')
                if (eq === -1) continue
                const key = trimmed.slice(0, eq).trim()
                const value = trimmed.slice(eq + 1).trim()
                if (!process.env[key]) process.env[key] = value
            }
        }
    } catch { /* ignore */ }
})()

import { setCredential, getCredential, deleteCredential, listCredentials, initCredentials } from './credentialService';
import * as oauth from './oauth';
import * as github from './github';
import { assertString, assertArray, assertObject } from './ipc-validation';
import { withFileLock } from './file-lock';
import { AI_RATE_LIMIT_MS, MAX_SAP_HAC_INSTANCES } from './constants';
import { initFileStorage } from './fileStorage';
import { GeminiService } from './gemini';
import { startServer, stopServer, setOAuthCompleteCallback } from './server';
import { startReminderService } from './reminders';
import * as health from './health';
import * as report from './report';
import * as reportBuilder from './report-builder';
import * as integrations from './integrations';
import { saveFile, saveBytes, deleteFile } from './fileStorage';
import * as bugReport from './bug-report';
import { SapHacService } from './sapHac';
// trayIconBase64 removed to use file-based icon
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

const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, protocol } = electron || {};

if (protocol) {
    protocol.registerSchemesAsPrivileged([
        { scheme: 'q-media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, stream: true, corsEnabled: true } }
    ]);
}

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
    let USER_PROFILE_FILE = '';

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
            trafficLightPosition: isMac ? { x: 10, y: 14 } : undefined,
            webPreferences: {
                preload: path.join(__dirname, '../preload/preload.js'),
                additionalArguments: [`--disk-cache-dir=${_runCacheDir}`],
                contextIsolation: true,
                nodeIntegration: false,
                webviewTag: true,
                sandbox: true
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
            if (process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) return;
            if (!url.startsWith('file://')) {
                event.preventDefault();
                console.warn('Blocked main window navigation to:', url);
            }
        });

        if (process.env['ELECTRON_RENDERER_URL']) {
            mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
        } else {
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
        }

        mainWindow.once('ready-to-show', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.webContents.send('window-maximized-status', mainWindow.isMaximized());
            }
        });

        // On macOS, clicking the red dot should hide the window (not destroy it)
        // so it can be restored from the Dock without crashing.
        mainWindow.on('close', (event) => {
            if (process.platform === 'darwin' && !app.isQuiting) {
                event.preventDefault();
                mainWindow?.hide();
            }
        });

        // Null out mainWindow when it is actually destroyed so the activate
        // handler knows to create a fresh window rather than calling .show()
        // on a destroyed object.
        mainWindow.on('closed', () => {
            mainWindow = null;
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
            (app as any).isQuiting = true;
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
                    const parsed = JSON.parse(content);
                    if (!Array.isArray(parsed)) {
                        console.error('projects.json is not an array — resetting to empty.');
                        return [];
                    }
                    return parsed;
                }
            } catch (e) {
                console.error('Error reading projects file:', e);
            }
            return [];
        });
        ipcMain.handle('write-projects-file', async (_e: any, data: any) => {
            try {
                assertArray(data, 'projects');
                await withFileLock(PROJECTS_FILE, () =>
                    fsp.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2))
                );
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
                    const parsed = JSON.parse(content);
                    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                        console.error('settings.json has unexpected shape — resetting to defaults.');
                        return {};
                    }
                    return parsed;
                }
            } catch (e) {
                console.error('Error reading settings file:', e);
            }
            return {};
        });
        ipcMain.handle('write-settings-file', async (_e: any, data: any) => {
            try {
                assertObject(data, 'settings');
                await fsp.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2));
                return true;
            } catch (e) {
                console.error('Error writing settings file:', e);
                return false;
            }
        });
        ipcMain.handle('secure-store-set', async (_e: any, key: any, value: any) => {
            assertString(key, 'key', 500);
            assertString(value, 'value', 100_000);
            await setCredential(key, value);
            return true;
        });
        ipcMain.handle('secure-store-get', async (_e: any, key: any) => {
            assertString(key, 'key', 500);
            return await getCredential(key);
        });
        ipcMain.handle('secure-store-delete', async (_e: any, key: any) => {
            assertString(key, 'key', 500);
            return await deleteCredential(key);
        });
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
        // Rate limiting: track last call time per AI channel (3s minimum between calls)
        const aiLastCall: Record<string, number> = {};
        function checkAiRateLimit(channel: string): { __isError: boolean; message: string } | null {
            const now = Date.now();
            const last = aiLastCall[channel] ?? 0;
            if (now - last < AI_RATE_LIMIT_MS) {
                return { __isError: true, message: `Please wait a moment before sending another request.` };
            }
            aiLastCall[channel] = now;
            return null;
        }

        ipcMain.handle('ai-generate-cases', async (_e: any, { apiKey, tasks, sourceName, project, designDoc, modelName, comments }: any) => {
            const rateErr = checkAiRateLimit('ai-generate-cases'); if (rateErr) return rateErr;
            assertString(apiKey, 'apiKey');
            const s = new GeminiService(apiKey);
            try {
                return await s.generateTestCases(tasks, sourceName, project, designDoc, modelName, comments);
            } catch (err: any) {
                // Return a flat wrapper to the IPC boundary to safely cross context bridges without native cloning recursion
                return { __isError: true, message: String(err) };
            }
        });
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
        ipcMain.handle('ai-list-models', async (_e: any, { apiKey }: any) => {
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).listAvailableModels();
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        ipcMain.handle('ai-analyze-issue', async (_e: any, { apiKey, task, comments, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-analyze-issue'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).analyzeIssue(task, comments, project, 0, modelName);
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        ipcMain.handle('ai-analyze', async (_e: any, { apiKey, context, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-analyze'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).analyzeProject(context, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        ipcMain.handle('ai-criticality', async (_e: any, { apiKey, tasks, testPlans, executions, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-criticality'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).assessCriticality(tasks, testPlans, executions, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        ipcMain.handle('ai-test-run-suggestions', async (_e: any, { apiKey, testPlans, executions, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-test-run-suggestions'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).getTestRunSuggestions(testPlans, executions, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        ipcMain.handle('ai-smoke-subset', async (_e: any, { apiKey, candidates, doneTasks, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-smoke-subset'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).selectSmokeSubset(candidates, doneTasks, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        ipcMain.handle('ai-chat', async (_e: any, { apiKey, userMessage, history, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-chat'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(userMessage, 'userMessage', 50_000);
                return await new GeminiService(apiKey).chat(userMessage, history || [], project, modelName);
            }
            catch (err: any) { return { __isError: true, message: String(err) }; }
        });
        
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
            const data = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
            await fsp.writeFile(res.filePath!, data);
            printWindow.close();
            return { success: true, path: res.filePath };
        });

        // Report Builder Handlers (M1: Custom Report Templates)
        ipcMain.handle('generate-custom-report', async (_e: any, { project: p, template }: any) => {
            try {
                const html = reportBuilder.generateCustomReport(p, template);
                return { success: true, html };
            } catch (err: any) {
                return { success: false, error: String(err) };
            }
        });

        ipcMain.handle('export-custom-report-pdf', async (_e: any, { project: p, template }: any) => {
            try {
                if (!mainWindow) return { success: false, error: 'No main window' };
                const html = reportBuilder.generateCustomReport(p, template);
                const res = await dialog.showSaveDialog(mainWindow, {
                    defaultPath: `${p.name.replace(/\s+/g, '-')}-${template.name.replace(/\s+/g, '-')}.pdf`,
                    filters: [{ name: 'PDF', extensions: ['pdf'] }]
                });
                if (res.canceled) return { success: false };
                const printWindow = new BrowserWindow({ show: false });
                await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                const data = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
                await fsp.writeFile(res.filePath!, data);
                printWindow.close();
                return { success: true, path: res.filePath };
            } catch (err: any) {
                return { success: false, error: String(err) };
            }
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
        ipcMain.handle('get-linear-comments', async (_e: any, { apiKey, issueId }: any) => await integrations.getLinearComments(apiKey, issueId));
        ipcMain.handle('add-linear-comment', async (_e: any, { apiKey, issueId, body }: any) => { await integrations.addLinearComment(apiKey, issueId, body); return { success: true }; });
        ipcMain.handle('get-linear-workflow-states', async (_e: any, { apiKey, teamId }: any) => await integrations.getLinearWorkflowStates(apiKey, teamId));
        ipcMain.handle('update-linear-status', async (_e: any, { apiKey, issueId, stateId }: any) => { await integrations.updateLinearIssueStatus(apiKey, issueId, stateId); return { success: true }; });
        ipcMain.handle('get-linear-history', async (_e: any, { apiKey, issueId }: any) => await integrations.getLinearIssueHistory(apiKey, issueId));
        ipcMain.handle('create-linear-issue', async (_e: any, { apiKey, teamId, title, description, priority }: any) => await integrations.createLinearIssue(apiKey, teamId, title, description, priority));
        
        ipcMain.handle('sync-jira', async (_e: any, { domain, email, apiKey, projectKey, connectionId }: any) => await integrations.fetchJiraIssues(domain, email, apiKey, projectKey, connectionId));
        ipcMain.handle('get-jira-comments', async (_e: any, { domain, email, apiKey, issueKey }: any) => await integrations.getJiraComments(domain, email, apiKey, issueKey));
        ipcMain.handle('add-jira-comment', async (_e: any, { domain, email, apiKey, issueKey, body }: any) => { await integrations.addJiraComment(domain, email, apiKey, issueKey, body); return { success: true }; });
        ipcMain.handle('transition-jira-issue', async (_e: any, { domain, email, apiKey, issueKey, transitionName }: any) => { await integrations.transitionJiraIssue(domain, email, apiKey, issueKey, transitionName); return { success: true }; });
        ipcMain.handle('get-jira-history', async (_e: any, { domain, email, apiKey, issueKey }: any) => await integrations.getJiraIssueHistory(domain, email, apiKey, issueKey));
        ipcMain.handle('get-jira-statuses', async (_e: any, { domain, email, apiKey, projectKey }: any) => await integrations.getJiraStatuses(domain, email, apiKey, projectKey));
        ipcMain.handle('create-jira-issue', async (_e: any, { domain, email, apiKey, projectKey, title, description, issueTypeName }: any) => await integrations.createJiraIssue(domain, email, apiKey, projectKey, title, description, issueTypeName));

        // SAP HAC Handlers
        const sapHacInstances = new Map<string, any>();
        const getSapHac = (baseUrl: string, ignoreSsl = false) => {
            if (!sapHacInstances.has(baseUrl)) {
                // Evict oldest entry when cache is full to prevent unbounded growth
                if (sapHacInstances.size >= MAX_SAP_HAC_INSTANCES) {
                    const oldestKey = sapHacInstances.keys().next().value;
                    sapHacInstances.delete(oldestKey);
                }
                sapHacInstances.set(baseUrl, new SapHacService(baseUrl, ignoreSsl));
            }
            return sapHacInstances.get(baseUrl);
        };

        ipcMain.handle('sap-hac-login', async (_e: any, { baseUrl, user, pass, ignoreSsl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(user, 'user', 200);
            assertString(pass, 'pass', 500);
            const svc = getSapHac(baseUrl, ignoreSsl);
            const success = await svc.login(user, pass);
            return { success };
        });
        ipcMain.handle('sap-hac-get-cronjobs', async (_e: any, { baseUrl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            return await getSapHac(baseUrl).getCronJobs();
        });
        ipcMain.handle('sap-hac-flexible-search', async (_e: any, { baseUrl, query, max }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(query, 'query', 50_000);
            return await getSapHac(baseUrl).runFlexibleSearch(query, max);
        });
        ipcMain.handle('sap-hac-import-impex', async (_e: any, { baseUrl, script, enableCode }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(script, 'script', 500_000);
            return await getSapHac(baseUrl).importImpEx(script, enableCode);
        });
        ipcMain.handle('sap-hac-get-catalog-versions', async (_e: any, { baseUrl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            return await getSapHac(baseUrl).getCatalogVersions();
        });
        ipcMain.handle('sap-hac-get-catalog-ids', async (_e: any, { baseUrl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            return await getSapHac(baseUrl).getCatalogIds();
        });
        ipcMain.handle('sap-hac-get-catalog-sync-diff', async (_e: any, { baseUrl, catalogId, maxMissing }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(catalogId, 'catalogId', 500);
            return await getSapHac(baseUrl).getCatalogSyncDiff(catalogId, maxMissing);
        });

        // User Profile
        ipcMain.handle('read-user-profile', async () => {
            try {
                if (fs.existsSync(USER_PROFILE_FILE)) {
                    const content = await fsp.readFile(USER_PROFILE_FILE, 'utf8');
                    return JSON.parse(content);
                }
            } catch (e) {
                console.error('Error reading user profile:', e);
            }
            return null;
        });
        ipcMain.handle('write-user-profile', async (_e: any, data: any) => {
            try {
                assertObject(data, 'userProfile');
                await fsp.writeFile(USER_PROFILE_FILE, JSON.stringify(data, null, 2));
                return true;
            } catch (e) {
                console.error('Error writing user profile:', e);
                return false;
            }
        });

        // OAuth
        ipcMain.handle('oauth-start', async (_e: any, { provider }: any) => {
            try {
                assertString(provider, 'provider', 20);
                // Determine the current server port (default 5248)
                let settings: any = {};
                try {
                    if (fs.existsSync(SETTINGS_FILE)) {
                        settings = JSON.parse(await fsp.readFile(SETTINGS_FILE, 'utf8'));
                    }
                } catch { /* use default port */ }
                const port = parseInt(settings.automationPort || '5248', 10);
                const url = oauth.generateAuthUrl(provider as any, port);
                await shell.openExternal(url);
                return { success: true };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        });
        ipcMain.handle('oauth-logout', async (_e: any, { provider }: any) => {
            try {
                assertString(provider, 'provider', 20);
                await oauth.revokeTokens(provider as any);
                return { success: true };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        });
        ipcMain.handle('oauth-get-status', async (_e: any, { provider }: any) => {
            try {
                assertString(provider, 'provider', 20);
                const connected = await oauth.isConnected(provider as any);
                return { connected };
            } catch {
                return { connected: false };
            }
        });

        // GitHub Integration
        ipcMain.handle('github-check-scope', async () => {
            try { return await github.checkTokenScope(); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-repos', async (_e: any, { forceRefresh }: any = {}) => {
            try { return await github.getRepos(!!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-pull-requests', async (_e: any, { owner, repo, state, forceRefresh }: any) => {
            try { return await github.getPullRequests(owner, repo, state, !!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-pr-detail', async (_e: any, { owner, repo, prNumber }: any) => {
            try { return await github.getPrDetail(owner, repo, prNumber); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-pr-reviews', async (_e: any, { owner, repo, prNumber }: any) => {
            try { return await github.getPrReviews(owner, repo, prNumber); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-pr-check-status', async (_e: any, { owner, repo, ref }: any) => {
            try { return await github.getPrCheckStatus(owner, repo, ref); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-commits', async (_e: any, { owner, repo, branch, forceRefresh }: any) => {
            try { return await github.getCommits(owner, repo, branch, !!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-branches', async (_e: any, { owner, repo, forceRefresh }: any) => {
            try { return await github.getBranches(owner, repo, !!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-review-requests', async (_e: any, { forceRefresh }: any = {}) => {
            try { return await github.getReviewRequests(!!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-my-open-prs', async (_e: any, { forceRefresh }: any = {}) => {
            try { return await github.getMyOpenPrs(!!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-workflow-runs', async (_e: any, { owner, repo, forceRefresh }: any) => {
            try { return await github.getWorkflowRuns(owner, repo, !!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-deployments', async (_e: any, { owner, repo, forceRefresh }: any) => {
            try { return await github.getDeployments(owner, repo, !!forceRefresh); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-rerun-workflow', async (_e: any, { owner, repo, runId }: any) => {
            try { return await github.rerunWorkflow(owner, repo, runId); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });

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
        
        // Path logic for both development and production
        let iconPath = path.join(__dirname, '../../public/tray.png');
        if (!fs.existsSync(iconPath)) {
            // In production, it might be in out/renderer
            iconPath = path.join(__dirname, '../renderer/tray.png');
        }

        let image = nativeImage.createFromPath(iconPath);
        
        if (image.isEmpty()) {
            console.warn('Tray icon not found at:', iconPath);
            // Fallback to a very simple colored rectangle if missing
            image = nativeImage.createFromBuffer(Buffer.from([0,0,0,0])); 
        }
        
        // Resize to standard tray icon size
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
        // Register q-media protocol
        if (protocol) {
            protocol.handle('q-media', async (request: Request) => {
                const url = new URL(request.url);
                const source = url.hostname; // 'jira' or 'linear'
                const pathParts = url.pathname.split('/').filter(Boolean);
                
                // New URL format: q-media://source/projectId/connectionId/encodedUrl
                // Old URL format: q-media://source/connectionId/encodedUrl
                
                let projectId: string | undefined;
                let connectionId: string | undefined;
                let encodedUrl: string;

                if (pathParts.length >= 3) {
                    projectId = pathParts[0] === 'none' ? undefined : pathParts[0];
                    connectionId = pathParts[1] === 'none' ? undefined : pathParts[1];
                    encodedUrl = pathParts[2];
                } else {
                    connectionId = pathParts[0] === 'none' ? undefined : pathParts[0];
                    encodedUrl = pathParts[1];
                }

                if (!encodedUrl) return new Response(null, { status: 400 });

                try {
                    // Node 16+ supports 'base64url' directly in Buffer.from
                    const decodedUrl = Buffer.from(encodedUrl, 'base64url' as any).toString('utf8');
                    const { data, mimeType } = await integrations.fetchAuthenticatedMedia(decodedUrl, source, connectionId, projectId);

                    return new Response(data, {
                        headers: { 'Content-Type': mimeType }
                    });
                } catch (e) {
                    console.error('[q-media] Failed to fetch:', e);
                    return new Response(null, { status: 500 });
                }
            });
        }

        APP_DATA_DIR = path.join(app.getPath('userData'), 'QAssistantData');
        PROJECTS_FILE = path.join(APP_DATA_DIR, 'projects.json');
        CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'credentials.json');
        ATTACHMENTS_DIR = path.join(APP_DATA_DIR, 'attachments');
        SETTINGS_FILE = path.join(APP_DATA_DIR, 'settings.json');
        USER_PROFILE_FILE = path.join(APP_DATA_DIR, 'user.json');

        if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
        if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

        initFileStorage(ATTACHMENTS_DIR);
        initCredentials(CREDENTIALS_FILE);

        setupIpc();
        // Notify renderer when OAuth completes via the Express callback route
        setOAuthCompleteCallback((provider, userInfo) => {
            mainWindow?.webContents.send('oauth-complete', { provider, userInfo });
        });
        // Auto-start the server so the OAuth /auth/callback endpoint is always available
        const crypto = require('node:crypto');
        startServer(crypto.randomBytes(32).toString('hex'), 5248);
        createWindow();
        createTray();

        if (isMac) {
            const appMenu = Menu.buildFromTemplate([
                {
                    label: app.name,
                    submenu: [
                        { role: 'about' },
                        { type: 'separator' },
                        { role: 'services' },
                        { type: 'separator' },
                        { role: 'hide' },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        { role: 'quit' }
                    ]
                },
                {
                    label: 'Edit',
                    submenu: [
                        { role: 'undo' },
                        { role: 'redo' },
                        { type: 'separator' },
                        { role: 'cut' },
                        { role: 'copy' },
                        { role: 'paste' },
                        { role: 'selectAll' }
                    ]
                }
            ]);
            Menu.setApplicationMenu(appMenu);
        } else {
            Menu.setApplicationMenu(null);
        }

        const stopReminderService = startReminderService(PROJECTS_FILE);
        app.on('before-quit', () => {
            (app as any).isQuiting = true;
            stopReminderService();
        });
    });

    app.on('window-all-closed', () => {
        const settings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};
        if (process.platform !== 'darwin' && !settings.minimizeToTray) {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
        } else {
            mainWindow.show();
        }
    });
} else {
    console.error('CRITICAL: Electron app object is undefined even after all rescue attempts!');
}
