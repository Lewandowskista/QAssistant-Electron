import { create } from 'zustand'

export interface AppSettings {
    theme: 'dark' | 'light'
    alwaysOnTop: boolean
    sapCommerceContext: boolean
    minimizeToTray: boolean
    autoCheckForUpdates: boolean
    deferredVersion?: string
    lastUpdateCheckAt?: number
    [key: string]: unknown
}

const DEFAULTS: AppSettings = {
    theme: 'dark',
    alwaysOnTop: false,
    sapCommerceContext: false,
    minimizeToTray: false,
    autoCheckForUpdates: true,
}

interface SettingsState {
    settings: AppSettings
    loaded: boolean
    /** Load settings from disk and apply the theme class. */
    load: () => Promise<void>
    /** Persist a partial patch to disk and update the store. */
    save: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: { ...DEFAULTS },
    loaded: false,

    load: async () => {
        const api = window.electronAPI
        if (!api) return
        const raw = await api.readSettingsFile()
        const settings: AppSettings = { ...DEFAULTS, ...raw }
        applyTheme(settings.theme)
        set({ settings, loaded: true })
    },

    save: async (patch) => {
        const api = window.electronAPI
        if (!api) return
        const next: AppSettings = { ...get().settings, ...patch }
        set({ settings: next })
        if (patch.theme) applyTheme(patch.theme as AppSettings['theme'])
        await api.writeSettingsFile(next)
    },
}))

function applyTheme(theme: 'dark' | 'light') {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
}
