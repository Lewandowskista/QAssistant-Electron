/**
 * HealthService — mirrors C# EnvironmentHealthService.cs
 * Periodic HTTP health checks for QA environments.
 */

export interface QaEnvironment {
    id: string;
    name: string;
    baseUrl: string;
    healthCheckUrl?: string;
}

export type HealthStatus = 'unknown' | 'healthy' | 'unhealthy';

interface HealthEntry {
    status: HealthStatus;
    lastChecked: string;
    latencyMs?: number;
}

const healthMap = new Map<string, HealthEntry>();
let healthTimer: ReturnType<typeof setInterval> | null = null;

export function getEnvironmentHealth(envId: string): HealthEntry {
    return healthMap.get(envId) ?? { status: 'unknown', lastChecked: '' };
}

export function getAllHealth(): Record<string, HealthEntry> {
    const result: Record<string, HealthEntry> = {};
    for (const [id, entry] of healthMap.entries()) {
        result[id] = entry;
    }
    return result;
}

async function pingOne(env: QaEnvironment): Promise<void> {
    const url = env.healthCheckUrl || env.baseUrl;
    if (!url) {
        healthMap.set(env.id, { status: 'unknown', lastChecked: new Date().toISOString() });
        return;
    }
    const start = Date.now();
    try {
        const res = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000),
        });
        healthMap.set(env.id, {
            status: res.ok ? 'healthy' : 'unhealthy',
            lastChecked: new Date().toISOString(),
            latencyMs: Date.now() - start,
        });
    } catch {
        healthMap.set(env.id, {
            status: 'unhealthy',
            lastChecked: new Date().toISOString(),
            latencyMs: Date.now() - start,
        });
    }
}

export async function checkEnvironmentsNow(environments: QaEnvironment[]): Promise<Record<string, HealthEntry>> {
    await Promise.all(environments.map(pingOne));
    return getAllHealth();
}

export function startHealthService(environments: QaEnvironment[], intervalMs = 30000): void {
    stopHealthService();
    // Run immediately
    checkEnvironmentsNow(environments).catch(() => { });
    healthTimer = setInterval(() => {
        checkEnvironmentsNow(environments).catch(() => { });
    }, intervalMs);
}

export function stopHealthService(): void {
    if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
    }
}
