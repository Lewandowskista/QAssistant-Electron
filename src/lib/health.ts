
export async function checkHealth(url: string): Promise<{ status: 'healthy' | 'unhealthy' | 'unknown', code?: number, error?: string }> {
    if (!url) return { status: 'unknown' }

    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        await fetch(url, {
            method: 'GET',
            mode: 'no-cors',
            signal: controller.signal
        })

        clearTimeout(timeoutId)
        return { status: 'healthy', code: 200 }
    } catch (err: unknown) {
        return { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) }
    }
}
