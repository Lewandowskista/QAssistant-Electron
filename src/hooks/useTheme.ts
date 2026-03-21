import { useCallback } from 'react'
import { useSettingsStore } from '@/store/useSettingsStore'
import { applyTheme } from '@/lib/theme'

type Theme = 'dark' | 'light'

/** Apply the theme CSS class to the document root. */
export function applyThemeClass(theme: Theme) {
    applyTheme(theme)
}

export function useTheme() {
    const theme = useSettingsStore(s => s.settings.theme) as Theme
    const save = useSettingsStore(s => s.save)

    const toggleTheme = useCallback(async () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark'
        await save({ theme: next })
    }, [theme, save])

    return { theme, toggleTheme }
}
