import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { AppUpdateState } from '../src/types/update'
import {
    createDefaultAppUpdateState,
    mergeAppUpdateState,
    normalizeReleaseNotes,
} from './appUpdateState'

interface AppUpdaterOptions {
    getMainWindow: () => BrowserWindow | null
    readSettings: () => Promise<Record<string, unknown>>
    writeSettings: (next: Record<string, unknown>) => Promise<void>
    updaterDataDir: string
}

const UPDATE_STATUS_CHANNEL = 'app-update-status'
const STARTUP_CHECK_DELAY_MS = 15_000

function getAppVersionSafe(): string {
    try {
        return typeof app?.getVersion === 'function' ? app.getVersion() : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

let appUpdateState: AppUpdateState = createDefaultAppUpdateState(getAppVersionSafe())
let initialized = false
let startupCheckTimer: NodeJS.Timeout | null = null
let settingsApi: Pick<AppUpdaterOptions, 'readSettings' | 'writeSettings'> | null = null
let mainWindowGetter: AppUpdaterOptions['getMainWindow'] | null = null
let updaterDataDir = ''

function emitUpdateState() {
    const target = mainWindowGetter?.()
    if (target && !target.isDestroyed()) {
        target.webContents.send(UPDATE_STATUS_CHANNEL, appUpdateState)
    }
}

function setState(patch: Partial<AppUpdateState>) {
    appUpdateState = mergeAppUpdateState(appUpdateState, patch)
    emitUpdateState()
}

function cleanupUpdaterArtifacts() {
    if (!updaterDataDir || !fs.existsSync(updaterDataDir)) return
    for (const entry of fs.readdirSync(updaterDataDir)) {
        const fullPath = path.join(updaterDataDir, entry)
        try {
            fs.rmSync(fullPath, { recursive: true, force: true })
        } catch (error) {
            console.warn('[updater] Failed to clean updater artifact:', fullPath, error)
        }
    }
}

async function updateSettings(patch: Record<string, unknown>) {
    if (!settingsApi) return
    const current = await settingsApi.readSettings()
    await settingsApi.writeSettings({ ...current, ...patch })
}

function isPackagedAndSupported() {
    if (!app.isPackaged) return false
    if (process.platform === 'linux') return false
    return true
}

async function shouldAutoCheck() {
    if (!settingsApi) return false
    const settings = await settingsApi.readSettings()
    return settings.autoCheckForUpdates !== false
}

export function getAppUpdateState(): AppUpdateState {
    return appUpdateState
}

export function getAppUpdateEventChannel(): string {
    return UPDATE_STATUS_CHANNEL
}

export async function dismissAppUpdate(version: string): Promise<AppUpdateState> {
    await updateSettings({ deferredVersion: version })
    return appUpdateState
}

export async function checkForAppUpdate(): Promise<AppUpdateState> {
    if (!initialized || !isPackagedAndSupported()) {
        setState({
            status: 'disabled',
            errorMessage: app.isPackaged ? 'Auto-update is not enabled for this platform.' : undefined,
        })
        return appUpdateState
    }

    setState({
        status: 'checking',
        errorMessage: undefined,
        downloadProgressPercent: undefined,
    })

    await updateSettings({ lastUpdateCheckAt: Date.now() })

    try {
        await autoUpdater.checkForUpdates()
    } catch (error: any) {
        cleanupUpdaterArtifacts()
        setState({
            status: 'error',
            errorMessage: error?.message || 'Failed to check for updates.',
        })
    }

    return appUpdateState
}

export async function downloadAppUpdate(): Promise<AppUpdateState> {
    if (!initialized || !isPackagedAndSupported()) {
        setState({
            status: 'disabled',
            errorMessage: app.isPackaged ? 'Auto-update is not enabled for this platform.' : undefined,
        })
        return appUpdateState
    }

    setState({
        status: 'downloading',
        errorMessage: undefined,
        downloadProgressPercent: 0,
    })

    try {
        await autoUpdater.downloadUpdate()
    } catch (error: any) {
        cleanupUpdaterArtifacts()
        setState({
            status: 'error',
            errorMessage: error?.message || 'Failed to download the update.',
            downloadProgressPercent: undefined,
        })
    }

    return appUpdateState
}

export function installAppUpdate(): void {
    cleanupUpdaterArtifacts()
    autoUpdater.quitAndInstall(false, true)
}

function scheduleStartupCheck() {
    if (startupCheckTimer) clearTimeout(startupCheckTimer)
    startupCheckTimer = setTimeout(async () => {
        if (await shouldAutoCheck()) {
            void checkForAppUpdate()
        }
    }, STARTUP_CHECK_DELAY_MS)
}

export function initAppUpdater(options: AppUpdaterOptions) {
    settingsApi = {
        readSettings: options.readSettings,
        writeSettings: options.writeSettings,
    }
    mainWindowGetter = options.getMainWindow
    updaterDataDir = options.updaterDataDir

    if (!fs.existsSync(updaterDataDir)) {
        fs.mkdirSync(updaterDataDir, { recursive: true })
    }

    appUpdateState = createDefaultAppUpdateState(getAppVersionSafe())

    if (!isPackagedAndSupported()) {
        initialized = false
        setState({
            status: app.isPackaged ? 'disabled' : 'idle',
        })
        return
    }

    if (initialized) {
        scheduleStartupCheck()
        emitUpdateState()
        return
    }

    initialized = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.disableWebInstaller = true

    autoUpdater.on('checking-for-update', () => {
        setState({
            status: 'checking',
            errorMessage: undefined,
        })
    })

    autoUpdater.on('update-available', async (info) => {
        const nextVersion = info.version || undefined
        const settings = settingsApi ? await settingsApi.readSettings() : {}
        const deferredVersion =
            typeof settings.deferredVersion === 'string' ? settings.deferredVersion : undefined

        setState({
            status: 'available',
            availableVersion: nextVersion,
            releaseNotes: normalizeReleaseNotes(info.releaseNotes),
            downloadProgressPercent: undefined,
            errorMessage: undefined,
            lastCheckedAt: Date.now(),
        })

        if (deferredVersion && deferredVersion !== nextVersion) {
            await updateSettings({ deferredVersion: undefined })
        }
    })

    autoUpdater.on('update-not-available', () => {
        setState({
            status: 'none',
            availableVersion: undefined,
            releaseNotes: undefined,
            downloadProgressPercent: undefined,
            errorMessage: undefined,
            lastCheckedAt: Date.now(),
        })
    })

    autoUpdater.on('download-progress', (progress) => {
        setState({
            status: 'downloading',
            downloadProgressPercent: Math.max(0, Math.min(100, progress.percent)),
            errorMessage: undefined,
        })
    })

    autoUpdater.on('update-downloaded', async (info) => {
        cleanupUpdaterArtifacts()
        await updateSettings({ deferredVersion: undefined })
        setState({
            status: 'downloaded',
            availableVersion: info.version || appUpdateState.availableVersion,
            releaseNotes: normalizeReleaseNotes(info.releaseNotes),
            downloadProgressPercent: 100,
            errorMessage: undefined,
        })
    })

    autoUpdater.on('error', (error) => {
        cleanupUpdaterArtifacts()
        setState({
            status: 'error',
            errorMessage: error?.message || 'Updater error',
            downloadProgressPercent: undefined,
        })
    })

    scheduleStartupCheck()
}
