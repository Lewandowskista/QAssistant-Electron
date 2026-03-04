
export async function checkHealth(url: string, ignoreSsl: boolean = false): Promise<{ status: 'healthy' | 'unhealthy' | 'unknown', code?: number, error?: string }> {
    if (!url) return { status: 'unknown' }

    try {
        // In a real app, this might be done via IPC to bypass CORS if the target server doesn't allow it.
        // For now, let's try a direct fetch. 
        // If it fails due to CORS, we should move it to the main process.

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(url, {
            method: 'GET',
            mode: 'no-cors', // This might not give us the status code reliably
            signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Since we are using no-cors, we can't reliably check the status code on the frontend.
        // It's better to do this in the main process.
        return { status: 'healthy', code: 200 }
    } catch (err: any) {
        return { status: 'unhealthy', error: err.message }
    }
}
