export type PullRequestRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface PullRequestAnalysisResult {
    summary: string
    riskLevel: PullRequestRiskLevel
    hotspots: Array<{ file: string; reason: string }>
    affectedAreas: string[]
    qaChecks: string[]
    impactedCaseIds: string[]
    rationale: string
}

const VALID_RISK_LEVELS = new Set<PullRequestRiskLevel>(['low', 'medium', 'high', 'critical'])

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const item of value) {
        if (typeof item !== 'string') continue
        const trimmed = item.trim().slice(0, maxLength)
        if (!trimmed || seen.has(trimmed)) continue
        seen.add(trimmed)
        normalized.push(trimmed)
        if (normalized.length >= maxItems) break
    }
    return normalized
}

function normalizeHotspots(value: unknown): Array<{ file: string; reason: string }> {
    if (!Array.isArray(value)) return []
    const normalized: Array<{ file: string; reason: string }> = []
    for (const item of value) {
        if (!item || typeof item !== 'object') continue
        const file = typeof (item as any).file === 'string' ? (item as any).file.trim().slice(0, 240) : ''
        const reason = typeof (item as any).reason === 'string' ? (item as any).reason.trim().slice(0, 240) : ''
        if (!file || !reason) continue
        normalized.push({ file, reason })
        if (normalized.length >= 6) break
    }
    return normalized
}

export function normalizePullRequestAnalysisResult(parsed: unknown): PullRequestAnalysisResult {
    const source = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    const riskValue = typeof source.riskLevel === 'string' ? source.riskLevel.trim().toLowerCase() : ''
    return {
        summary: typeof source.summary === 'string' && source.summary.trim()
            ? source.summary.trim().slice(0, 500)
            : 'PR analysis completed with limited detail.',
        riskLevel: VALID_RISK_LEVELS.has(riskValue as PullRequestRiskLevel)
            ? riskValue as PullRequestRiskLevel
            : 'medium',
        hotspots: normalizeHotspots(source.hotspots),
        affectedAreas: normalizeStringArray(source.affectedAreas, 8, 120),
        qaChecks: normalizeStringArray(source.qaChecks, 8, 220),
        impactedCaseIds: normalizeStringArray(source.impactedCaseIds, 30, 120),
        rationale: typeof source.rationale === 'string' ? source.rationale.trim().slice(0, 320) : '',
    }
}
