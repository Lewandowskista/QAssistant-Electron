/** Apply the theme CSS class to the document root. */
export function applyTheme(theme: 'dark' | 'light') {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
}
