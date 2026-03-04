/**
 * HealthService — mirrors C# EnvironmentHealthService.cs
 * Periodic HTTP health checks for QA environments.
 * Also contains Ccv2ManagementService (SAP Commerce Cloud v2 API).
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

// ── CCv2 Management Service ─────────────────────────────────────────────────

export interface Ccv2Environment {
    code: string;
    name: string;
    status: string;
    deploymentStatus: string;
}

export interface Ccv2Deployment {
    code: string;
    environmentCode: string;
    buildCode: string;
    status: string;
    strategy: string;
    createdAt: string;
    deployedAt: string;
}

export interface Ccv2Build {
    code: string;
    name: string;
    buildStatus: string;
    appVersion: string;
    createdAt: string;
}

const CCv2_BASE = 'https://portalrotapi.hana.ondemand.com';

function str(obj: any, key: string): string {
    return obj?.[key] ?? '';
}

function makeHeaders(apiToken: string): HeadersInit {
    return {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json',
    };
}

export async function ccv2GetEnvironments(
    subscriptionCode: string,
    apiToken: string,
    apiBase = CCv2_BASE
): Promise<Ccv2Environment[]> {
    const url = `${apiBase}/v2/subscriptions/${encodeURIComponent(subscriptionCode)}/environments`;
    const res = await fetch(url, { headers: makeHeaders(apiToken), signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`CCv2 environments failed: ${res.status}`);
    const json = await res.json();
    return (json.value || []).map((item: any) => ({
        code: str(item, 'code'),
        name: str(item, 'name'),
        status: str(item, 'status'),
        deploymentStatus: str(item, 'deploymentStatus'),
    }));
}

export async function ccv2GetDeployments(
    subscriptionCode: string,
    apiToken: string,
    environmentCode?: string,
    top = 20,
    apiBase = CCv2_BASE
): Promise<Ccv2Deployment[]> {
    let qs = `$top=${top}&$orderby=scheduledTimestamp%20desc`;
    if (environmentCode) qs += `&environmentCode=${encodeURIComponent(environmentCode)}`;
    const url = `${apiBase}/v2/subscriptions/${encodeURIComponent(subscriptionCode)}/deployments?${qs}`;
    const res = await fetch(url, { headers: makeHeaders(apiToken), signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`CCv2 deployments failed: ${res.status}`);
    const json = await res.json();
    return (json.value || []).map((item: any) => ({
        code: str(item, 'code'),
        environmentCode: str(item, 'environmentCode'),
        buildCode: str(item, 'buildCode'),
        status: str(item, 'status'),
        strategy: str(item, 'strategy'),
        createdAt: str(item, 'createdTimestamp'),
        deployedAt: str(item, 'deployedTimestamp'),
    }));
}

export async function ccv2GetBuild(
    subscriptionCode: string,
    apiToken: string,
    buildCode: string,
    apiBase = CCv2_BASE
): Promise<Ccv2Build | null> {
    try {
        const url = `${apiBase}/v2/subscriptions/${encodeURIComponent(subscriptionCode)}/builds/${encodeURIComponent(buildCode)}`;
        const res = await fetch(url, { headers: makeHeaders(apiToken), signal: AbortSignal.timeout(30000) });
        if (!res.ok) return null;
        const item = await res.json();
        return {
            code: str(item, 'code'),
            name: str(item, 'name'),
            buildStatus: str(item, 'buildStatus'),
            appVersion: str(item, 'applicationDefinitionVersion'),
            createdAt: str(item, 'createdTimestamp'),
        };
    } catch {
        return null;
    }
}
