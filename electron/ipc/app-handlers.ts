import type Electron from 'electron'

export function registerAppHandlers(ipcMain: Electron.IpcMain, deps: {
    recordRendererMetric: (name: string, value: number) => void
    getPerformanceSnapshot: () => any
    readSettings: () => Promise<Record<string, unknown>>
    syncCredentialStorageAcknowledgement: () => Promise<void>
    checkForAppUpdate: () => Promise<any>
    getAppUpdateState: () => any
    downloadAppUpdate: () => Promise<any>
    installAppUpdate: () => void
    dismissAppUpdate: (version: string) => Promise<any>
    getCredentialStorageStatusSummary: () => any
    setCredential: (key: string, value: string) => Promise<void>
    getCredential: (key: string) => Promise<string | null>
    deleteCredential: (key: string) => Promise<any>
    listCredentials: () => Promise<any[]>
    authGetStatus: () => Promise<any>
    authSignIn: (email: string, password: string) => Promise<any>
    authSignOut: () => Promise<any>
    authSignUp: (email: string, password: string, displayName: string) => Promise<any>
    authRefreshProfile: () => Promise<any>
    getAuthErrorStatus: (msg: string) => any
    teardownSync: () => Promise<void>
    ensureCloudStateForSignedInUser: () => Promise<void>
    scheduleCloudStateUpload: () => void
    USER_PROFILE_FILE: string
    SETTINGS_FILE: string
    fsp: typeof import('node:fs/promises')
    fs: typeof import('node:fs')
    app: { getVersion: () => string }
    assertString: (v: unknown, name: string, maxLen?: number) => void
    assertObject: (v: unknown, name: string) => void
    assertNumber: (v: unknown, name: string, min?: number, max?: number) => void
}): void {
    ipcMain.handle('record-performance-metric', (_e: any, { name, value }: any) => {
        try {
            deps.assertString(name, 'name', 100);
            deps.assertNumber(value, 'value', 0);
            deps.recordRendererMetric(name, value);
            return true;
        } catch {
            return false;
        }
    });
    ipcMain.handle('get-performance-metrics', () => deps.getPerformanceSnapshot());
    ipcMain.handle('read-settings-file', async () => {
        try {
            return await deps.readSettings();
        } catch (e) {
            console.error('Error reading settings file:', e);
        }
        return {};
    });
    ipcMain.handle('write-settings-file', async (_e: any, data: any) => {
        try {
            deps.assertObject(data, 'settings');
            await deps.fsp.writeFile(deps.SETTINGS_FILE, JSON.stringify(data, null, 2));
            await deps.syncCredentialStorageAcknowledgement();
            deps.scheduleCloudStateUpload();
            return true;
        } catch (e) {
            console.error('Error writing settings file:', e);
            return false;
        }
    });
    ipcMain.handle('get-app-update-state', () => deps.getAppUpdateState());
    ipcMain.handle('check-app-update', async () => await deps.checkForAppUpdate());
    ipcMain.handle('download-app-update', async () => await deps.downloadAppUpdate());
    ipcMain.handle('install-app-update', () => {
        deps.installAppUpdate();
        return true;
    });
    ipcMain.handle('dismiss-app-update', async (_e: any, version: unknown) => {
        deps.assertString(version, 'version', 100);
        return await deps.dismissAppUpdate(version as string);
    });
    ipcMain.handle('get-credential-storage-status', () => deps.getCredentialStorageStatusSummary());
    ipcMain.handle('secure-store-set', async (_e: any, key: any, value: any) => {
        deps.assertString(key, 'key', 500);
        deps.assertString(value, 'value', 100_000);
        await deps.setCredential(key, value);
        deps.scheduleCloudStateUpload();
        return true;
    });
    ipcMain.handle('secure-store-get', async (_e: any, key: any) => {
        deps.assertString(key, 'key', 500);
        return await deps.getCredential(key);
    });
    ipcMain.handle('secure-store-delete', async (_e: any, key: any) => {
        deps.assertString(key, 'key', 500);
        const result = await deps.deleteCredential(key);
        deps.scheduleCloudStateUpload();
        return result;
    });
    ipcMain.handle('secure-store-list', async () => await deps.listCredentials());

    // User Profile
    ipcMain.handle('read-user-profile', async () => {
        try {
            if (deps.fs.existsSync(deps.USER_PROFILE_FILE)) {
                const content = await deps.fsp.readFile(deps.USER_PROFILE_FILE, 'utf8');
                return JSON.parse(content);
            }
        } catch (e) {
            console.error('Error reading user profile:', e);
        }
        return null;
    });
    ipcMain.handle('write-user-profile', async (_e: any, data: any) => {
        try {
            deps.assertObject(data, 'userProfile');
            await deps.fsp.writeFile(deps.USER_PROFILE_FILE, JSON.stringify(data, null, 2));
            deps.scheduleCloudStateUpload();
            return true;
        } catch (e) {
            console.error('Error writing user profile:', e);
            return false;
        }
    });

    // Primary Supabase Auth
    ipcMain.handle('auth-get-status', async () => {
        try {
            const status = await deps.authGetStatus();
            if (status?.status === 'signed_in' && status?.user?.id) {
                await deps.ensureCloudStateForSignedInUser();
            }
            return status;
        } catch (e: any) {
            return deps.getAuthErrorStatus(e.message);
        }
    });
    ipcMain.handle('auth-sign-in', async (_e: any, { email, password }: any) => {
        try {
            deps.assertString(email, 'email', 200);
            deps.assertString(password, 'password', 200);
            const status = await deps.authSignIn(email, password);
            if (status?.status === 'signed_in' && status?.user?.id) {
                await deps.ensureCloudStateForSignedInUser();
            }
            return status;
        } catch (e: any) {
            return deps.getAuthErrorStatus(e.message);
        }
    });
    ipcMain.handle('auth-sign-up', async (_e: any, { email, password, displayName }: any) => {
        try {
            deps.assertString(email, 'email', 200);
            deps.assertString(password, 'password', 200);
            deps.assertString(displayName, 'displayName', 100);
            const status = await deps.authSignUp(email, password, displayName);
            if (status?.status === 'signed_in' && status?.user?.id) {
                await deps.ensureCloudStateForSignedInUser();
            }
            return status;
        } catch (e: any) {
            return deps.getAuthErrorStatus(e.message);
        }
    });
    ipcMain.handle('auth-sign-out', async () => {
        try {
            // Tear down sync first (while session is still valid) so the
            // realtime channel can be cleanly removed before the token is invalidated.
            await deps.teardownSync();
            const status = await deps.authSignOut();
            return status;
        } catch (e: any) {
            return deps.getAuthErrorStatus(e.message);
        }
    });
    ipcMain.handle('auth-refresh-profile', async () => {
        try {
            const status = await deps.authRefreshProfile();
            if (status?.status === 'signed_in' && status?.user?.id) {
                await deps.ensureCloudStateForSignedInUser();
            }
            return status;
        } catch (e: any) {
            return deps.getAuthErrorStatus(e.message);
        }
    });

    ipcMain.handle('get-system-info', () => ({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
        appVersion: deps.app.getVersion()
    }));
    ipcMain.handle('get-app-version', () => deps.app.getVersion());
    ipcMain.handle('is-minimized-to-tray', async () => {
        try {
            if (deps.fs.existsSync(deps.SETTINGS_FILE)) {
                const content = await deps.fsp.readFile(deps.SETTINGS_FILE, 'utf8');
                const settings = JSON.parse(content);
                return !!settings.minimizeToTray;
            }
        } catch (e) {
            console.error('Error reading settings for tray check:', e);
        }
        return false;
    });
}
