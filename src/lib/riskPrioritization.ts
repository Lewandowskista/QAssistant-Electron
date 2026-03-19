import type { TestCase, TestPlan, TestRunSession, Task, SapModule } from '@/types/project'

// SAP module criticality weights (higher = more critical)
const SAP_MODULE_CRITICALITY: Record<string, number> = {
    Checkout: 95,
    Cart: 90,
    Pricing: 88,
    OMS: 85,
    B2B: 80,
    Promotions: 78,
    CatalogSync: 72,
    CPQ: 70,
    Personalization: 65,
}

const TASK_PRIORITY_WEIGHT: Record<string, number> = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
}

export type RiskScore = {
    testCase: TestCase
    planName: string
    riskScore: number // 0–100
    factors: {
        moduleCriticality: number   // 0–100
        historicalFailureRate: number // 0–100
        linkedDefects: number        // 0–100
        taskPriority: number         // 0–100
    }
}

export function computeRiskScores(
    testPlans: TestPlan[],
    sessions: TestRunSession[],
    tasks: Task[]
): RiskScore[] {
    const taskBySourceId = new Map<string, Task>()
    for (const t of tasks) {
        if (t.sourceIssueId) taskBySourceId.set(t.sourceIssueId, t)
        if (t.externalId) taskBySourceId.set(t.externalId, t)
    }

    // Build failure rate map from sessions: caseId -> (failed, total)
    const caseFailMap = new Map<string, { failed: number; total: number }>()
    for (const session of sessions) {
        for (const pe of session.planExecutions) {
            for (const ce of pe.caseExecutions) {
                const entry = caseFailMap.get(ce.testCaseId) || { failed: 0, total: 0 }
                entry.total++
                if (ce.result === 'failed') entry.failed++
                caseFailMap.set(ce.testCaseId, entry)
            }
        }
    }

    const scores: RiskScore[] = []

    for (const plan of testPlans) {
        if (plan.isArchived) continue
        for (const tc of plan.testCases || []) {
            // 1. Module criticality
            const moduleCrit = SAP_MODULE_CRITICALITY[tc.sapModule as SapModule] ?? 50

            // 2. Historical failure rate (from run sessions)
            const failData = caseFailMap.get(tc.id)
            const historicalFailureRate = failData && failData.total > 0
                ? Math.min(100, Math.round((failData.failed / failData.total) * 100))
                : 0

            // 3. Linked defects count (normalized to 0–100, caps at 5 defects)
            const defectCount = tc.linkedDefectIds?.length || 0
            const linkedDefects = Math.min(100, defectCount * 20)

            // 4. Linked task priority
            const linkedTask = tc.sourceIssueId ? taskBySourceId.get(tc.sourceIssueId) : undefined
            const taskPriority = linkedTask ? (TASK_PRIORITY_WEIGHT[linkedTask.priority] ?? 50) : 50

            // Weighted composite score
            const riskScore = Math.round(
                moduleCrit * 0.30 +
                historicalFailureRate * 0.30 +
                linkedDefects * 0.20 +
                taskPriority * 0.20
            )

            scores.push({
                testCase: tc,
                planName: plan.name,
                riskScore,
                factors: { moduleCriticality: moduleCrit, historicalFailureRate, linkedDefects, taskPriority },
            })
        }
    }

    // Sort highest risk first
    return scores.sort((a, b) => b.riskScore - a.riskScore)
}
