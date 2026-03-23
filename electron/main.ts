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
    upsertProjectTestPlan,
    deleteProjectTestPlan,
    upsertProjectEnvironment,
    deleteProjectEnvironment,
    upsertProjectChecklist,
    deleteProjectChecklist,
    upsertProjectTestRunSession,
    deleteProjectTestRunSession,
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
import {
    configureCloudStateIo,
    ensureCloudStateForSignedInUser,
    scheduleCloudStateUpload,
} from './cloudState'
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
import { registerProjectHandlers } from './ipc/project-handlers';
import { registerAppHandlers } from './ipc/app-handlers';
import { registerAiHandlers } from './ipc/ai-handlers';
import { registerFileHandlers } from './ipc/file-handlers';
import { registerSyncHandlers } from './ipc/sync-handlers';
import { registerIntegrationHandlers } from './ipc/integration-handlers';
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
        let geminiServiceInstance: GeminiService | null = null;
        let geminiServiceKey: string | null = null;
        function getGeminiService(apiKey: string): GeminiService {
            if (geminiServiceInstance === null || geminiServiceKey !== apiKey) {
                geminiServiceInstance = new GeminiService(apiKey);
                geminiServiceKey = apiKey;
            }
            return geminiServiceInstance;
        }

        registerProjectHandlers(ipcMain, {
            getAllProjects,
            saveAllProjects,
            upsertProjectNote,
            deleteProjectNote,
            upsertProjectTask,
            deleteProjectTask,
            upsertProjectHandoff,
            insertProjectCollaborationEvent,
            upsertProjectTestPlan,
            deleteProjectTestPlan,
            upsertProjectEnvironment,
            deleteProjectEnvironment,
            upsertProjectChecklist,
            deleteProjectChecklist,
            upsertProjectTestRunSession,
            deleteProjectTestRunSession,
            startTimer,
            incrementCounter,
            measureMainMetric,
            assertArray,
            assertString,
            assertObject,
            scheduleCloudStateUpload,
            APP_DATA_DIR,
        });

        registerAppHandlers(ipcMain, {
            recordRendererMetric,
            getPerformanceSnapshot,
            readSettings,
            syncCredentialStorageAcknowledgement,
            checkForAppUpdate,
            getAppUpdateState,
            downloadAppUpdate,
            installAppUpdate,
            dismissAppUpdate,
            getCredentialStorageStatusSummary,
            setCredential,
            getCredential,
            deleteCredential,
            listCredentials,
            authGetStatus,
            authSignIn,
            authSignOut,
            authSignUp,
            authRefreshProfile,
            getAuthErrorStatus,
            teardownSync,
            ensureCloudStateForSignedInUser,
            scheduleCloudStateUpload,
            USER_PROFILE_FILE,
            SETTINGS_FILE,
            fsp,
            fs,
            app,
            assertString,
            assertObject,
            assertNumber,
        });

        registerAiHandlers(ipcMain, {
            checkAiRateLimit,
            getGeminiService,
            accuracy,
            errMsg,
            assertString,
            assertArray,
            assertObject,
        });

        registerFileHandlers(ipcMain, {
            isValidExternalUrl,
            isPathWithin,
            saveFile,
            saveBytes,
            deleteFile,
            report,
            reportBuilder,
            bugReport,
            mainWindow,
            dialog,
            BrowserWindow,
            shell,
            ATTACHMENTS_DIR,
            APP_DATA_DIR,
            fsp,
            fs,
            path,
            assertString,
            assertObject,
            assertArray,
            errMsg,
        });

        registerSyncHandlers(ipcMain, {
            getSyncConfig,
            getSyncStatus,
            initSync,
            createWorkspace,
            joinWorkspace,
            disconnectWorkspace,
            getWorkspaceInfo,
            getWorkspaceInvite,
            rotateWorkspaceInvite,
            triggerManualSync,
            pushTaskCollab,
            pushHandoff,
            pushCollabEvent,
            pushArtifactLink,
            getTaskById,
            getHandoffById,
            scheduleCloudStateUpload,
            assertString,
            assertOptionalString,
            assertNumber,
            assertObject,
            assertSyncTaskCollabArgs,
            assertSyncHandoffArgs,
            assertSyncCollabEventArgs,
            assertSyncArtifactLinkArgs,
        });

        registerIntegrationHandlers(ipcMain, {
            integrations,
            health,
            oauth,
            github,
            SapHacService,
            MAX_SAP_HAC_INSTANCES,
            isServerRunning,
            startServer,
            crypto,
            SETTINGS_FILE,
            fsp,
            fs,
            shell,
            assertString,
            errMsg,
            assertAutomationArgs,
            getServerPort,
            stopServer,
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

        // Wire sync/auth → renderer notifications (safe to do before window exists)
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
        configureCloudStateIo({
            readSettings: async () => await readSettings(),
            writeSettings: async (next) => {
                await fsp.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2));
                await syncCredentialStorageAcknowledgement();
            },
            getAllProjects: () => getAllProjects(),
            saveAllProjects: (projects) => saveAllProjects(projects),
            readUserProfile: async () => {
                if (!fs.existsSync(USER_PROFILE_FILE)) return null;
                const content = await fsp.readFile(USER_PROFILE_FILE, 'utf8');
                return JSON.parse(content);
            },
            writeUserProfile: async (profile) => {
                await fsp.writeFile(USER_PROFILE_FILE, JSON.stringify(profile, null, 2));
            },
            deleteUserProfile: async () => {
                if (fs.existsSync(USER_PROFILE_FILE)) {
                    await fsp.unlink(USER_PROFILE_FILE);
                }
            },
            listCredentials: async () => await listCredentials(),
            setCredential: async (key, value) => {
                await setCredential(key, value);
            },
            deleteCredential: async (key) => {
                await deleteCredential(key);
            },
        });

        // Create the window immediately — DB init is deferred below so the
        // window can start rendering while the database opens in the background.
        createWindow();
        createTray();

        // Defer DB init + IPC setup to the next event loop tick so Chromium
        // can begin loading the renderer HTML before we block on SQLite.
        setImmediate(async () => {
            const DB_FILE = path.join(APP_DATA_DIR, 'qassistant.db');
            initDatabase(DB_FILE);
            migrateLegacyEnvironmentSecretsToSecureStore().catch(error => {
                console.warn('[db] Legacy environment secret migration failed:', error);
            });

            // One-time migration: import projects.json into SQLite if it exists and DB is empty
            migrateJsonToSqlite(PROJECTS_FILE);

            initFileStorage(ATTACHMENTS_DIR);

            setupIpc();

            // Notify renderer when OAuth completes via the Express callback route
            setOAuthCompleteCallback((provider, userInfo) => {
                mainWindow?.webContents.send('oauth-complete', { provider, userInfo });
            });

            // Signal renderer that IPC handlers and database are ready.
            // MainLayout listens for this and retries loadProjects() if the initial
            // call returned empty (because DB wasn't ready yet).
            mainWindow?.webContents.send('ipc-ready');
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

        app.on('before-quit', (event) => {
            (app as any).isQuiting = true;
            stopReminderService();
            teardownSync().catch(() => {});
            // Ask renderer to flush any debounced pending save before closing the DB
            if (mainWindow && !mainWindow.isDestroyed()) {
                event.preventDefault();
                mainWindow.webContents.send('flush-pending-save');
                setTimeout(() => {
                    closeDatabase();
                    app.exit(0);
                }, 150);
            } else {
                closeDatabase();
            }
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
