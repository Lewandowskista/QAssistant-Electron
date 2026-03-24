import { create } from 'zustand'
import { applyTheme } from '@/lib/theme'
import {
    applyPerformanceModeClass,
    deriveStoredPerformanceMode,
    type PerformanceMode,
    resolvePerformanceMode,
    type ResolvedPerformanceMode,
} from '@/lib/performanceMode'

export interface AppSettings {
    theme: 'dark' | 'light'
    performanceMode?: PerformanceMode
    alwaysOnTop: boolean
    sapCommerceContext: boolean
    minimizeToTray: boolean
    autoCheckForUpdates: boolean
    reduceVisualEffects?: boolean
    allowInsecureCredentialStorage?: boolean
    deferredVersion?: string
    lastUpdateCheckAt?: number
    [key: string]: unknown
}

const DEFAULTS: AppSettings = {
    theme: 'dark',
    performanceMode: 'auto',
    alwaysOnTop: false,
    sapCommerceContext: false,
    minimizeToTray: false,
    autoCheckForUpdates: true,
    reduceVisualEffects: false,
}

interface SettingsState {
    settings: AppSettings
    loaded: boolean
    systemInfo: { platform: string; arch: string } | null
    resolvedPerformanceMode: ResolvedPerformanceMode
    /** Load settings from disk and apply the theme class. */
    load: () => Promise<void>
    /** Persist a partial patch to disk and update the store. */
    save: (patch: Partial<AppSettings>) => Promise<void>
}

function normalizeSettings(
    raw: Partial<AppSettings> | Record<string, unknown>,
    systemInfo: { platform: string; arch: string } | null,
): { settings: AppSettings; resolvedPerformanceMode: ResolvedPerformanceMode } {
    const performanceMode = deriveStoredPerformanceMode(raw)
    const resolvedPerformanceMode = resolvePerformanceMode(performanceMode, systemInfo)
    return {
        settings: {
            ...DEFAULTS,
            ...raw,
            performanceMode,
            // Keep the legacy alias in sync for older readers while the rest
            // of the app migrates to performanceMode.
            reduceVisualEffects: resolvedPerformanceMode === 'performance',
        },
        resolvedPerformanceMode,
    }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: { ...DEFAULTS },
    loaded: false,
    systemInfo: null,
    resolvedPerformanceMode: 'balanced',

    load: async () => {
        const api = window.electronAPI
        if (!api) return
        const [raw, systemInfo] = await Promise.all([
            api.readSettingsFile(),
            api.getSystemInfo?.().catch(() => null) ?? Promise.resolve(null),
        ])
        const { settings, resolvedPerformanceMode } = normalizeSettings(raw, systemInfo)
        applyTheme(settings.theme)
        applyPerformanceModeClass(resolvedPerformanceMode)
        set({
            settings,
            loaded: true,
            systemInfo: systemInfo ? { platform: systemInfo.platform, arch: systemInfo.arch } : null,
            resolvedPerformanceMode,
        })
    },

    save: async (patch) => {
        const api = window.electronAPI
        if (!api) return
        const current = get()
        const requestedPerformanceMode = patch.performanceMode
            ?? (patch.reduceVisualEffects !== undefined
                ? (patch.reduceVisualEffects ? 'performance' : 'balanced')
                : current.settings.performanceMode)
        const { settings: next, resolvedPerformanceMode } = normalizeSettings(
            {
                ...current.settings,
                ...patch,
                performanceMode: requestedPerformanceMode,
            },
            current.systemInfo,
        )

        set({ settings: next, resolvedPerformanceMode })
        if (patch.theme) applyTheme(patch.theme as AppSettings['theme'])
        applyPerformanceModeClass(resolvedPerformanceMode)
        await api.writeSettingsFile(next)
    },
}))
