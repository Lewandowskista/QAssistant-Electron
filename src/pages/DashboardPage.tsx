import { useState, useMemo, useEffect } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import {
    LayoutDashboard,
    CheckSquare,
    Target,
    AlertOctagon,
    Clock,
    Folder,
    XCircle,
    PlayCircle,
    FileText,
    ListChecks
} from "lucide-react"
import { cn, evaluateQualityGate } from "@/lib/utils"
import FormattedText from "@/components/FormattedText"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    PassRateTrendChart,
    DefectDensityChart,
    TestStatusDonut,
    ExecutionVelocityChart,
    TestBurndownChart
} from "@/components/DashboardCharts"
import { Project, Task, TestPlan, Note, Checklist } from "@/types/project"

export default function DashboardPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId) as Project | undefined
    const [selectedSprint, setSelectedSprint] = useState<string>('all')

    const tasks = useMemo(() => activeProject?.tasks || [], [activeProject])

    // Derive available sprints
    const availableSprints = useMemo(() => {
        const sprintNames = new Set<string>()
        tasks.forEach((t: Task) => {
            if (t.sprint?.name) sprintNames.add(t.sprint.name)
        })
        return Array.from(sprintNames).sort()
    }, [tasks])

    // Set default sprint to the active one on first load or project change
    useEffect(() => {
        if (activeProject && tasks.length > 0) {
            const activeSprint = tasks.find((t: Task) => t.sprint?.isActive)?.sprint?.name
            if (activeSprint) {
                setSelectedSprint(activeSprint)
            } else {
                setSelectedSprint('all')
            }
        }
    }, [activeProjectId, tasks.length > 0, activeProject])

    const filteredTasks = useMemo(() => {
        if (selectedSprint === 'all') return tasks
        return tasks.filter((t: Task) => t.sprint?.name === selectedSprint)
    }, [tasks, selectedSprint])

    const testPlans = useMemo(() => activeProject?.testPlans || [], [activeProject])
    const allTestCases = useMemo(() => testPlans.flatMap((p: TestPlan) => p.testCases || []), [testPlans])
    
    // Status classification logic
    const currentColumns = useMemo(() => {
        if (activeProject?.columns && activeProject.columns.length > 0) return activeProject.columns
        return [
            { id: 'backlog', title: 'BACKLOG', type: 'backlog' },
            { id: 'todo', title: 'TODO', type: 'unstarted' },
            { id: 'in-progress', title: 'IN PROGRESS', type: 'started' },
            { id: 'in-review', title: 'IN REVIEW', type: 'started' },
            { id: 'done', title: 'DONE', type: 'completed' },
            { id: 'canceled', title: 'CANCELED', type: 'canceled' },
        ]
    }, [activeProject?.columns])

    const recentTestPlans = useMemo(() => {
        return testPlans
            .filter((p: TestPlan) => !p.isArchived)
            .sort((a: TestPlan, b: TestPlan) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5)
    }, [testPlans])

    const notes = (activeProject?.notes || []).slice(0, 5)
    const checklists = (activeProject?.checklists || []).slice(0, 5)

    const closedTypes = ['completed', 'canceled']
    const isClosed = (status: string) => {
        const col = currentColumns.find(c => c.id === status)
        return col ? closedTypes.includes(col.type || '') : status.toLowerCase() === 'done' || status.toLowerCase() === 'canceled'
    }

    // Metrics calculations (using filteredTasks)
    const openTasks = filteredTasks.filter((t: Task) => !isClosed(t.status || 'todo'))
    const openTasksCount = openTasks.length
    const criticalBlockersCount = openTasks.filter((t: Task) => t.priority === 'critical').length

    const passedTests = allTestCases.filter((c: any) => c.status === 'passed').length
    const failedTests = allTestCases.filter((c: any) => c.status === 'failed').length
    const notRunTests = allTestCases.filter((c: any) => c.status === 'not-run').length
    const testCasesCount = allTestCases.length
    const passRate = testCasesCount > 0 ? Math.round((passedTests / testCasesCount) * 100) : 0

    const now = new Date()
    const upcomingTasks = openTasks
        .filter((t: Task) => t.dueDate && new Date(t.dueDate) >= now)
        .sort((a: Task, b: Task) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
        .slice(0, 7)

    const overdueCount = openTasks.filter((t: Task) => t.dueDate && new Date(t.dueDate) < now).length

    // Coverage gap analysis
    const coveredTasks = filteredTasks.filter((t: Task) =>
        allTestCases.some(tc => tc.sourceIssueId === t.sourceIssueId)
    )
    const uncoveredTasks = filteredTasks.filter((t: Task) =>
        !allTestCases.some(tc => tc.sourceIssueId === t.sourceIssueId)
    )
    const coverageGapCount = uncoveredTasks.length
    const coveragePercent = filteredTasks.length > 0 ? Math.round((coveredTasks.length / filteredTasks.length) * 100) : 0

    // Quality gates evaluation
    const enabledGates = (activeProject?.qualityGates || []).filter(g => g.isEnabled)
    const gateResults = useMemo(() => {
        return enabledGates.map(gate => {
            const results = gate.criteria.map(criterion => {
                let actualValue = 0
                switch (criterion.type) {
                    case 'pass_rate':
                        actualValue = passRate
                        break
                    case 'critical_bugs':
                        actualValue = criticalBlockersCount
                        break
                    case 'smoke_tests':
                        const smokeCases = allTestCases.filter(tc => tc.testType === 'smoke' || tc.tags?.includes('smoke'))
                        const smokePassed = smokeCases.filter(tc => tc.status === 'passed').length
                        actualValue = smokeCases.length > 0 ? Math.round((smokePassed / smokeCases.length) * 100) : 0
                        break
                    case 'coverage':
                        actualValue = coveragePercent
                        break
                    case 'blockers':
                        actualValue = filteredTasks.filter(t => t.priority === 'critical').length
                        break
                }
                return {
                    criterion,
                    actualValue,
                    passed: evaluateQualityGate(criterion, actualValue)
                }
            })
            const allPassed = results.every(r => r.passed)
            return { gate, results, allPassed }
        })
    }, [enabledGates, passRate, criticalBlockersCount, allTestCases, coveragePercent, filteredTasks])

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="p-8 bg-[#13131A] border border-[#2A2A3A] rounded-2xl">
                    <LayoutDashboard className="h-16 w-16 text-[#6B7280]/30" strokeWidth={1} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#E2E8F0]">No Project Selected</h2>
                    <p className="text-[#6B7280] mt-2 max-w-sm font-medium">
                        Select a project from the sidebar to access the dashboard.
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="h-11 px-8 font-black rounded-xl border-[#A78BFA] text-[#A78BFA] hover:bg-[#A78BFA]/10"
                    onClick={() => window.dispatchEvent(new Event('open-project-dialog'))}
                >
                    CREATE PROJECT
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-[1600px] animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[#2A2A3A] pb-4 mb-2">
                <div className="space-y-1">
                    <p className="text-[9px] font-bold text-[#6B7280] tracking-[0.2em] uppercase">PROJECT OVERVIEW</p>
                    <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">{activeProject.name}</h1>
                    <p className="text-xs text-[#6B7280] font-medium">Project Dashboard</p>
                </div>
                
                {availableSprints.length > 0 && (
                    <div className="flex items-center gap-3">
                        <Label className="text-[10px] uppercase font-bold text-[#6B7280] tracking-wider">Sprint Context</Label>
                        <Select value={selectedSprint} onValueChange={setSelectedSprint}>
                            <SelectTrigger className="w-[200px] h-9 bg-[#13131A] border-[#2A2A3A] text-xs font-semibold rounded-lg focus:ring-[#A78BFA]/20">
                                <SelectValue placeholder="Select Sprint" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] z-50">
                                <SelectItem value="all" className="text-xs">All Issues</SelectItem>
                                {availableSprints.map((name: string) => {
                                    const sprint = tasks.find((t: Task) => t.sprint?.name === name)?.sprint
                                    return (
                                        <SelectItem key={name} value={name} className="text-xs">
                                            {name} {sprint?.isActive ? '(ACTIVE)' : ''}
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </header>

            {/* Metrics List (MetricCardsRow) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                {/* Tasks Open */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm space-y-1">
                    <CheckSquare className="h-5 w-5 text-[#3B82F6]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{openTasksCount}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Open Tasks</p>
                </div>

                {/* Blockers */}
                <div className={cn(
                    "bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    criticalBlockersCount > 0 ? "border-[#EF4444]/30 bg-[#EF4444]/5" : "border-[#2A2A3A]"
                )}>
                    <AlertOctagon className="h-5 w-5 text-[#EF4444]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{criticalBlockersCount}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Critical / Blockers</p>
                </div>

                {/* Pass Rate */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm space-y-1">
                    <Target className="h-5 w-5 text-[#10B981]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{passRate}%</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Test Pass Rate</p>
                </div>

                {/* Failed Tests */}
                <div className={cn(
                    "bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    failedTests > 0 ? "border-[#EF4444]/30 bg-[#EF4444]/5" : "border-[#2A2A3A]"
                )}>
                    <XCircle className="h-5 w-5 text-[#EF4444]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{failedTests}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Failed Tests</p>
                </div>

                {/* Not Run */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm space-y-1">
                    <PlayCircle className="h-5 w-5 text-[#9CA3AF]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{notRunTests}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Not Run</p>
                </div>

                {/* Overdue */}
                <div className={cn(
                    "bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    overdueCount > 0 ? "border-[#F59E0B]/30 bg-[#F59E0B]/5" : "border-[#2A2A3A]"
                )}>
                    <Clock className="h-5 w-5 text-[#F59E0B]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{overdueCount}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Overdue Tasks</p>
                </div>

                {/* Coverage Gaps */}
                <div className={cn(
                    "bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    coverageGapCount > 0 ? "border-[#A78BFA]/30 bg-[#A78BFA]/5" : "border-[#2A2A3A]"
                )}>
                    <Target className="h-5 w-5 text-[#A78BFA]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{coveragePercent}%</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Test Coverage</p>
                </div>
            </div>

            {/* Layout Row 1: Key Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                 {/* Test Status Donut */}
                 <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">TEST STATUS HUB</p>
                    <div className="flex-1 w-full min-h-0">
                        <TestStatusDonut />
                    </div>
                </div>

                {/* Pass Rate Trend */}
                <div className="lg:col-span-2 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">PASS RATE TREND (LAST 12 RUNS)</p>
                    <div className="flex-1 w-full min-h-0">
                        <PassRateTrendChart />
                    </div>
                </div>
            </div>

            {/* Sprint Burndown (if active sprint) */}
            {tasks.some(t => t.sprint?.isActive) && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[280px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">SPRINT TEST BURNDOWN</p>
                    <div className="flex-1 w-full min-h-0">
                        <TestBurndownChart />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Defect Density */}
                <div className="lg:col-span-2 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">DEFECT DENSITY BY SAP MODULE</p>
                    <div className="flex-1 w-full min-h-0">
                        <DefectDensityChart />
                    </div>
                </div>

                {/* Coverage Gaps or Upcoming Due Dates */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    {coverageGapCount > 0 ? (
                        <>
                            <p className="text-[10px] font-bold text-[#A78BFA] tracking-[0.15em] uppercase mb-4">COVERAGE GAPS ({coverageGapCount})</p>
                            <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                {uncoveredTasks.slice(0, 10).map((t: Task) => (
                                    <div key={t.id} className="flex items-start gap-2 bg-[#1A1A24]/30 p-2 rounded-lg border border-[#A78BFA]/20 hover:border-[#A78BFA]/40 transition-colors">
                                        <div className="text-[10px] font-bold text-[#A78BFA] bg-[#A78BFA]/10 px-2 py-1 rounded flex-none">NO TEST</div>
                                        <span className="text-xs font-medium text-[#E2E8F0] truncate flex-1">
                                            <FormattedText content={t.title} projectId={activeProjectId || undefined} />
                                        </span>
                                    </div>
                                ))}
                                {coverageGapCount > 10 && (
                                    <p className="text-[10px] text-[#6B7280] font-medium italic pt-2">
                                        +{coverageGapCount - 10} more uncovered items
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">UPCOMING DUE DATES</p>
                            <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1">
                                {upcomingTasks.length > 0 ? (
                                    upcomingTasks.map((t: Task) => {
                                        const daysLeft = t.dueDate ? Math.ceil((new Date(t.dueDate).getTime() - now.getTime()) / (1000 * 3600 * 24)) : 0
                                        const dueLabel = daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `in ${daysLeft} days`
                                        return (
                                            <div key={t.id} className="flex items-center justify-between group bg-[#1A1A24]/30 p-2 rounded-lg border border-[#2A2A3A]/50">
                                                <span className="text-xs font-medium text-[#E2E8F0] truncate flex-1 group-hover:text-[#A78BFA] transition-colors">
                                                    <FormattedText content={t.title} projectId={activeProjectId || undefined} />
                                                </span>
                                                <span className={cn(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded uppercase ml-2 flex-none",
                                                    daysLeft <= 1 ? "text-[#EF4444] bg-[#EF4444]/10" : "text-[#10B981] bg-[#10B981]/10"
                                                )}>
                                                    {dueLabel}
                                                </span>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <p className="text-xs text-[#6B7280] font-medium italic">No upcoming due dates found.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Layout Row 2: Test Plans + Notes/Runbooks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Test Plans */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">TEST PLANS</p>
                    <div className="space-y-3">
                        {recentTestPlans.map((plan: TestPlan) => {
                            const cases = plan.testCases || []
                            const passed = cases.filter(c => c.status === 'passed').length
                            const planPassRate = cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0
                            return (
                                <div key={plan.id} className="flex items-center gap-4 bg-[#1A1A24]/50 p-3 rounded-lg border border-[#2A2A3A]/50">
                                    <div className="w-10 h-10 rounded bg-[#252535] flex items-center justify-center shrink-0">
                                        <Folder className="h-5 w-5 text-[#A78BFA]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-[#E2E8F0] truncate">
                                            <FormattedText content={plan.name} projectId={activeProjectId || undefined} />
                                        </div>
                                        <p className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider">{cases.length} Cases • {planPassRate}% Pass</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="h-1.5 w-24 bg-[#0F0F13] rounded-full overflow-hidden border border-[#2A2A3A]">
                                            <div className="h-full bg-[#10B981]" style={{ width: `${planPassRate}%` }} />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Notes + Runbooks */}
                <div className="grid grid-rows-2 gap-4">
                    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                        <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-3">RECENT NOTES</p>
                        <div className="space-y-2">
                            {notes.length > 0 ? notes.map((note: Note) => (
                                <div key={note.id} className="flex items-center gap-2 group cursor-pointer">
                                    <FileText className="h-3 w-3 text-[#A78BFA]" />
                                    <span className="text-xs text-[#6B7280] group-hover:text-[#E2E8F0] truncate transition-colors">
                                        <FormattedText content={note.title} projectId={activeProjectId || undefined} />
                                    </span>
                                </div>
                            )) : (
                                <p className="text-[11px] text-[#6B7280] italic">No notes found.</p>
                            )}
                        </div>
                    </div>
                    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                        <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-3">ACTIVE RUNBOOKS</p>
                        <div className="space-y-2">
                            {checklists.length > 0 ? checklists.map((checklist: Checklist) => (
                                <div key={checklist.id} className="flex items-center gap-2 group cursor-pointer">
                                    <ListChecks className="h-3 w-3 text-[#10B981]" />
                                    <span className="text-xs text-[#6B7280] group-hover:text-[#E2E8F0] truncate transition-colors font-semibold">
                                        <FormattedText content={checklist.name} projectId={activeProjectId || undefined} />
                                    </span>
                                </div>
                            )) : (
                                <p className="text-[11px] text-[#6B7280] italic">No active runbooks detected.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quality Gates */}
            {enabledGates.length > 0 && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">RELEASE READINESS</p>
                    <div className="space-y-3">
                        {gateResults.map((gateResult, idx) => {
                            const statusColor = gateResult.allPassed
                                ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]'
                                : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]'
                            const statusLabel = gateResult.allPassed ? '✓ GO' : '✗ NO-GO'

                            return (
                                <div key={idx} className={cn("border rounded-lg p-3 space-y-2", statusColor)}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase">{gateResult.gate.name}</span>
                                        <span className="text-[11px] font-bold">{statusLabel}</span>
                                    </div>
                                    <div className="space-y-1">
                                        {gateResult.results.map((result, ridx) => (
                                            <div key={ridx} className="flex items-center justify-between text-[10px] opacity-90">
                                                <span>{result.criterion.label}</span>
                                                <span className={result.passed ? 'text-[#10B981] font-bold' : 'text-[#EF4444] font-bold'}>
                                                    {result.actualValue} {result.criterion.type === 'pass_rate' || result.criterion.type === 'coverage' ? '%' : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Execution Velocity and Test Aging */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[280px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">EXECUTION VELOCITY (LAST 30 DAYS)</p>
                    <div className="flex-1 w-full min-h-0">
                        <ExecutionVelocityChart />
                    </div>
                </div>

                {/* Test Case Aging */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">TEST CASE AGING</p>
                    <div className="space-y-3">
                        {(() => {
                            const now = Date.now()
                            const day7 = now - (7 * 24 * 60 * 60 * 1000)
                            const day30 = now - (30 * 24 * 60 * 60 * 1000)
                            const day90 = now - (90 * 24 * 60 * 60 * 1000)

                            const notRun = allTestCases.filter(tc => tc.status === 'not-run')
                            const aging7 = notRun.filter(tc => tc.updatedAt < day7).length
                            const aging30 = notRun.filter(tc => tc.updatedAt < day30).length
                            const aging90 = notRun.filter(tc => tc.updatedAt < day90).length

                            return (
                                <>
                                    <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-lg p-3">
                                        <div className="text-[11px] font-bold text-[#E2E8F0]">7+ days</div>
                                        <div className="text-2xl font-bold text-[#F59E0B] mt-1">{aging7}</div>
                                        <div className="text-[9px] text-[#6B7280] mt-0.5">stale cases</div>
                                    </div>
                                    <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-lg p-3">
                                        <div className="text-[11px] font-bold text-[#E2E8F0]">30+ days</div>
                                        <div className="text-2xl font-bold text-[#EF4444] mt-1">{aging30}</div>
                                        <div className="text-[9px] text-[#6B7280] mt-0.5">very stale</div>
                                    </div>
                                    <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-lg p-3">
                                        <div className="text-[11px] font-bold text-[#E2E8F0]">90+ days</div>
                                        <div className="text-2xl font-bold text-[#EF4444] mt-1">{aging90}</div>
                                        <div className="text-[9px] text-[#6B7280] mt-0.5">critical</div>
                                    </div>
                                </>
                            )
                        })()}
                    </div>
                </div>
            </div>
        </div>
    )
}
