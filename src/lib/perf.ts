export async function recordRendererMetric(name: string, value: number) {
    try {
        await window.electronAPI?.recordPerformanceMetric?.(name, value)
    } catch {
        // Diagnostics should never affect product behavior.
    }
}

export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = performance.now()
    try {
        return await fn()
    } finally {
        void recordRendererMetric(name, performance.now() - startedAt)
    }
}
