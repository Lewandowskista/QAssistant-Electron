import { useEffect, useState, useCallback } from 'react'

type Theme = 'dark' | 'light'

export function applyThemeClass(theme: Theme) {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function useTheme() {
    const [theme, setTheme] = useState<Theme>('dark')

    useEffect(() => {
        const api = window.electronAPI as any
        if (!api) return
        api.readSettingsFile().then((settings: any) => {
            const saved: Theme = settings?.theme === 'light' ? 'light' : 'dark'
            setTheme(saved)
            applyThemeClass(saved)
        })
    }, [])

    const toggleTheme = useCallback(async () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        applyThemeClass(next)
        const api = window.electronAPI as any
        if (!api) return
        const settings = await api.readSettingsFile()
        await api.writeSettingsFile({ ...settings, theme: next })
        window.dispatchEvent(new Event('settings-updated'))
    }, [theme])

    return { theme, toggleTheme }
}
