import { lazy, Suspense, useCallback, useMemo, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
    AlertOctagon,
    ArrowRight,
    CheckSquare,
    FlaskConical,
    LayoutDashboard,
    Sparkles,
    Target,
    type LucideIcon,
} from "lucide-react"

import FormattedText from "@/components/FormattedText"
import WelcomeScreen from "@/components/WelcomeScreen"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import {
    CompactPageHeader,
    InlineStatusSummary,
    PageScaffold,
    SurfaceBlock,
} from "@/components/ui/workspace"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { isTaskReadyForQa } from "@/lib/tasks"
import { cn } from "@/lib/utils"
import { useActiveProject, useProjectStore } from "@/store/useProjectStore"
import type { AccuracyEvalRun, Task, TestPlan } from "@/types/project"

const AIAccuracyTrendChart = lazy(() =>
    import("@/components/DashboardCharts").then((module) => ({ default: module.AIAccuracyTrendChart })),
)
const TestStatusDonut = lazy(() =>
    import("@/components/DashboardCharts").then((module) => ({ default: module.TestStatusDonut })),
)

const TASK_PRIORITY_ORDER: Record<Task["priority"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
}

const TEST_PRIORITY_ORDER = {
    blocker: 0,
    major: 1,
    medium: 2,
    low: 3,
} as const

type FailedTestCase = {
    id: string
    displayId: string
    title: string
    priority: keyof typeof TEST_PRIORITY_ORDER
    updatedAt: number
    planName: string
}

type AccuracyRunEntry = {
    suiteName: string
    run: AccuracyEvalRun
}

function ChartFallback() {
    return <div className="flex h-full items-center justify-center text-[11px] text-muted-ui italic">Loading chart...</div>
}

function MetricCard({
    icon: Icon,
    label,
    value,
    note,
    accentClassName,
}: {
    icon: LucideIcon
    label: string
    value: string | number
    note: string
    accentClassName: string
}) {
    return (
        <div className="app-metric-card min-h-[150px]">
            <div className="flex items-start justify-between gap-3">
                <div className={cn("rounded-xl border border-current/10 bg-current/10 p-2", accentClassName)}>
                    <Icon className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-ui">{label}</span>
            </div>
            <div className="space-y-1">
                <p className="app-metric-value">{value}</p>
                <p className="text-sm font-medium text-foreground">{label}</p>
            </div>
            <p className="text-xs leading-relaxed text-soft">{note}</p>
        </div>
    )
}

function SectionHeader({
    title,
    description,
    action,
}: {
    title: string
    description: string
    action?: ReactNode
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
                <p className="app-section-label">{title}</p>
                <p className="text-sm text-soft">{description}</p>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    )
}

function QueueItem({
    label,
    toneClassName,
    title,
    meta,
}: {
    label: string
    toneClassName: string
    title: ReactNode
    meta: string
}) {
    return (
        <div className="surface-muted rounded-2xl border px-4 py-3">
            <div className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", toneClassName)}>
                    {label}
                </span>
            </div>
            <div className="mt-3 min-w-0 text-sm font-medium text-foreground">{title}</div>
            <p className="mt-1 text-xs text-soft">{meta}</p>
        </div>
    )
}

function EmptyQueue({
    title,
    description,
    actionLabel,
    onAction,
}: {
    title: string
    description: string
    actionLabel: string
    onAction: () => void
}) {
    return (
        <div className="surface-muted flex flex-1 flex-col items-start justify-center rounded-2xl border border-dashed px-5 py-6">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-soft">{description}</p>
            <Button variant="ghost" size="sm" className="mt-4 h-8 px-0 text-primary hover:text-primary" onClick={onAction}>
                {actionLabel}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
        </div>
    )
}

