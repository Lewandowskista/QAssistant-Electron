import { performance } from 'node:perf_hooks'

type PerfSnapshot = {
    appStartedAt: number
    main: Record<string, number>
    renderer: Record<string, number>
    counters: Record<string, number>
}

const snapshot: PerfSnapshot = {
    appStartedAt: Date.now(),
    main: {},
    renderer: {},
    counters: {},
}

export function startTimer(): number {
    return performance.now()
}

export function recordMainMetric(name: string, value: number) {
    snapshot.main[name] = Math.round(value * 100) / 100
}

export function recordRendererMetric(name: string, value: number) {
    snapshot.renderer[name] = Math.round(value * 100) / 100
}

export function incrementCounter(name: string, delta = 1) {
    snapshot.counters[name] = (snapshot.counters[name] ?? 0) + delta
}

export function measureMainMetric(name: string, startedAt: number) {
    recordMainMetric(name, performance.now() - startedAt)
}

export function getPerformanceSnapshot(): PerfSnapshot {
    return {
        appStartedAt: snapshot.appStartedAt,
        main: { ...snapshot.main },
        renderer: { ...snapshot.renderer },
        counters: { ...snapshot.counters },
    }
}
