import * as fs from 'node:fs';
const fsp = fs.promises;
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

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

import {
    setCredential,
    getCredential,
    deleteCredential,
    listCredentials,
    initCredentials,
    getCredentialStorageStatus as getCredentialStorageStatusSummary,
    setPlaintextFallbackAllowed,
} from './credentialService';
import * as oauth from './oauth';
import * as github from './github';
import { assertString, assertArray, assertObject, assertOptionalString, assertNumber } from './ipc-validation';
import { AI_RATE_LIMIT_MS, MAX_SAP_HAC_INSTANCES } from './constants';
import { initFileStorage } from './fileStorage';
import {
    initDatabase,
    getAllProjects,
    saveAllProjects,
    closeDatabase,
    getTaskById,
    getHandoffById,
    migrateLegacyEnvironmentSecretsToSecureStore,
    upsertProjectNote,
    deleteProjectNote,
    upsertProjectTask,
    deleteProjectTask,
    upsertProjectHandoff,
    insertProjectCollaborationEvent,
} from './database';
import { migrateJsonToSqlite } from './migration';
import {
    initSync, teardownSync, getStatus as getSyncStatus, getSyncConfig,
    createWorkspace, joinWorkspace, disconnectWorkspace, getWorkspaceInfo, getWorkspaceInvite, rotateWorkspaceInvite,
    triggerManualSync, setSyncWindowSender, setSyncLogDir, onAppFocused,
    pushTaskCollab, pushHandoff, pushCollabEvent, pushArtifactLink,
} from './sync';
import {
    authGetStatus,
    authRefreshProfile,
    getAuthErrorStatus,
    authSignIn,
    authSignOut,
    authSignUp,
    configureAuthIo,
    initAuth,
    setAuthWindowSender,
} from './auth';
import { GeminiService } from './gemini';
import { startServer, stopServer, setOAuthCompleteCallback, getServerPort, isServerRunning } from './server';
import { startReminderService } from './reminders';
import * as health from './health';
import * as report from './report';
import * as reportBuilder from './report-builder';
import * as integrations from './integrations';
import { saveFile, saveBytes, deleteFile } from './fileStorage';
import * as bugReport from './bug-report';
import { SapHacService } from './sapHac';
import * as accuracy from './accuracy';
import {
    checkForAppUpdate,
    dismissAppUpdate,
    downloadAppUpdate,
    getAppUpdateEventChannel,
    getAppUpdateState,
    initAppUpdater,
    installAppUpdate,
} from './appUpdater';
import {
    getPerformanceSnapshot,
    incrementCounter,
    measureMainMetric,
    recordRendererMetric,
    startTimer,
} from './perf';
// trayIconBase64 removed to use file-based icon
// BOOTSTRAP: This self-executing function finds the REAL Electron API even if shadowed.
/* eslint-disable @typescript-eslint/no-require-imports */
const electron = (function() {
    try {
        const e = require('electron');
        if (typeof e === 'object' && e.app) return e;
    } catch {} // eslint-disable-line no-empty

    try {
        const e = require('node:electron');
        if (typeof e === 'object' && e.app) return e;
    } catch {} // eslint-disable-line no-empty

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
        try { fs.unlinkSync(rescuePath); } catch {} // eslint-disable-line no-empty
        if (typeof e === 'object' && e.app) return e;
    } catch {} // eslint-disable-line no-empty

    return require('electron');
})();
/* eslint-enable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, protocol } = electron || {};

if (protocol) {
    protocol.registerSchemesAsPrivileged([
        { scheme: 'q-media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
    ]);
}

if (app) {
    const appBootStartedAt = startTimer();
    const _cacheRunId = `${Date.now().toString(36)}-${process.pid}-${Math.floor(Math.random() * 0x100000).toString(36)}`;
    const _chromiumCacheRoot = path.join(os.tmpdir(), 'qassistant-chrome-cache');
    const _runCacheDir = path.join(_chromiumCacheRoot, _cacheRunId);

    try {
        if (!fs.existsSync(_chromiumCacheRoot)) fs.mkdirSync(_chromiumCacheRoot, { recursive: true });
    } catch (e) {
        console.warn('Could not prepare Chromium cache root directory:', e);
    }

    let mainWindow: any = null;
    let wasFullscreenBeforeHide = false;
    let APP_DATA_DIR = '';
    let PROJECTS_FILE = '';
    let CREDENTIALS_FILE = '';
    let ATTACHMENTS_DIR = '';
    let SETTINGS_FILE = '';
    let UPDATER_DATA_DIR = '';
    let tray: any = null;
    let USER_PROFILE_FILE = '';
    let stopReminderService = () => {};
    let deferredStartupStarted = false;
    let startDeferredServices = () => {};

    const isMac = process.platform === 'darwin';
    const appUserModelId = 'com.lewandowskista.qassistant';

    function resolveWindowIconPath(): string | undefined {
        const candidates = [
            path.join(__dirname, '../../build/icon.png'),
            path.join(process.resourcesPath, 'icon.png')
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return undefined;
    }

    // SECURITY: Helper to validate paths are within allowed directories
    function isPathWithin(targetPath: string, baseDir: string): boolean {
        const resolvedTarget = path.resolve(targetPath);
        const resolvedBase = path.resolve(baseDir);
        const relative = path.relative(resolvedBase, resolvedTarget);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
        const windowCreateStartedAt = startTimer();
        const windowIcon = !isMac ? resolveWindowIconPath() : undefined;

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
                sandbox: true
            },
            backgroundColor: '#0f0f13',
            show: false,
            icon: windowIcon
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
                measureMainMetric('windowReadyToShowMs', windowCreateStartedAt);
                mainWindow.show();
                mainWindow.webContents.send('window-maximized-status', mainWindow.isMaximized());
                mainWindow.webContents.send(getAppUpdateEventChannel(), getAppUpdateState());
                startDeferredServices();
            }
        });

        // Auto-sync on focus: pull remote changes whenever the user brings the app to the foreground
        mainWindow.on('focus', () => {
            onAppFocused().catch(e => console.warn('[sync] onAppFocused failed:', e));
        });

        // On macOS, clicking the red dot should hide the window (not destroy it)
        // so it can be restored from the Dock without crashing.
        mainWindow.on('close', (event: any) => {
            if (process.platform === 'darwin' && !app.isQuiting) {
                event.preventDefault();
                // If the window is currently fullscreen, exit fullscreen first before
                // hiding. Hiding a fullscreen window on macOS causes a black screen when
                // it is later shown again via the Dock. We remember the state so we can
                // re-enter fullscreen on restore.
                if (mainWindow?.isFullScreen()) {
                    wasFullscreenBeforeHide = true;
                    mainWindow.once('leave-full-screen', () => {
                        mainWindow?.hide();
                    });
                    mainWindow.setFullScreen(false);
                } else {
                    wasFullscreenBeforeHide = false;
                    mainWindow?.hide();
                }
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

    /** Returns the most informative string from an unknown catch value, preserving stack traces. */
    function errMsg(err: unknown): string {
        if (err instanceof Error) return err.stack || err.message;
        return String(err);
    }

    async function readSettings(): Promise<Record<string, unknown>> {
        try {
            if (!SETTINGS_FILE || !fs.existsSync(SETTINGS_FILE)) return {};
            const content = await fsp.readFile(SETTINGS_FILE, 'utf8');
            const parsed = JSON.parse(content);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            console.error('settings.json has unexpected shape â€” resetting to defaults.');
        } catch (error) {
            console.warn('[settings] Failed to read settings:', error);
        }
        return {};
    }

    async function syncCredentialStorageAcknowledgement(): Promise<void> {
        const settings = await readSettings();
        setPlaintextFallbackAllowed(settings.allowInsecureCredentialStorage === true);
    }

    function assertAutomationArgs(args: unknown) {
        assertObject(args, 'automationArgs');
        const payload = args as Record<string, unknown>;
        assertString(payload.apiKey, 'apiKey', 500);
        if (payload.port !== undefined) assertNumber(payload.port, 'port', 1024, 65535);
    }

    function assertSyncTaskCollabArgs(args: unknown) {
        assertObject(args, 'syncTaskCollabArgs');
        const payload = args as Record<string, unknown>;
        assertString(payload.projectId, 'projectId', 200);
        assertString(payload.taskId, 'taskId', 200);
        assertString(payload.collabState, 'collabState', 50);
        assertOptionalString(payload.activeHandoffId, 'activeHandoffId', 200);
        if (payload.updatedAt !== undefined) assertNumber(payload.updatedAt, 'updatedAt', 0);
    }

    function assertSyncHandoffArgs(args: unknown) {
        assertObject(args, 'syncHandoffArgs');
        const payload = args as Record<string, unknown>;
        assertString(payload.projectId, 'projectId', 200);
        assertObject(payload.handoff, 'handoff');
        const handoff = payload.handoff as Record<string, unknown>;
        assertString(handoff.id, 'handoff.id', 200);
        assertString(handoff.taskId, 'handoff.taskId', 200);
        assertString(handoff.type, 'handoff.type', 50);
        assertString(handoff.createdByRole, 'handoff.createdByRole', 50);
        assertNumber(handoff.createdAt, 'handoff.createdAt', 0);
        assertNumber(handoff.updatedAt, 'handoff.updatedAt', 0);
    }

    function assertSyncCollabEventArgs(args: unknown) {
        assertObject(args, 'syncCollabEventArgs');
        const payload = args as Record<string, unknown>;
        assertString(payload.projectId, 'projectId', 200);
        assertObject(payload.event, 'event');
        const event = payload.event as Record<string, unknown>;
        assertString(event.id, 'event.id', 200);
        assertString(event.taskId, 'event.taskId', 200);
        assertString(event.eventType, 'event.eventType', 80);
        assertString(event.actorRole, 'event.actorRole', 50);
        assertNumber(event.timestamp, 'event.timestamp', 0);
        assertOptionalString(event.handoffId, 'event.handoffId', 200);
        if (event.title !== undefined && event.title !== null) assertString(event.title, 'event.title', 500);
        if (event.details !== undefined && event.details !== null) assertString(event.details, 'event.details', 10_000);
    }

    function assertSyncArtifactLinkArgs(args: unknown) {
        assertObject(args, 'syncArtifactLinkArgs');
        const payload = args as Record<string, unknown>;
        assertString(payload.projectId, 'projectId', 200);
        assertObject(payload.link, 'link');
        const link = payload.link as Record<string, unknown>;
        assertString(link.id, 'link.id', 200);
        assertString(link.sourceType, 'link.sourceType', 50);
        assertString(link.sourceId, 'link.sourceId', 200);
        assertString(link.targetType, 'link.targetType', 50);
        assertString(link.targetId, 'link.targetId', 200);
        assertString(link.label, 'link.label', 100);
        assertNumber(link.createdAt, 'link.createdAt', 0);
    }

    function setupIpc() {
        ipcMain.handle('get-app-data-path', () => APP_DATA_DIR);
        ipcMain.handle('read-projects-file', () => {
            try {
                return getAllProjects();
            } catch (e) {
                console.error('Error reading projects from SQLite:', e);
                return [];
            }
        });
        ipcMain.handle('write-projects-file', (_e: any, data: any) => {
            const startedAt = startTimer();
            try {
                assertArray(data, 'projects');
                incrementCounter('fullProjectWrites');
                saveAllProjects(data);
                measureMainMetric('lastFullProjectWriteMs', startedAt);
                return true;
            } catch (e) {
                measureMainMetric('lastFullProjectWriteMs', startedAt);
                console.error('Error writing projects to SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('upsert-project-note', (_e: any, { projectId, note }: any) => {
            try {
                assertString(projectId, 'projectId', 200);
                assertObject(note, 'note');
                upsertProjectNote(projectId, note);
                incrementCounter('granularNoteWrites');
                return true;
            } catch (e) {
                console.error('Error writing note to SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('delete-project-note', (_e: any, { projectId, noteId }: any) => {
            try {
                assertString(projectId, 'projectId', 200);
                assertString(noteId, 'noteId', 200);
                deleteProjectNote(projectId, noteId);
                incrementCounter('granularNoteDeletes');
                return true;
            } catch (e) {
                console.error('Error deleting note from SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('upsert-project-task', (_e: any, { projectId, task }: any) => {
            try {
                assertString(projectId, 'projectId', 200);
                assertObject(task, 'task');
                upsertProjectTask(projectId, task);
                incrementCounter('granularTaskWrites');
                return true;
            } catch (e) {
                console.error('Error writing task to SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('delete-project-task', (_e: any, { projectId, taskId }: any) => {
            try {
                assertString(projectId, 'projectId', 200);
                assertString(taskId, 'taskId', 200);
                deleteProjectTask(projectId, taskId);
                incrementCounter('granularTaskDeletes');
                return true;
            } catch (e) {
                console.error('Error deleting task from SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('upsert-project-handoff', (_e: any, { projectId, handoff }: any) => {
            try {
                assertString(projectId, 'projectId', 200);
                assertObject(handoff, 'handoff');
                upsertProjectHandoff(projectId, handoff);
                incrementCounter('granularHandoffWrites');
                return true;
            } catch (e) {
                console.error('Error writing handoff to SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('insert-project-collaboration-event', (_e: any, { projectId, event }: any) => {
            try {
                assertString(projectId, 'projectId', 200);
                assertObject(event, 'event');
                insertProjectCollaborationEvent(projectId, event);
                incrementCounter('granularCollaborationEventWrites');
                return true;
            } catch (e) {
                console.error('Error writing collaboration event to SQLite:', e);
                return false;
            }
        });
        ipcMain.handle('record-performance-metric', (_e: any, { name, value }: any) => {
            try {
                assertString(name, 'name', 100);
                assertNumber(value, 'value', 0);
                recordRendererMetric(name, value);
                return true;
            } catch {
                return false;
            }
        });
        ipcMain.handle('get-performance-metrics', () => getPerformanceSnapshot());
        ipcMain.handle('read-settings-file', async () => {
            try {
                return await readSettings();
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
                await syncCredentialStorageAcknowledgement();
                return true;
            } catch (e) {
                console.error('Error writing settings file:', e);
                return false;
            }
        });
        ipcMain.handle('get-app-update-state', () => getAppUpdateState());
        ipcMain.handle('check-app-update', async () => await checkForAppUpdate());
        ipcMain.handle('download-app-update', async () => await downloadAppUpdate());
        ipcMain.handle('install-app-update', () => {
            installAppUpdate();
            return true;
        });
        ipcMain.handle('dismiss-app-update', async (_e: any, version: unknown) => {
            assertString(version, 'version', 100);
            return await dismissAppUpdate(version);
        });
        ipcMain.handle('get-credential-storage-status', () => getCredentialStorageStatusSummary());
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
        ipcMain.handle('select-file', async (_e: any, filters?: Electron.FileFilter[]) => {
            if (!mainWindow) return null;
            const res = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                ...(filters && filters.length > 0 ? { filters } : {})
            });
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

        // Singleton GeminiService cache keyed by API key.
        // Preserves preferredModel state across calls so the fallback learning persists
        // within the session instead of resetting on every IPC invocation.
        let geminiServiceInstance: GeminiService | null = null;
        let geminiServiceKey: string | null = null;
        function getGeminiService(apiKey: string): GeminiService {
            if (geminiServiceInstance === null || geminiServiceKey !== apiKey) {
                geminiServiceInstance = new GeminiService(apiKey);
                geminiServiceKey = apiKey;
            }
            return geminiServiceInstance;
        }

        ipcMain.handle('ai-generate-cases', async (_e: any, { apiKey, tasks, sourceName, project, designDoc, modelName, comments }: any) => {
            const rateErr = checkAiRateLimit('ai-generate-cases'); if (rateErr) return rateErr;
            assertString(apiKey, 'apiKey');
            try {
                return await getGeminiService(apiKey).generateTestCases(tasks, sourceName, project, designDoc, modelName, comments);
            } catch (err: any) {
                // Return a flat wrapper to the IPC boundary to safely cross context bridges without native cloning recursion
                return { __isError: true, message: errMsg(err) };
            }
        });
        ipcMain.handle('automation-api-start', async (_e: any, args: any) => {
            assertAutomationArgs(args);
            startServer(args.apiKey, args.port);
            return { running: isServerRunning(), port: getServerPort() };
        });
        ipcMain.handle('automation-api-stop', () => stopServer());
        ipcMain.handle('automation-api-restart', async (_e: any, args: any) => {
            assertAutomationArgs(args);
            stopServer();
            startServer(args.apiKey, args.port);
            return { running: isServerRunning(), port: getServerPort() };
        });
        ipcMain.handle('automation-api-status', () => ({ running: isServerRunning(), port: getServerPort() }));
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
        ipcMain.handle('delete-attachment', async (_e: any, payload: any) => {
            const filePath = typeof payload === 'string' ? payload : payload?.filePath;
            if (typeof filePath !== 'string') return { success: false, error: 'Invalid file path' };
            if (isPathWithin(filePath, ATTACHMENTS_DIR)) {
                const success = await deleteFile(filePath);
                return success ? { success: true } : { success: false, error: 'Delete failed' };
            }
            console.warn('Blocked attempt to delete file outside attachments:', filePath);
            return { success: false, error: 'Access denied' };
        });
        ipcMain.handle('read-attachment-preview', async (_e: any, payload: any) => {
            const filePath = typeof payload === 'string' ? payload : payload?.filePath;
            if (typeof filePath !== 'string') return { success: false, error: 'Invalid file path' };
            if (!isPathWithin(filePath, ATTACHMENTS_DIR)) {
                console.warn('Blocked attempt to read attachment preview outside attachments:', filePath);
                return { success: false, error: 'Access denied' };
            }

            try {
                if (!fs.existsSync(filePath)) {
                    return { success: false, error: 'File not found' };
                }

                const buffer = await fsp.readFile(filePath);
                const ext = path.extname(filePath).toLowerCase();
                let mimeType = 'application/octet-stream';
                switch (ext) {
                    case '.png': mimeType = 'image/png'; break;
                    case '.jpg':
                    case '.jpeg': mimeType = 'image/jpeg'; break;
                    case '.gif': mimeType = 'image/gif'; break;
                    case '.bmp': mimeType = 'image/bmp'; break;
                    case '.webp': mimeType = 'image/webp'; break;
                    case '.svg': mimeType = 'image/svg+xml'; break;
                }

                return {
                    success: true,
                    dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`
                };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        });

        // Attachment cleanup
        ipcMain.handle('scan-orphaned-attachments', async (_e: any, { referencedPaths }: { referencedPaths: string[] }) => {
            try {
                if (!fs.existsSync(ATTACHMENTS_DIR)) return { orphaned: [], totalSize: 0 };
                const referenced = new Set(referencedPaths.map(p => path.normalize(p)));
                const files = await fsp.readdir(ATTACHMENTS_DIR);
                const orphaned: { filePath: string; fileName: string; fileSizeBytes: number }[] = [];
                let totalSize = 0;
                for (const file of files) {
                    const filePath = path.join(ATTACHMENTS_DIR, file);
                    const stat = await fsp.stat(filePath).catch(() => null);
                    if (!stat || !stat.isFile()) continue;
                    if (!referenced.has(path.normalize(filePath))) {
                        orphaned.push({ filePath, fileName: file, fileSizeBytes: stat.size });
                        totalSize += stat.size;
                    }
                }
                return { orphaned, totalSize };
            } catch (e: unknown) {
                return { __isError: true, message: errMsg(e) };
            }
        });
        ipcMain.handle('delete-orphaned-attachments', async (_e: any, { filePaths }: { filePaths: string[] }) => {
            let deleted = 0;
            for (const filePath of filePaths) {
                if (!isPathWithin(filePath, ATTACHMENTS_DIR)) continue;
                const success = await deleteFile(filePath);
                if (success) deleted++;
            }
            return { deleted };
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
                shell.openPath(filePath);
            }
        });
        ipcMain.handle('ai-list-models', async (_e: any, { apiKey }: any) => {
            try {
                assertString(apiKey, 'apiKey');
                return await new GeminiService(apiKey).listAvailableModels();
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-analyze-issue', async (_e: any, { apiKey, task, comments, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-analyze-issue'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await getGeminiService(apiKey).analyzeIssue(task, comments, project, 0, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-analyze', async (_e: any, { apiKey, context, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-analyze'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await getGeminiService(apiKey).analyzeProject(context, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-criticality', async (_e: any, { apiKey, tasks, testPlans, executions, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-criticality'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await getGeminiService(apiKey).assessCriticality(tasks, testPlans, executions, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-test-run-suggestions', async (_e: any, { apiKey, testPlans, executions, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-test-run-suggestions'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await getGeminiService(apiKey).getTestRunSuggestions(testPlans, executions, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-smoke-subset', async (_e: any, { apiKey, candidates, doneTasks, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-smoke-subset'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                return await getGeminiService(apiKey).selectSmokeSubset(candidates, doneTasks, project, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-chat', async (_e: any, { apiKey, userMessage, history, role, project, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-chat'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(userMessage, 'userMessage', 50_000);
                return await getGeminiService(apiKey).chat(userMessage, history || [], role === 'dev' ? 'dev' : 'qa', project, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });

        // AI Accuracy Testing Handlers
        ipcMain.handle('read-document-text', async (_e: any, { filePath }: any) => {
            try {
                assertString(filePath, 'filePath', 2000);
                const text = await accuracy.readDocumentText(filePath);
                const chunks = accuracy.chunkDocument(text, 'preview');
                return { success: true, text, chunkCount: chunks.length };
            }
            catch (err: any) { return { success: false, error: errMsg(err) }; }
        });
        ipcMain.handle('ai-accuracy-extract-claims', async (_e: any, { apiKey, agentResponse, modelName, expectedAnswer }: any) => {
            const rateErr = checkAiRateLimit('ai-accuracy-extract-claims'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(agentResponse, 'agentResponse', 50_000);
                return await getGeminiService(apiKey).extractClaims(agentResponse, modelName, expectedAnswer);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-accuracy-verify-claims', async (_e: any, { apiKey, claims, refChunks, modelName, expectedAnswer }: any) => {
            const rateErr = checkAiRateLimit('ai-accuracy-verify-claims'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertArray(claims, 'claims', 200);
                assertArray(refChunks, 'refChunks', 100);
                return await getGeminiService(apiKey).verifyClaims(claims as any[], refChunks as any[], modelName, expectedAnswer);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-accuracy-score-dimensions', async (_e: any, { apiKey, question, agentResponse, expectedAnswer, claimVerdicts, refChunks, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-accuracy-score-dimensions'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(question, 'question', 10_000);
                assertString(agentResponse, 'agentResponse', 50_000);
                assertArray(claimVerdicts, 'claimVerdicts', 200);
                assertArray(refChunks, 'refChunks', 100);
                return await getGeminiService(apiKey).scoreDimensions(question, agentResponse, claimVerdicts as any[], refChunks as any[], modelName, expectedAnswer);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });
        ipcMain.handle('ai-accuracy-rerank-chunks', async (_e: any, { apiKey, question, agentResponse, chunks, topK, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-accuracy-rerank-chunks'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(question, 'question', 10_000);
                assertString(agentResponse, 'agentResponse', 50_000);
                assertArray(chunks, 'chunks', 100);
                return await getGeminiService(apiKey).rerankChunks(question, agentResponse, chunks as any[], topK ?? 20, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });

        ipcMain.handle('ai-standup-summary', async (_e: any, { apiKey, metrics, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-standup-summary'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertObject(metrics, 'metrics');
                return await getGeminiService(apiKey).generateStandupSummary(metrics, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });

        ipcMain.handle('ai-generate-flexsearch', async (_e: any, { apiKey, naturalLanguageQuery, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-generate-flexsearch'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(naturalLanguageQuery, 'naturalLanguageQuery', 1000);
                return await getGeminiService(apiKey).generateFlexSearch(naturalLanguageQuery, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });

        ipcMain.handle('ai-find-duplicate-bugs', async (_e: any, { apiKey, newBugTitle, newBugDescription, newBugReproSteps, affectedComponents, existingBugs, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-find-duplicate-bugs'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertString(newBugTitle, 'newBugTitle', 500);
                return await getGeminiService(apiKey).findDuplicateBugs(newBugTitle, newBugDescription || '', newBugReproSteps || '', affectedComponents || [], existingBugs || [], modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
        });

        ipcMain.handle('ai-test-impact-analysis', async (_e: any, { apiKey, changedFiles, prTitle, prDescription, testCases, modelName }: any) => {
            const rateErr = checkAiRateLimit('ai-test-impact-analysis'); if (rateErr) return rateErr;
            try {
                assertString(apiKey, 'apiKey');
                assertArray(changedFiles, 'changedFiles', 200);
                assertArray(testCases, 'testCases', 500);
                return await getGeminiService(apiKey).analyzeTestImpact(changedFiles, prTitle || '', prDescription || '', testCases, modelName);
            }
            catch (err: any) { return { __isError: true, message: errMsg(err) }; }
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
                assertObject(p, 'project');
                assertObject(template, 'template');
                assertString(template.name as string, 'template.name', 500);
                assertArray(template.sections, 'template.sections', 100);
                const html = reportBuilder.generateCustomReport(p as any, template as any);
                return { success: true, html };
            } catch (err: any) {
                return { success: false, error: errMsg(err) };
            }
        });

        ipcMain.handle('export-custom-report-pdf', async (_e: any, { project: p, template }: any) => {
            try {
                if (!mainWindow) return { success: false, error: 'No main window' };
                assertObject(p, 'project');
                assertObject(template, 'template');
                assertString(template.name as string, 'template.name', 500);
                assertArray(template.sections, 'template.sections', 100);
                const html = reportBuilder.generateCustomReport(p as any, template as any);
                const res = await dialog.showSaveDialog(mainWindow, {
                    defaultPath: `${(p.name as string).replace(/\s+/g, '-')}-${(template.name as string).replace(/\s+/g, '-')}.pdf`,
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
                return { success: false, error: errMsg(err) };
            }
        });

        // File/CSV Handlers
        ipcMain.handle('read-csv-file', async (_e: any, { filePath }: any) => {
            try {
                assertString(filePath, 'filePath', 1000);
                const resolvedPath = path.resolve(filePath);
                const ext = path.extname(resolvedPath).toLowerCase();
                const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.tsv'];
                if (!ALLOWED_EXTENSIONS.includes(ext)) {
                    return { success: false, error: `File type '${ext}' is not allowed. Only CSV/TXT/TSV files may be imported.` };
                }
                const content = fs.readFileSync(resolvedPath, 'utf8');
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
            if (!res.filePath) return { success: false, error: 'No file path selected.' };
            await fsp.writeFile(res.filePath, content);
            return { success: true, path: res.filePath };
        });

        ipcMain.handle('import-test-results', async (_e: any, { filePath }: any) => {
            try {
                assertString(filePath, 'filePath', 2000);
                const resolvedPath = path.resolve(filePath);
                const ext = path.extname(resolvedPath).toLowerCase();
                if (!['.xml', '.json'].includes(ext)) {
                    return { success: false, error: `Unsupported file type '${ext}'. Use JUnit XML (.xml) or Playwright JSON (.json).` };
                }
                const content = await fsp.readFile(resolvedPath, 'utf8');

                if (ext === '.xml') {
                    // Parse JUnit XML — minimal regex-based parser (no dependencies)
                    const suites: any[] = [];
                    const suiteRe = /<testsuite([^>]*)>([\s\S]*?)<\/testsuite>/g;
                    const caseRe = /<testcase([^>]*)>([\s\S]*?)<\/testcase>|<testcase([^>]*)\/>/g;
                    const attrRe = /(\w+)="([^"]*)"/g;

                    const parseAttrs = (str: string) => {
                        const attrs: Record<string, string> = {};
                        let m;
                        while ((m = attrRe.exec(str)) !== null) attrs[m[1]] = m[2];
                        attrRe.lastIndex = 0;
                        return attrs;
                    };

                    let sm;
                    while ((sm = suiteRe.exec(content)) !== null) {
                        const suiteAttrs = parseAttrs(sm[1]);
                        const body = sm[2];
                        const cases: any[] = [];
                        let cm;
                        while ((cm = caseRe.exec(body)) !== null) {
                            const cAttrs = parseAttrs(cm[1] || cm[3] || '');
                            const cBody = cm[2] || '';
                            let result: string = 'passed';
                            let failureMsg = '';
                            if (/<failure/i.test(cBody)) { result = 'failed'; const fm = cBody.match(/<failure[^>]*>([\s\S]*?)<\/failure>/i); failureMsg = fm ? fm[1].trim().substring(0, 500) : ''; }
                            else if (/<error/i.test(cBody)) { result = 'failed'; const em = cBody.match(/<error[^>]*>([\s\S]*?)<\/error>/i); failureMsg = em ? em[1].trim().substring(0, 500) : ''; }
                            else if (/<skipped/i.test(cBody)) result = 'skipped';
                            const durationSeconds = cAttrs.time ? parseFloat(cAttrs.time) : undefined;
                            cases.push({ externalId: cAttrs.classname ? `${cAttrs.classname}.${cAttrs.name}` : cAttrs.name, title: cAttrs.name || 'Unnamed', result, actualResult: failureMsg, durationSeconds });
                        }
                        suites.push({ name: suiteAttrs.name || 'Imported Suite', cases });
                    }
                    return { success: true, format: 'junit', suites };
                } else {
                    // Parse Playwright JSON report
                    let pw: any;
                    try { pw = JSON.parse(content); } catch { return { success: false, error: 'Invalid JSON file.' }; }
                    // Playwright report has: { suites: [{ title, specs: [{ title, tests: [{ results: [{ status, duration, error }] }] }] }] }
                    const suites: any[] = [];
                    const flattenSuites = (node: any, parentTitle = '') => {
                        if (!node) return;
                        const title = parentTitle ? `${parentTitle} > ${node.title}` : (node.title || '');
                        if (node.specs && Array.isArray(node.specs)) {
                            const cases: any[] = [];
                            for (const spec of node.specs) {
                                const specTitle = spec.title || 'Unnamed';
                                let result: string = 'passed';
                                let actualResult = '';
                                let durationSeconds: number | undefined;
                                if (spec.tests && spec.tests.length > 0) {
                                    const test = spec.tests[0];
                                    if (test.results && test.results.length > 0) {
                                        const res = test.results[0];
                                        const st = (res.status || '').toLowerCase();
                                        result = st === 'passed' ? 'passed' : st === 'skipped' ? 'skipped' : 'failed';
                                        if (res.error?.message) actualResult = res.error.message.substring(0, 500);
                                        if (res.duration) durationSeconds = res.duration / 1000;
                                    }
                                }
                                cases.push({ externalId: `${title}.${specTitle}`, title: specTitle, result, actualResult, durationSeconds });
                            }
                            if (cases.length > 0) suites.push({ name: title || 'Imported Suite', cases });
                        }
                        if (node.suites && Array.isArray(node.suites)) {
                            for (const s of node.suites) flattenSuites(s, title);
                        }
                    };
                    const rootSuites = pw.suites || (Array.isArray(pw) ? pw : [pw]);
                    for (const s of rootSuites) flattenSuites(s);
                    return { success: true, format: 'playwright', suites };
                }
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        });

        // Integration Handlers
        ipcMain.handle('sync-linear', async (_e: any, { apiKey, teamKey, connectionId }: any) => {
            assertString(apiKey, 'apiKey'); assertString(teamKey, 'teamKey'); assertString(connectionId, 'connectionId');
            return integrations.fetchLinearIssues(apiKey, teamKey, connectionId);
        });
        ipcMain.handle('get-linear-comments', async (_e: any, { apiKey, issueId }: any) => {
            assertString(apiKey, 'apiKey'); assertString(issueId, 'issueId');
            return integrations.getLinearComments(apiKey, issueId);
        });
        ipcMain.handle('add-linear-comment', async (_e: any, { apiKey, issueId, body }: any) => {
            assertString(apiKey, 'apiKey'); assertString(issueId, 'issueId'); assertString(body, 'body', 50_000);
            await integrations.addLinearComment(apiKey, issueId, body); return { success: true };
        });
        ipcMain.handle('get-linear-workflow-states', async (_e: any, { apiKey, teamId }: any) => {
            assertString(apiKey, 'apiKey'); assertString(teamId, 'teamId');
            return integrations.getLinearWorkflowStates(apiKey, teamId);
        });
        ipcMain.handle('update-linear-status', async (_e: any, { apiKey, issueId, stateId }: any) => {
            assertString(apiKey, 'apiKey'); assertString(issueId, 'issueId'); assertString(stateId, 'stateId');
            await integrations.updateLinearIssueStatus(apiKey, issueId, stateId); return { success: true };
        });
        ipcMain.handle('get-linear-history', async (_e: any, { apiKey, issueId }: any) => {
            assertString(apiKey, 'apiKey'); assertString(issueId, 'issueId');
            return integrations.getLinearIssueHistory(apiKey, issueId);
        });
        ipcMain.handle('create-linear-issue', async (_e: any, { apiKey, teamId, title, description, priority }: any) => {
            assertString(apiKey, 'apiKey'); assertString(teamId, 'teamId'); assertString(title, 'title', 500);
            return integrations.createLinearIssue(apiKey, teamId, title, description, priority);
        });

        ipcMain.handle('sync-jira', async (_e: any, { domain, email, apiKey, projectKey, connectionId }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey');
            assertString(projectKey, 'projectKey'); assertString(connectionId, 'connectionId');
            return integrations.fetchJiraIssues(domain, email, apiKey, projectKey, connectionId);
        });
        ipcMain.handle('get-jira-comments', async (_e: any, { domain, email, apiKey, issueKey }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey'); assertString(issueKey, 'issueKey');
            return integrations.getJiraComments(domain, email, apiKey, issueKey);
        });
        ipcMain.handle('add-jira-comment', async (_e: any, { domain, email, apiKey, issueKey, body }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey');
            assertString(issueKey, 'issueKey'); assertString(body, 'body', 50_000);
            await integrations.addJiraComment(domain, email, apiKey, issueKey, body); return { success: true };
        });
        ipcMain.handle('transition-jira-issue', async (_e: any, { domain, email, apiKey, issueKey, transitionName }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey');
            assertString(issueKey, 'issueKey'); assertString(transitionName, 'transitionName');
            await integrations.transitionJiraIssue(domain, email, apiKey, issueKey, transitionName); return { success: true };
        });
        ipcMain.handle('get-jira-history', async (_e: any, { domain, email, apiKey, issueKey }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey'); assertString(issueKey, 'issueKey');
            return integrations.getJiraIssueHistory(domain, email, apiKey, issueKey);
        });
        ipcMain.handle('get-jira-statuses', async (_e: any, { domain, email, apiKey, projectKey }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey'); assertString(projectKey, 'projectKey');
            return integrations.getJiraStatuses(domain, email, apiKey, projectKey);
        });
        ipcMain.handle('create-jira-issue', async (_e: any, { domain, email, apiKey, projectKey, title, description, issueTypeName }: any) => {
            assertString(domain, 'domain'); assertString(email, 'email'); assertString(apiKey, 'apiKey');
            assertString(projectKey, 'projectKey'); assertString(title, 'title', 500);
            return integrations.createJiraIssue(domain, email, apiKey, projectKey, title, description, issueTypeName);
        });

        // SAP HAC Handlers
        const sapHacInstances = new Map<string, any>();
        const getSapHac = (baseUrl: string, ignoreSsl = false) => {
            if (!sapHacInstances.has(baseUrl)) {
                // Evict oldest entry when cache is full to prevent unbounded growth
                if (sapHacInstances.size >= MAX_SAP_HAC_INSTANCES) {
                    const oldestKey = sapHacInstances.keys().next().value;
                    if (typeof oldestKey === 'string') {
                        sapHacInstances.delete(oldestKey);
                    }
                }
                sapHacInstances.set(baseUrl, new SapHacService(baseUrl, ignoreSsl));
            }
            return sapHacInstances.get(baseUrl);
        };

        ipcMain.handle('sap-hac-login', async (_e: any, { baseUrl, user, pass, ignoreSsl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(user, 'user', 200);
            assertString(pass, 'pass', 500);
            try {
                const svc = getSapHac(baseUrl, ignoreSsl);
                const success = await svc.login(user, pass);
                return success ? { success: true } : { success: false, error: 'Login failed' };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
        });
        ipcMain.handle('sap-hac-get-cronjobs', async (_e: any, { baseUrl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            try {
                const data = await getSapHac(baseUrl).getCronJobs();
                return { success: true, data };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
        });
        ipcMain.handle('sap-hac-flexible-search', async (_e: any, { baseUrl, query, max }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(query, 'query', 50_000);
            try {
                const data = await getSapHac(baseUrl).runFlexibleSearch(query, max);
                return { success: !data.Error, data, error: data.Error || undefined };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
        });
        ipcMain.handle('sap-hac-import-impex', async (_e: any, { baseUrl, script, enableCode }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(script, 'script', 500_000);
            try {
                const data = await getSapHac(baseUrl).importImpEx(script, enableCode);
                return { success: data.Success, data, error: data.Success ? undefined : data.Log };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
        });
        ipcMain.handle('sap-hac-get-catalog-versions', async (_e: any, { baseUrl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            try {
                const data = await getSapHac(baseUrl).getCatalogVersions();
                return { success: true, data };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
        });
        ipcMain.handle('sap-hac-get-catalog-ids', async (_e: any, { baseUrl }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            try {
                const data = await getSapHac(baseUrl).getCatalogIds();
                return { success: true, data };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
        });
        ipcMain.handle('sap-hac-get-catalog-sync-diff', async (_e: any, { baseUrl, catalogId, maxMissing }: any) => {
            assertString(baseUrl, 'baseUrl', 500);
            assertString(catalogId, 'catalogId', 500);
            try {
                const data = await getSapHac(baseUrl).getCatalogSyncDiff(catalogId, maxMissing);
                return { success: true, data };
            } catch (e: any) {
                return { success: false, error: e.message || String(e) };
            }
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

        // Primary Supabase Auth
        ipcMain.handle('auth-get-status', async () => {
            try {
                return await authGetStatus();
            } catch (e: any) {
                return getAuthErrorStatus(e.message);
            }
        });
        ipcMain.handle('auth-sign-in', async (_e: any, { email, password }: any) => {
            try {
                assertString(email, 'email', 200);
                assertString(password, 'password', 200);
                return await authSignIn(email, password);
            } catch (e: any) {
                return getAuthErrorStatus(e.message);
            }
        });
        ipcMain.handle('auth-sign-up', async (_e: any, { email, password, displayName }: any) => {
            try {
                assertString(email, 'email', 200);
                assertString(password, 'password', 200);
                assertString(displayName, 'displayName', 100);
                return await authSignUp(email, password, displayName);
            } catch (e: any) {
                return getAuthErrorStatus(e.message);
            }
        });
        ipcMain.handle('auth-sign-out', async () => {
            try {
                // Tear down sync first (while session is still valid) so the
                // realtime channel can be cleanly removed before the token is invalidated.
                await teardownSync();
                const status = await authSignOut();
                return status;
            } catch (e: any) {
                return getAuthErrorStatus(e.message);
            }
        });
        ipcMain.handle('auth-refresh-profile', async () => {
            try {
                return await authRefreshProfile();
            } catch (e: any) {
                return getAuthErrorStatus(e.message);
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
                if (!isServerRunning()) {
                    startServer(crypto.randomBytes(32).toString('hex'), port);
                }
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
        ipcMain.handle('github-get-pr-comments', async (_e: any, { owner, repo, prNumber }: any) => {
            try { return await github.getPrComments(owner, repo, prNumber); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-workflow-jobs', async (_e: any, { owner, repo, runId }: any) => {
            try { return await github.getWorkflowJobs(owner, repo, runId); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-get-workflows-list', async (_e: any, { owner, repo }: any) => {
            try { return await github.getWorkflowsList(owner, repo); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });
        ipcMain.handle('github-dispatch-workflow', async (_e: any, { owner, repo, workflowId, ref }: any) => {
            try { return await github.dispatchWorkflow(owner, repo, workflowId, ref); }
            catch (e: any) { return { __isError: true, message: e.message }; }
        });

        ipcMain.handle('get-system-info', () => ({
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.versions.node,
            electronVersion: process.versions.electron,
            appVersion: app.getVersion()
        }));
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

        // ── Cloud Sync (Phase 2) ──────────────────────────────────────────────
        ipcMain.handle('sync-get-config', async () => {
            try { return await getSyncConfig(); }
            catch (e: any) { return { configured: false, error: e.message }; }
        });
        ipcMain.handle('sync-get-status', () => getSyncStatus());
        ipcMain.handle('sync-init', async () => {
            try { return await initSync(); }
            catch (e: any) { return { ok: false, status: 'error', error: e.message }; }
        });
        ipcMain.handle('sync-create-workspace', async (_e: any, { workspaceName, displayName }: any) => {
            try {
                assertString(workspaceName, 'workspaceName', 200);
                if (displayName !== undefined && displayName !== null) assertString(displayName, 'displayName', 100);
                return await createWorkspace(workspaceName, displayName);
            } catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-join-workspace', async (_e: any, { inviteCode, displayName }: any) => {
            try {
                assertString(inviteCode, 'inviteCode', 64);
                if (displayName !== undefined && displayName !== null) assertString(displayName, 'displayName', 100);
                return await joinWorkspace(inviteCode, displayName);
            } catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-disconnect', async () => {
            try { await disconnectWorkspace(); return { ok: true }; }
            catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-get-workspace-info', async () => {
            try { return await getWorkspaceInfo(); }
            catch (e: any) { return { workspaceId: null, error: e.message }; }
        });
        ipcMain.handle('sync-get-workspace-invite', async () => {
            try { return await getWorkspaceInvite(); }
            catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-rotate-workspace-invite', async () => {
            try { return await rotateWorkspaceInvite(); }
            catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-manual', async () => {
            try { return await triggerManualSync(); }
            catch (e: any) { return { ok: false, error: e.message }; }
        });

        // Granular sync push handlers — called by the renderer after collaborative mutations
        ipcMain.handle('sync-push-task-collab', (_e: any, args: any) => {
            try {
                assertSyncTaskCollabArgs(args);
                const { projectId, taskId, collabState, activeHandoffId, updatedAt } = args;
                pushTaskCollab(projectId, taskId, collabState, activeHandoffId ?? null, updatedAt ?? Date.now());
                return { ok: true };
            } catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-push-handoff', (_e: any, args: any) => {
            try {
                assertSyncHandoffArgs(args);
                const { projectId, handoff } = args;
                pushHandoff(projectId, handoff);
                return { ok: true };
            } catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-push-collab-event', (_e: any, args: any) => {
            try {
                assertSyncCollabEventArgs(args);
                const { projectId, event } = args;
                pushCollabEvent(projectId, event);
                return { ok: true };
            } catch (e: any) { return { ok: false, error: e.message }; }
        });
        ipcMain.handle('sync-push-artifact-link', (_e: any, args: any) => {
            try {
                assertSyncArtifactLinkArgs(args);
                const { projectId, link } = args;
                pushArtifactLink(projectId, link);
                return { ok: true };
            } catch (e: any) { return { ok: false, error: e.message }; }
        });

        // Granular DB queries for post-sync targeted refresh (Improvement 5)
        ipcMain.handle('get-task-by-id', (_e: any, taskId: string) => {
            try {
                assertString(taskId, 'taskId', 200);
                return getTaskById(taskId);
            } catch { return null; }
        });
        ipcMain.handle('get-handoff-by-id', (_e: any, handoffId: string) => {
            try {
                assertString(handoffId, 'handoffId', 200);
                return getHandoffById(handoffId);
            } catch { return null; }
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
        measureMainMetric('appWhenReadyMs', appBootStartedAt);
        if (process.platform === 'win32' && typeof app.setAppUserModelId === 'function') {
            app.setAppUserModelId(appUserModelId);
        }

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
                    const message = e instanceof Error ? e.message : String(e);
                    const status = message.startsWith('Blocked') ? 403 : 500;
                    return new Response(null, { status });
                }
            });
        }

        APP_DATA_DIR = path.join(app.getPath('userData'), 'QAssistantData');
        PROJECTS_FILE = path.join(APP_DATA_DIR, 'projects.json');
        CREDENTIALS_FILE = path.join(APP_DATA_DIR, 'credentials.json');
        ATTACHMENTS_DIR = path.join(APP_DATA_DIR, 'attachments');
        SETTINGS_FILE = path.join(APP_DATA_DIR, 'settings.json');
        UPDATER_DATA_DIR = path.join(APP_DATA_DIR, 'updater');
        USER_PROFILE_FILE = path.join(APP_DATA_DIR, 'user.json');

        if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
        if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
        if (!fs.existsSync(UPDATER_DATA_DIR)) fs.mkdirSync(UPDATER_DATA_DIR, { recursive: true });

        initCredentials(CREDENTIALS_FILE);
        await syncCredentialStorageAcknowledgement();

        // Initialise SQLite database (must happen before setupIpc)
        const DB_FILE = path.join(APP_DATA_DIR, 'qassistant.db');
        initDatabase(DB_FILE);
        migrateLegacyEnvironmentSecretsToSecureStore().catch(error => {
            console.warn('[db] Legacy environment secret migration failed:', error);
        });

        // One-time migration: import projects.json into SQLite if it exists and DB is empty
        migrateJsonToSqlite(PROJECTS_FILE);

        initFileStorage(ATTACHMENTS_DIR);

        // Wire sync → renderer notifications
        setSyncWindowSender((channel: string, ...args: any[]) => {
            mainWindow?.webContents.send(channel, ...args);
        });
        setSyncLogDir(APP_DATA_DIR);
        setAuthWindowSender((channel: string, ...args: any[]) => {
            mainWindow?.webContents.send(channel, ...args);
        });
        configureAuthIo({
            readSettings: async () => await readSettings(),
            writeSettings: async (next) => {
                await fsp.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
                await syncCredentialStorageAcknowledgement();
            },
        });

        setupIpc();
        // Notify renderer when OAuth completes via the Express callback route
        setOAuthCompleteCallback((provider, userInfo) => {
            mainWindow?.webContents.send('oauth-complete', { provider, userInfo });
        });

        startDeferredServices = () => {
            if (deferredStartupStarted) return;
            deferredStartupStarted = true;

            setTimeout(async () => {
                const deferredStartedAt = startTimer();
                try {
                    initAppUpdater({
                        getMainWindow: () => mainWindow,
                        readSettings: async () => await readSettings(),
                        writeSettings: async (next) => {
                            await fsp.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
                            await syncCredentialStorageAcknowledgement();
                        },
                        updaterDataDir: UPDATER_DATA_DIR,
                    });
                } catch (e) {
                    console.warn('[startup] Deferred updater init failed:', e);
                }

                try {
                    await initAuth();
                } catch (e) {
                    console.warn('[auth] Deferred auto-init failed:', e);
                }

                try {
                    const settings = await readSettings();
                    if (settings.automationApiEnabled === true) {
                        const configuredPort = typeof settings.automationPort === 'string'
                            ? parseInt(settings.automationPort, 10)
                            : 5248;
                        startServer(crypto.randomBytes(32).toString('hex'), Number.isFinite(configuredPort) ? configuredPort : 5248);
                    }
                } catch (e) {
                    console.warn('[startup] Deferred automation server start failed:', e);
                }

                try {
                    stopReminderService = startReminderService();
                } catch (e) {
                    console.warn('[startup] Deferred reminder service failed:', e);
                }

                measureMainMetric('deferredStartupMs', deferredStartedAt);
            }, 750);
        };

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

        app.on('before-quit', () => {
            (app as any).isQuiting = true;
            stopReminderService();
            teardownSync().catch(() => {});
            closeDatabase();
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
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            // Force repaint to avoid black screen after un-hiding on macOS
            mainWindow.webContents.invalidate();
            // If the window was fullscreen before it was hidden via the red button,
            // re-enter fullscreen now that it is visible again.
            if (wasFullscreenBeforeHide) {
                wasFullscreenBeforeHide = false;
                mainWindow.setFullScreen(true);
            }
        }
    });
} else {
    console.error('CRITICAL: Electron app object is undefined even after all rescue attempts!');
}
