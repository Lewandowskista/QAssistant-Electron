/**
 * Phase 3 — Shared test plan visibility for developers
 *
 * Shows a read-only summary of all test plans and their pass/fail/blocked
 * counts. Displayed to Dev role users instead of the full QA test management
 * interface. Helps developers understand test coverage before and after fixes.
 */
import { useMemo } from 'react'
import { useActiveProject } from '@/store/useProjectStore'
import { FlaskConical, CheckCircle2, XCircle, Ban, SkipForward, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TestPlan, TestCaseStatus } from '@/types/project'

const STATUS_CONFIG: Record<TestCaseStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
    'passed':  { label: 'Passed',  color: 'text-state-success', bg: 'bg-state-success-soft', icon: CheckCircle2 },
    'failed':  { label: 'Failed',  color: 'text-state-danger',     bg: 'bg-state-danger-soft',     icon: XCircle },
    'blocked': { label: 'Blocked', color: 'text-state-warning',   bg: 'bg-state-warning-soft',   icon: Ban },
    'skipped': { label: 'Skipped', color: 'text-muted-ui',   bg: 'bg-elevated',     icon: SkipForward },
    'not-run': { label: 'Not Run', color: 'text-muted-ui',   bg: 'bg-panel-muted',     icon: AlertCircle },
}