function formatShortDate(timestamp?: number) {
    if (!timestamp) return "No recent update"
    return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatAccuracyDelta(delta: number | null) {
    if (delta === null) return "First evaluation run"
    if (delta === 0) return "No change vs previous run"
    return `${delta > 0 ? "+" : ""}${delta} vs previous run`
}

export default function DashboardPage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const activeProject = useActiveProject()
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const projects = useProjectStore((state) => state.projects)
    const seedDemoProject = useProjectStore((state) => state.seedDemoProject)
    const tasks = useMemo(() => activeProject?.tasks ?? [], [activeProject])
    const testPlans = useMemo(() => activeProject?.testPlans ?? [], [activeProject])

    const availableSprints = useMemo(() => {
        const sprintNames = new Set<string>()
        tasks.forEach((task) => {
            if (task.sprint?.name) sprintNames.add(task.sprint.name)
        })
        return Array.from(sprintNames).sort()
    }, [tasks])

    const activeSprintName = useMemo(
        () => tasks.find((task) => task.sprint?.isActive)?.sprint?.name ?? "all",
        [tasks],
    )

    const requestedSprint = searchParams.get("sprint")
    const selectedSprint = requestedSprint && (requestedSprint === "all" || availableSprints.includes(requestedSprint))
        ? requestedSprint
        : activeSprintName

    const handleSprintChange = useCallback((nextSprint: string) => {
        const next = new URLSearchParams(searchParams)
        if (nextSprint === "all") next.delete("sprint")
        else next.set("sprint", nextSprint)
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const filteredTasks = useMemo(() => {
        if (selectedSprint === "all") return tasks
        return tasks.filter((task) => task.sprint?.name === selectedSprint)
    }, [selectedSprint, tasks])

    const currentColumns = useMemo(() => {
        if (activeProject?.columns?.length) return activeProject.columns
        return [
            { id: "backlog", title: "BACKLOG", type: "backlog" },
            { id: "todo", title: "TODO", type: "unstarted" },
            { id: "in-progress", title: "IN PROGRESS", type: "started" },
            { id: "in-review", title: "IN REVIEW", type: "started" },
            { id: "done", title: "DONE", type: "completed" },
            { id: "canceled", title: "CANCELED", type: "canceled" },
        ]
    }, [activeProject])

    const closedColumnIds = useMemo(() => {
        const ids = new Set<string>()
        currentColumns.forEach((column) => {
            if (column.type === "completed" || column.type === "canceled") {
                ids.add(column.id)
            }
        })
        return ids
    }, [currentColumns])

    const isClosed = useCallback((status: string) => {
        if (closedColumnIds.has(status)) return true
        if (closedColumnIds.size === 0) return status.toLowerCase() === "done" || status.toLowerCase() === "canceled"
        return false
    }, [closedColumnIds])

    const openTasks = useMemo(
        () => filteredTasks.filter((task) => !isClosed(task.status || "todo")),
        [filteredTasks, isClosed],
    )

    const readyForQaTasks = useMemo(
        () =>
            openTasks
                .filter((task) => isTaskReadyForQa(task))
                .sort((a, b) => (b.lastCollabUpdatedAt ?? b.updatedAt) - (a.lastCollabUpdatedAt ?? a.updatedAt)),
        [openTasks],
    )

    const criticalOpenTasks = useMemo(
        () =>
            openTasks
                .filter((task) => task.priority === "critical" || task.severity === "critical" || task.severity === "blocker")
                .sort((a, b) => TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority] || b.updatedAt - a.updatedAt),
        [openTasks],
    )

    const testCases = useMemo(
        () =>
            testPlans.flatMap((plan: TestPlan) =>
                (plan.testCases ?? []).map((testCase) => ({
                    ...testCase,
                    planName: plan.name,
                })),
            ),
        [testPlans],
    )

    const passedTests = useMemo(() => testCases.filter((testCase) => testCase.status === "passed").length, [testCases])
    const failedTests = useMemo(() => testCases.filter((testCase) => testCase.status === "failed").length, [testCases])
    const notRunTests = useMemo(() => testCases.filter((testCase) => testCase.status === "not-run").length, [testCases])
    const blockedTests = useMemo(() => testCases.filter((testCase) => testCase.status === "blocked").length, [testCases])
    const totalTestCases = testCases.length
    const passRate = totalTestCases > 0 ? Math.round((passedTests / totalTestCases) * 100) : 0

    const failedCaseList = useMemo<FailedTestCase[]>(
        () =>
            testCases
                .filter((testCase) => testCase.status === "failed")
                .sort((a, b) => TEST_PRIORITY_ORDER[a.priority] - TEST_PRIORITY_ORDER[b.priority] || b.updatedAt - a.updatedAt)
                .slice(0, 6)
                .map((testCase) => ({
                    id: testCase.id,
                    displayId: testCase.displayId,
                    title: testCase.title,
                    priority: testCase.priority,
                    updatedAt: testCase.updatedAt,
                    planName: testCase.planName,
                })),
        [testCases],
    )

    const coveredSourceIssueIds = useMemo(
        () => new Set(testCases.map((testCase) => testCase.sourceIssueId).filter(Boolean)),
        [testCases],
    )

    const coverageGapTasks = useMemo(
        () =>
            filteredTasks
                .filter((task) => !task.sourceIssueId || !coveredSourceIssueIds.has(task.sourceIssueId))
                .sort((a, b) => TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority] || b.updatedAt - a.updatedAt),
        [coveredSourceIssueIds, filteredTasks],
    )

    const coveragePercent = filteredTasks.length > 0
        ? Math.round(((filteredTasks.length - coverageGapTasks.length) / filteredTasks.length) * 100)
        : 100

    const accuracyRuns = useMemo<AccuracyRunEntry[]>(
        () =>
            (activeProject?.accuracyTestSuites ?? [])
                .flatMap((suite) =>
                    suite.evalRuns
                        .filter((run) => run.status === "completed")
                        .map((run) => ({ suiteName: suite.name, run })),
                )
                .sort((a, b) => b.run.startedAt - a.run.startedAt),
        [activeProject?.accuracyTestSuites],
    )

    const latestAccuracyRun = accuracyRuns[0]?.run ?? null
    const latestAccuracySuite = accuracyRuns[0]?.suiteName ?? null
    const previousAccuracyRun = accuracyRuns[1]?.run ?? null
    const accuracyDelta = latestAccuracyRun && previousAccuracyRun
        ? latestAccuracyRun.aggregateScore - previousAccuracyRun.aggregateScore
        : null

    if (projects.length === 0) {
        return <WelcomeScreen onLoadDemo={seedDemoProject} />
    }

    if (!activeProject) {
        return (
            <EmptyState
                icon={LayoutDashboard}
                title="No project selected"
                description="Select a project from the sidebar to see the QA dashboard."
                actions={
                    <>
                        <Button variant="outline" className="h-11 px-8" onClick={() => window.dispatchEvent(new Event("open-project-dialog"))}>
                            Create Project
                        </Button>
                        <Button className="h-11 px-8" onClick={() => seedDemoProject()}>
                            Load Demo Workspace
                        </Button>
                    </>
                }
            />
        )
    }

    return (
        <PageScaffold className="max-w-[1600px] animate-in fade-in duration-300">
            <CompactPageHeader
                eyebrow="QA Dashboard"
                title={activeProject.name}
                description="A QA-first view of retest demand, current test health, coverage gaps, and AI answer quality."
                summary={
                    <InlineStatusSummary
                        items={[
                            selectedSprint === "all" ? "All sprints" : selectedSprint,
                            `${openTasks.length} active tasks`,
                            `${totalTestCases} test cases`,
                            accuracyRuns.length > 0 ? `${accuracyRuns.length} AI eval runs` : "No AI eval runs",
                        ]}
                    />
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {availableSprints.length > 0 ? (
                            <Select value={selectedSprint} onValueChange={handleSprintChange}>
                                <SelectTrigger className="h-9 w-[180px] border-ui bg-panel-muted text-sm text-foreground">
                                    <SelectValue placeholder="Sprint" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All sprints</SelectItem>
                                    {availableSprints.map((sprint) => (
                                        <SelectItem key={sprint} value={sprint}>
                                            {sprint}
                                        </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        ) : null}
                        <Button variant="outline" className="border-ui text-foreground" onClick={() => navigate("/tasks")}>
                            Open Tasks
                        </Button>
                        <Button onClick={() => navigate("/tests?tab=AIAccuracy")}>
                            Open AI Accuracy
                        </Button>
                    </div>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                    icon={Target}
                    label="Ready For QA"
                    value={readyForQaTasks.length}
                    note={readyForQaTasks.length > 0 ? "Fixes are waiting for retest." : "No items are waiting for QA right now."}
                    accentClassName="text-[#7DD3FC]"
                />
                <MetricCard
                    icon={AlertOctagon}
                    label="Critical Issues"
                    value={criticalOpenTasks.length}
                    note={criticalOpenTasks.length > 0 ? "Open critical or blocker defects need attention." : "No open critical issues in the current view."}
                    accentClassName="text-[#F97373]"
                />
                <MetricCard
                    icon={FlaskConical}
                    label="Pass Rate"
                    value={`${passRate}%`}
                    note={`${failedTests} failed, ${blockedTests} blocked, ${notRunTests} not run.`}
                    accentClassName="text-[#34D399]"
                />
                <MetricCard
                    icon={CheckSquare}
                    label="Coverage Gaps"
                    value={coverageGapTasks.length}
                    note={`${coveragePercent}% of visible tasks have mapped coverage.`}
                    accentClassName="text-[#FBBF24]"
                />
                <MetricCard
                    icon={Sparkles}
                    label="AI Accuracy"
                    value={latestAccuracyRun ? `${latestAccuracyRun.aggregateScore}%` : "-"}
                    note={latestAccuracyRun ? formatAccuracyDelta(accuracyDelta) : "Run an AI Accuracy evaluation from the Tests page."}
                    accentClassName="text-[#C4B5FD]"
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
                <SurfaceBlock className="flex min-h-[420px] flex-col gap-4">
                    <SectionHeader
                        title="AI Accuracy Trend"
                        description="Project-level AI evaluation score over time using completed runs from Tests > AI Accuracy."
                        action={
                            <Button variant="ghost" size="sm" className="h-8 text-primary hover:text-primary" onClick={() => navigate("/tests?tab=AIAccuracy")}>
                                View runs
                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                        }
                    />
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="surface-muted rounded-2xl border px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-ui">Latest Score</p>
                            <p className="mt-2 text-3xl font-semibold text-foreground">
                                {latestAccuracyRun ? `${latestAccuracyRun.aggregateScore}%` : "No data"}
                            </p>
                        </div>
                        <div className="surface-muted rounded-2xl border px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-ui">Latest Suite</p>
                            <p className="mt-2 text-sm font-semibold text-foreground">{latestAccuracySuite ?? "No completed evaluation"}</p>
                            <p className="mt-1 text-xs text-soft">
                                {latestAccuracyRun ? `${latestAccuracyRun.completedPairs}/${latestAccuracyRun.totalPairs} pairs on ${formatShortDate(latestAccuracyRun.startedAt)}` : "Open Tests and run an evaluation."}
                            </p>
                        </div>
                        <div className="surface-muted rounded-2xl border px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-ui">Trend</p>
                            <p className="mt-2 text-sm font-semibold text-foreground">
                                {latestAccuracyRun ? formatAccuracyDelta(accuracyDelta) : "No trend yet"}
                            </p>
                            <p className="mt-1 text-xs text-soft">
                                {accuracyRuns.length > 1 ? "Compared with the previous completed run." : "You need at least two runs for change tracking."}
                            </p>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1">
                        <Suspense fallback={<ChartFallback />}>
                            <AIAccuracyTrendChart />
                        </Suspense>
                    </div>
                </SurfaceBlock>

                <SurfaceBlock className="flex min-h-[420px] flex-col gap-4">
                    <SectionHeader
                        title="Current Test Status"
                        description="A quick read on how the current case inventory is distributed."
                        action={
                            <Button variant="ghost" size="sm" className="h-8 text-primary hover:text-primary" onClick={() => navigate("/tests")}>
                                Open tests
                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                        }
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <div className="surface-muted rounded-2xl border px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-ui">Passed</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{passedTests}</p>
                        </div>
                        <div className="surface-muted rounded-2xl border px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-ui">Needs Attention</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{failedTests + blockedTests + notRunTests}</p>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1">
                        <Suspense fallback={<ChartFallback />}>
                            <TestStatusDonut />
                        </Suspense>
                    </div>
                </SurfaceBlock>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <SurfaceBlock className="flex min-h-[360px] flex-col gap-4">
                    <SectionHeader
                        title="Ready For QA"
                        description="Fixes that are waiting on QA validation."
                        action={<span className="text-xs font-semibold text-soft">{readyForQaTasks.length} item(s)</span>}
                    />
                    {readyForQaTasks.length > 0 ? (
                        <div className="space-y-3">
                            {readyForQaTasks.slice(0, 6).map((task) => (
                                <QueueItem
                                    key={task.id}
                                    label="Retest"
                                    toneClassName="bg-[#7DD3FC]/12 text-[#7DD3FC]"
                                    title={<FormattedText content={task.title} projectId={activeProjectId || undefined} />}
                                    meta={`${task.priority.toUpperCase()} priority / Updated ${formatShortDate(task.lastCollabUpdatedAt ?? task.updatedAt)}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyQueue
                            title="Retest queue is clear"
                            description="Nothing is currently waiting in the ready-for-QA state."
                            actionLabel="Open task board"
                            onAction={() => navigate("/tasks")}
                        />
                    )}
                </SurfaceBlock>

                <SurfaceBlock className="flex min-h-[360px] flex-col gap-4">
                    <SectionHeader
                        title="Failed Tests"
                        description="The most recent failed cases that should be reviewed first."
                        action={<span className="text-xs font-semibold text-soft">{failedTests} total</span>}
                    />
                    {failedCaseList.length > 0 ? (
                        <div className="space-y-3">
                            {failedCaseList.map((testCase) => (
                                <QueueItem
                                    key={testCase.id}
                                    label={testCase.displayId || "Failed"}
                                    toneClassName="bg-[#F97373]/12 text-[#F97373]"
                                    title={testCase.title}
                                    meta={`${testCase.planName} / ${testCase.priority.toUpperCase()} priority / Updated ${formatShortDate(testCase.updatedAt)}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyQueue
                            title="No failed tests"
                            description="Current test case statuses do not show any failed cases."
                            actionLabel="Review Tests"
                            onAction={() => navigate("/tests")}
                        />
                    )}
                </SurfaceBlock>

                <SurfaceBlock className="flex min-h-[360px] flex-col gap-4">
                    <SectionHeader
                        title="Coverage Gaps"
                        description="Filtered tasks that still do not have mapped test coverage."
                        action={<span className="text-xs font-semibold text-soft">{coverageGapTasks.length} gap(s)</span>}
                    />
                    {coverageGapTasks.length > 0 ? (
                        <div className="space-y-3">
                            {coverageGapTasks.slice(0, 6).map((task) => (
                                <QueueItem
                                    key={task.id}
                                    label="No Test"
                                    toneClassName="bg-[#FBBF24]/12 text-[#FBBF24]"
                                    title={<FormattedText content={task.title} projectId={activeProjectId || undefined} />}
                                    meta={`${task.priority.toUpperCase()} priority / Updated ${formatShortDate(task.updatedAt)}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyQueue
                            title="Coverage is mapped"
                            description="All visible tasks already have linked test coverage."
                            actionLabel="Open Tests"
                            onAction={() => navigate("/tests")}
                        />
                    )}
                </SurfaceBlock>
            </div>
        </PageScaffold>
    )
}
