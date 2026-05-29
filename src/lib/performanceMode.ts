export type PerformanceMode = 'auto' | 'balanced' | 'performance'
export type ResolvedPerformanceMode = Exclude<PerformanceMode, 'auto'>

type SystemInfoLike = {
    platform?: string
    arch?: string
} | null | undefined

function isPerformanceMode(value: unknown): value is PerformanceMode {
    return value === 'auto' || value === 'balanced' || value === 'performance'
}

export function deriveStoredPerformanceMode(settings: {
    performanceMode?: unknown
    reduceVisualEffects?: unknown
}): PerformanceMode {
    if (isPerformanceMode(settings.performanceMode)) {
        return settings.performanceMode
    }
    return settings.reduceVisualEffects === true ? 'performance' : 'auto'
}

export function resolvePerformanceMode(
    performanceMode: PerformanceMode | undefined,
    systemInfo: SystemInfoLike,
): ResolvedPerformanceMode {
    const requestedMode = performanceMode ?? 'auto'
    if (requestedMode === 'balanced' || requestedMode === 'performance') {
        return requestedMode
    }
    return systemInfo?.platform === 'darwin' && systemInfo?.arch === 'x64'
        ? 'performance'
        : 'balanced'
}

export function shouldReduceVisualEffects(mode: ResolvedPerformanceMode): boolean {
    return mode === 'performance'
}

export function applyPerformanceModeClass(mode: ResolvedPerformanceMode) {
    document.documentElement.classList.toggle('performance-mode-balanced', mode === 'balanced')
    document.documentElement.classList.toggle('performance-mode-performance', mode === 'performance')
}

/**
 * When true, the app honors the OS `prefers-reduced-motion` preference. When
 * false (the default), the app shows its designed motion regardless of the OS
 * setting. See the gated media query in index.css.
 */
export function applyRespectReducedMotionClass(respect: boolean) {
    document.documentElement.classList.toggle('respect-reduced-motion', respect)
}
