import { useCallback } from 'react'
import { useSettingsStore } from '@/store/useSettingsStore'

type Theme = 'dark' | 'light'

/** Apply the theme CSS class to the document root. */
export function applyThemeClass(theme: Theme) {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
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