function PlanCard({ plan }: { plan: TestPlan }) {
    const cases = plan.testCases ?? []
    const total = cases.length

    const counts = useMemo(() => {
        const c: Record<TestCaseStatus, number> = { passed: 0, failed: 0, blocked: 0, skipped: 0, 'not-run': 0 }
        for (const tc of cases) c[tc.status] = (c[tc.status] ?? 0) + 1
        return c
    }, [cases])

    const passRate = total > 0 ? Math.round((counts.passed / total) * 100) : null
    const hasFailed = counts.failed > 0
    const hasBlocked = counts.blocked > 0

    return (
        <div className={cn(
            'rounded-xl border bg-panel p-5 space-y-4 transition-all',
            hasFailed ? 'border-state-danger-border' : hasBlocked ? 'border-state-warning-border' : 'border-ui'
        )}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <FlaskConical className="h-3.5 w-3.5 text-brand shrink-0" />
                        <p className="text-sm font-bold text-foreground truncate">{plan.name}</p>
                        {plan.isRegressionSuite && (
                            <span className="text-[9px] font-bold uppercase bg-qa-accent/10 text-brand px-1.5 py-0.5 rounded">Regression</span>
                        )}
                        {plan.isArchived && (
                            <span className="text-[9px] font-bold uppercase bg-elevated text-muted-ui px-1.5 py-0.5 rounded">Archived</span>
                        )}
                    </div>
                    {plan.description && (
                        <p className="text-xs text-muted-ui mt-1 truncate">{plan.description}</p>
                    )}
                </div>
                {passRate !== null && (
                    <div className={cn(
                        'shrink-0 text-lg font-bold',
                        passRate >= 80 ? 'text-state-success' : passRate >= 50 ? 'text-state-warning' : 'text-state-danger'
                    )}>
                        {passRate}%
                    </div>
                )}
            </div>

            {/* Progress bar */}
            {total > 0 && (
                <div className="w-full h-2 rounded-full bg-panel-muted flex overflow-hidden gap-0.5">
                    {counts.passed > 0 && (
                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(counts.passed / total) * 100}%` }} />
                    )}
                    {counts.failed > 0 && (
                        <div className="bg-red-500 h-full transition-all" style={{ width: `${(counts.failed / total) * 100}%` }} />
                    )}
                    {counts.blocked > 0 && (
                        <div className="bg-amber-500 h-full transition-all" style={{ width: `${(counts.blocked / total) * 100}%` }} />
                    )}
                    {counts.skipped > 0 && (
                        <div className="bg-line-strong h-full transition-all" style={{ width: `${(counts.skipped / total) * 100}%` }} />
                    )}
                </div>
            )}

            {/* Counts */}
            <div className="grid grid-cols-5 gap-2">
                {(Object.entries(counts) as [TestCaseStatus, number][]).map(([status, count]) => {
                    const cfg = STATUS_CONFIG[status]
                    const Icon = cfg.icon
                    return (
                        <div key={status} className={cn('rounded-lg p-2 text-center', cfg.bg)}>
                            <Icon className={cn('h-3 w-3 mx-auto mb-1', cfg.color)} />
                            <p className={cn('text-xs font-bold', cfg.color)}>{count}</p>
                            <p className="text-[9px] text-muted-ui mt-0.5">{cfg.label}</p>
                        </div>
                    )
                })}
            </div>

            {/* Failed test case titles (up to 3) */}
            {hasFailed && (
                <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-state-danger uppercase tracking-wider">Failed Tests</p>
                    {cases.filter(tc => tc.status === 'failed').slice(0, 3).map(tc => (
                        <div key={tc.id} className="flex items-start gap-2 text-xs text-soft">
                            <XCircle className="h-3 w-3 text-state-danger shrink-0 mt-0.5" />
                            <span className="truncate">{tc.title}</span>
                        </div>
                    ))}
                    {cases.filter(tc => tc.status === 'failed').length > 3 && (
                        <p className="text-[10px] text-muted-ui">+{cases.filter(tc => tc.status === 'failed').length - 3} more</p>
                    )}
                </div>
            )}
        </div>
    )
}

export function DevTestPlanSummary() {
    const activeProject = useActiveProject()
    const plans = useMemo(() =>
        (activeProject?.testPlans ?? []).filter(p => !p.isArchived),
        [activeProject?.testPlans]
    )
    const archivedPlans = useMemo(() =>
        (activeProject?.testPlans ?? []).filter(p => p.isArchived),
        [activeProject?.testPlans]
    )

    // Overall stats across all plans
    const overall = useMemo(() => {
        let passed = 0, failed = 0, blocked = 0, total = 0
        for (const plan of plans) {
            for (const tc of plan.testCases ?? []) {
                total++
                if (tc.status === 'passed') passed++
                else if (tc.status === 'failed') failed++
                else if (tc.status === 'blocked') blocked++
            }
        }
        return { passed, failed, blocked, total, passRate: total > 0 ? Math.round((passed / total) * 100) : null }
    }, [plans])

    if (!activeProject) {
        return (
            <div className="h-full flex items-center justify-center text-muted-ui text-sm">
                Select a project to view test coverage.
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col bg-app overflow-hidden">
            {/* Header */}
            <header className="bg-panel border-b border-ui px-6 py-4 flex items-center gap-3 shrink-0">
                <FlaskConical className="h-4 w-4 text-brand" />
                <span className="text-xs font-black text-foreground uppercase tracking-widest">Test Coverage</span>
                <span className="text-[10px] text-muted-ui ml-1">read-only · dev view</span>
                <div className="flex-1" />
                {overall.passRate !== null && (
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-[10px] text-muted-ui uppercase tracking-wider">Overall Pass Rate</p>
                            <p className={cn('text-lg font-bold',
                                overall.passRate >= 80 ? 'text-state-success' : overall.passRate >= 50 ? 'text-state-warning' : 'text-state-danger'
                            )}>{overall.passRate}%</p>
                        </div>
                        <div className="flex gap-3 text-center">
                            {[
                                { label: 'Passed', value: overall.passed, color: 'text-state-success' },
                                { label: 'Failed', value: overall.failed, color: 'text-state-danger' },
                                { label: 'Blocked', value: overall.blocked, color: 'text-state-warning' },
                                { label: 'Total', value: overall.total, color: 'text-soft' },
                            ].map(s => (
                                <div key={s.label}>
                                    <p className={cn('text-base font-bold', s.color)}>{s.value}</p>
                                    <p className="text-[10px] text-muted-ui">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {plans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                        <FlaskConical className="h-16 w-16 text-muted-ui" strokeWidth={1} />
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-ui">No test plans yet</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
                        </div>

                        {archivedPlans.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-[10px] font-bold text-muted-ui uppercase tracking-wider">Archived Plans ({archivedPlans.length})</p>
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 opacity-50">
                                    {archivedPlans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
