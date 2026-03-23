import { lazy, Suspense, useState, useMemo, useCallback, useEffect, type ReactNode } from "react"
import { useActiveProject, useProjectStore } from "@/store/useProjectStore"
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
    ListChecks,
    Handshake,
    GitPullRequest,
    CircleHelp,
    Sparkles,
    Copy,
    ArrowRight,
    type LucideIcon
} from "lucide-react"
import { cn, evaluateQualityGate } from "@/lib/utils"
import FormattedText from "@/components/FormattedText"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getApiKey } from "@/lib/credentials"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Task, TestPlan, Note, Checklist } from "@/types/project"
import { getCollaborationMetrics, getReleaseQueue, getSyncStatusSummary, getWorkflowHealthSummary } from "@/lib/collaboration"
import WelcomeScreen from "@/components/WelcomeScreen"
import { useSyncStore } from "@/store/useSyncStore"

const PassRateTrendChart = lazy(() => import("@/components/DashboardCharts").then((module) => ({ default: module.PassRateTrendChart })))
const DefectDensityChart = lazy(() => import("@/components/DashboardCharts").then((module) => ({ default: module.DefectDensityChart })))
const TestStatusDonut = lazy(() => import("@/components/DashboardCharts").then((module) => ({ default: module.TestStatusDonut })))
const ExecutionVelocityChart = lazy(() => import("@/components/DashboardCharts").then((module) => ({ default: module.ExecutionVelocityChart })))
const TestBurndownChart = lazy(() => import("@/components/DashboardCharts").then((module) => ({ default: module.TestBurndownChart })))

function ChartFallback() {
    return <div className="flex h-full items-center justify-center text-[11px] text-[#6B7280] italic">Loading chart...</div>
}

type MetricCardProps = {
    icon: LucideIcon
    label: string
    value: string | number
    description: string
    accentClassName: string
    stateClassName?: string
    meta?: ReactNode
}

type MetricSectionProps = {
    eyebrow: string
    title: string
    description: string
    children: ReactNode
}

function MetricHelpButton({ label, description }: { label: string; description: string }) {
    return (
        <div className="group/help relative inline-flex">
            <button
                type="button"
                aria-label={`What ${label} means`}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#2A2A3A] bg-[#1A1A24]/70 text-[#6B7280] transition-colors hover:border-[#A78BFA]/40 hover:text-[#E2E8F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
                <CircleHelp className="h-3 w-3" strokeWidth={2.3} />
            </button>
            <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-lg border border-[#2A2A3A] bg-[#0F0F13]/95 p-3 text-left text-[11px] leading-relaxed text-[#E2E8F0] opacity-0 shadow-xl transition-all duration-150 group-hover/help:translate-y-1 group-hover/help:opacity-100 group-focus-within/help:translate-y-1 group-focus-within/help:opacity-100">
                {description}
            </div>
        </div>
    )
}

function DashboardMetricCard({
    icon: Icon,
    label,
    value,
    description,
    accentClassName,
    stateClassName,
    meta
}: MetricCardProps) {
    return (
        <div className={cn("app-metric-card min-h-[148px]", stateClassName)}>
            <div className="flex items-start justify-between gap-3">
                <div className={cn("rounded-xl border border-current/10 bg-current/10 p-2", accentClassName)}>
                    <Icon className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <MetricHelpButton label={label} description={description} />
            </div>
            <div className="space-y-1">
                <p className="app-metric-value">{value}</p>
                <div className="flex items-center gap-2">
                    <p className="app-metric-label">{label}</p>
                </div>
            </div>
            {meta ? <div className="pt-1 text-[11px] text-[#6B7280]">{meta}</div> : null}
        </div>
    )
}

function MetricsSection({ eyebrow, title, description, children }: MetricSectionProps) {
    return (
        <section className="app-panel p-5 md:p-6">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                    <p className="app-section-label">{eyebrow}</p>
                    <h2 className="text-lg font-semibold text-[#E2E8F0]">{title}</h2>
                </div>
                <p className="max-w-2xl text-sm text-[#6B7280]">{description}</p>
            </div>
            {children}
        </section>
    )
}

export default function DashboardPage() {
    const activeProject = useActiveProject()
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const projects = useProjectStore((state) => state.projects)
    const seedDemoProject = useProjectStore((state) => state.seedDemoProject)
    const syncStatus = useSyncStore((state) => state.status)
    const syncPendingCount = useSyncStore((state) => state.pendingCount)
    const syncError = useSyncStore((state) => state.error)
    const syncLastSyncedAt = useSyncStore((state) => state.lastSyncedAt)
    const syncWorkspaceName = useSyncStore((state) => state.workspaceInfo?.workspaceName ?? null)
    const [selectedSprint, setSelectedSprint] = useState<string>('all')
    const [standupOpen, setStandupOpen] = useState(false)
    const [standupSummary, setStandupSummary] = useState<string | null>(null)
    const [standupLoading, setStandupLoading] = useState(false)
    const api = window.electronAPI

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
    const handoffs = useMemo(() => activeProject?.handoffPackets || [], [activeProject?.handoffPackets])
    const collaborationEvents = useMemo(() => activeProject?.collaborationEvents || [], [activeProject?.collaborationEvents])
    const releaseQueue = useMemo(
        () => activeProject ? getReleaseQueue(activeProject) : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tasks, handoffs, collaborationEvents]
    )
    const collaborationMetrics = useMemo(
        () => activeProject ? getCollaborationMetrics(activeProject) : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [handoffs, collaborationEvents]
    )
    const workflowHealth = useMemo(
        () => activeProject ? getWorkflowHealthSummary(activeProject) : null,
        [activeProject]
    )
    const syncSummary = useMemo(
        () => getSyncStatusSummary({
            status: syncStatus,
            pendingCount: syncPendingCount,
            error: syncError,
            lastSyncedAt: syncLastSyncedAt,
            workspaceName: syncWorkspaceName,
        }),
        [syncError, syncLastSyncedAt, syncPendingCount, syncStatus, syncWorkspaceName]
    )

    const closedColumnIds = useMemo(() => {
        const closedTypes = new Set(['completed', 'canceled'])
        const ids = new Set<string>()
        currentColumns.forEach(c => { if (closedTypes.has(c.type || '')) ids.add(c.id) })
        return ids
    }, [currentColumns])

    const isClosed = useCallback((status: string) => {
        if (closedColumnIds.has(status)) return true
        if (closedColumnIds.size === 0) {
            const s = status.toLowerCase()
            return s === 'done' || s === 'canceled'
        }
        return false
    }, [closedColumnIds])

    // Metrics calculations (using filteredTasks)
    const openTasks = useMemo(
        () => filteredTasks.filter((t: Task) => !isClosed(t.status || 'todo')),
        [filteredTasks, isClosed]
    )
    const openTasksCount = openTasks.length
    const criticalBlockersCount = useMemo(
        () => openTasks.filter((t: Task) => t.priority === 'critical').length,
        [openTasks]
    )

    const { passedTests, failedTests, notRunTests, testCasesCount, passRate } = useMemo(() => {
        const passed = allTestCases.filter((c: any) => c.status === 'passed').length
        const failed = allTestCases.filter((c: any) => c.status === 'failed').length
        const notRun = allTestCases.filter((c: any) => c.status === 'not-run').length
        const total = allTestCases.length
        return { passedTests: passed, failedTests: failed, notRunTests: notRun, testCasesCount: total, passRate: total > 0 ? Math.round((passed / total) * 100) : 0 }
    }, [allTestCases])

    const now = new Date()
    const { upcomingTasks, overdueCount } = useMemo(() => {
        const upcoming = openTasks
            .filter((t: Task) => t.dueDate && new Date(t.dueDate) >= now)
            .sort((a: Task, b: Task) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
            .slice(0, 7)
        const overdue = openTasks.filter((t: Task) => t.dueDate && new Date(t.dueDate) < now).length
        return { upcomingTasks: upcoming, overdueCount: overdue }
    }, [openTasks])

    const awaitingDevAckCount = useMemo(
        () => tasks.filter((t: Task) => t.collabState === 'ready_for_dev').length,
        [tasks]
    )
    const readyForQaCount = useMemo(
        () => tasks.filter((t: Task) => t.collabState === 'ready_for_qa').length,
        [tasks]
    )
    const verifiedTodayCount = useMemo(
        () => collaborationEvents.filter((event) => event.eventType === 'verification_passed' && new Date(event.timestamp).toDateString() === now.toDateString()).length,
        [collaborationEvents]
    )
    const missingEvidenceCount = useMemo(
        () => handoffs.filter((handoff) => !handoff.linkedExecutionRefs.length && !handoff.linkedFileIds.length && !handoff.linkedNoteIds.length).length,
        [handoffs]
    )
    const prsWaitingForQaCount = useMemo(() => {
        const taskById = new Map(tasks.map((t: Task) => [t.id, t]))
        return handoffs.filter((handoff) => {
            if (!handoff.linkedPrs.length) return false
            const task = taskById.get(handoff.taskId)
            return task?.collabState !== 'verified' && task?.collabState !== 'closed'
        }).length
    }, [handoffs, tasks])
    const activeHandoffs = handoffs.slice(0, 5)
    const recentCollabEvents = collaborationEvents.slice(0, 6)

    // Coverage gap analysis
    const { coveredTasks: _coveredTasks, uncoveredTasks, coverageGapCount, coveragePercent } = useMemo(() => {
        const issueIds = new Set(allTestCases.map(tc => tc.sourceIssueId).filter(Boolean))
        const covered = filteredTasks.filter((t: Task) => t.sourceIssueId && issueIds.has(t.sourceIssueId))
        const uncovered = filteredTasks.filter((t: Task) => !t.sourceIssueId || !issueIds.has(t.sourceIssueId))
        return {
            coveredTasks: covered,
            uncoveredTasks: uncovered,
            coverageGapCount: uncovered.length,
            coveragePercent: filteredTasks.length > 0 ? Math.round((covered.length / filteredTasks.length) * 100) : 0,
        }
    }, [filteredTasks, allTestCases])

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
                    case 'smoke_tests': {
                        const smokeCases = allTestCases.filter(tc => tc.testType === 'smoke' || tc.tags?.includes('smoke'))
                        const smokePassed = smokeCases.filter(tc => tc.status === 'passed').length
                        actualValue = smokeCases.length > 0 ? Math.round((smokePassed / smokeCases.length) * 100) : 0
                        break
                    }
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
            <EmptyState
                icon={LayoutDashboard}
                title="No project selected"
                description="Select a project from the sidebar to access the delivery dashboard and standardized workspace metrics."
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="h-11 px-8"
                            onClick={() => window.dispatchEvent(new Event('open-project-dialog'))}
                        >
                            Create Project
                        </Button>
                        <Button
                            className="h-11 px-8"
                            onClick={() => seedDemoProject()}
                        >
                            Load Demo Workspace
                        </Button>
                    </>
                }
            />
        )
    }

    const handleStandupSummary = async () => {
        const apiKey = await getApiKey(api, 'gemini_api_key', activeProject?.id)
        if (!apiKey) {
            toast.error('Configure a Gemini API key in Settings to generate standup summaries.')
            return
        }
        setStandupLoading(true)
        setStandupOpen(true)
        setStandupSummary(null)
        try {
            const recentRuns = (activeProject?.testRunSessions || [])
                .slice(0, 5)
                .map((s: any) => {
                    const planName = activeProject?.testPlans?.find((p: TestPlan) => p.id === s.testPlanId)?.name || 'Test Run'
                    const results = s.executions || []
                    const passed = results.filter((e: any) => e.result === 'passed').length
                    return { planName, passed, total: results.length }
                })
            const recentlyVerified = (activeProject?.collaborationEvents || [])
                .filter((e: any) => e.eventType === 'verification_passed' && Date.now() - e.timestamp < 86400000)
                .map((e: any) => e.title)
                .slice(0, 5)
            const highPriorityOpen = (activeProject?.tasks || [])
                .filter((t: Task) => (t.priority === 'critical' || t.priority === 'high') && !['done', 'canceled'].includes(t.status))
                .map((t: Task) => t.title)
                .slice(0, 5)
            const metrics = {
                projectName: activeProject!.name,
                date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                readyForQa: releaseQueue?.tasksReadyForQa?.length || 0,
                blocked: openTasks.filter((t: Task) => t.status === 'blocked' || t.collabState === 'ready_for_dev').length,
                failedTests,
                overdueTasks: openTasks.filter((t: Task) => t.dueDate && t.dueDate < Date.now()).length,
                recentRuns,
                recentlyVerified,
                highPriorityOpen,
            }
            const result = await api.aiStandupSummary({ apiKey, metrics, modelName: activeProject?.geminiModel })
            if (result && typeof result === 'object' && '__isError' in result) {
                toast.error(`AI error: ${(result as any).message}`)
                setStandupOpen(false)
                return
            }
            setStandupSummary(typeof result === 'string' ? result : null)
        } catch (e: any) {
            toast.error(`Failed to generate summary: ${e.message || e}`)
            setStandupOpen(false)
        } finally {
            setStandupLoading(false)
        }
    }

    if (projects.length === 0) {
        return <WelcomeScreen onLoadDemo={seedDemoProject} />
    }

    if (!activeProject) {
        return null
    }

    // Empty project — guide the user to create their first task and test plan
    if (tasks.length === 0 && testPlans.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in fade-in duration-500 max-w-2xl mx-auto py-16 px-6">
                <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <LayoutDashboard className="h-10 w-10 text-primary" strokeWidth={1.5} />
                </div>
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-black text-[#E2E8F0] tracking-tight">{activeProject.name} is ready</h2>
                    <p className="text-sm text-[#6B7280] max-w-md leading-relaxed">
                        This project has no tasks or test plans yet. Add your first items to start tracking quality metrics and collaboration events.
                    </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 w-full">
                    <a href="#/tasks" className="group p-5 rounded-2xl border border-[#2A2A3A] bg-[#13131A] hover:border-primary/40 hover:bg-primary/5 transition-all flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <CheckSquare className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[#E2E8F0] mb-1">Create a Task</p>
                            <p className="text-xs text-[#6B7280] leading-snug">Log bugs and feature work, then hand them off between QA and Dev.</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-[#6B7280] group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </a>
                    <a href="#/tests" className="group p-5 rounded-2xl border border-[#2A2A3A] bg-[#13131A] hover:border-primary/40 hover:bg-primary/5 transition-all flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <PlayCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[#E2E8F0] mb-1">Create a Test Plan</p>
                            <p className="text-xs text-[#6B7280] leading-snug">Build test cases, run executions, and track pass rates over time.</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-[#6B7280] group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </a>
                </div>
                <Button variant="ghost" size="sm" className="text-[#6B7280] hover:text-[#E2E8F0] gap-2 text-xs" onClick={seedDemoProject}>
                    <Sparkles className="h-3.5 w-3.5" /> Load demo data instead
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-[1600px] animate-in fade-in duration-500 pb-10">
            {/* Standup Summary Dialog */}
            <Dialog open={standupOpen} onOpenChange={setStandupOpen}>
                <DialogContent className="max-w-lg bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                            <Sparkles className="h-4 w-4 text-[#A78BFA]" /> AI Standup Summary
                        </DialogTitle>
                    </DialogHeader>
                    {standupLoading ? (
                        <div className="flex items-center gap-3 py-8 justify-center text-[#A78BFA]">
                            <Sparkles className="h-4 w-4 animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Generating summary...</span>
                        </div>
                    ) : standupSummary ? (
                        <div className="space-y-4">
                            <div className="bg-[#0F0F13] rounded-xl p-4 text-sm text-[#E2E8F0] leading-relaxed whitespace-pre-wrap font-mono border border-[#2A2A3A]">
                                {standupSummary}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2 text-[#6B7280] hover:text-[#E2E8F0]"
                                onClick={() => { navigator.clipboard.writeText(standupSummary); toast.success('Copied to clipboard') }}
                            >
                                <Copy className="h-3.5 w-3.5" /> Copy
                            </Button>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            {/* Header */}
            <PageHeader
                eyebrow="Project Overview"
                title={activeProject.name}
                description="Project dashboard"
                actions={(
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleStandupSummary}
                            disabled={standupLoading}
                            className="h-9 gap-2 border border-[#A78BFA]/20 text-[#A78BFA] hover:bg-[#A78BFA]/10 text-[10px] font-black uppercase tracking-widest"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            Standup Summary
                        </Button>
                        {availableSprints.length > 0 && (
                            <>
                                <Label className="app-field-label mb-0">Sprint Context</Label>
                                <Select value={selectedSprint} onValueChange={setSelectedSprint}>
                                    <SelectTrigger className="w-[220px]">
                                        <SelectValue placeholder="Select Sprint" />
                                    </SelectTrigger>
                                    <SelectContent className="z-50">
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
                            </>
                        )}
                    </div>
                )}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
                <MetricsSection
                    eyebrow="Execution Snapshot"
                    title="Workload And Quality"
                    description="Core delivery and testing metrics are grouped together so the current sprint state is readable at a glance."
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <DashboardMetricCard
                            icon={CheckSquare}
                            label="Open Tasks"
                            value={openTasksCount}
                            description="Tasks in the selected sprint scope that are not in a completed or canceled column."
                            accentClassName="text-[#3B82F6]"
                            meta={`${filteredTasks.length} tasks in current scope`}
                        />
                        <DashboardMetricCard
                            icon={AlertOctagon}
                            label="Critical / Blockers"
                            value={criticalBlockersCount}
                            description="Open tasks marked with critical priority that likely block release or verification work."
                            accentClassName="text-[#EF4444]"
                            stateClassName={criticalBlockersCount > 0 ? "app-status-danger" : undefined}
                            meta={criticalBlockersCount > 0 ? "Needs immediate attention" : "No active blockers"}
                        />
                        <DashboardMetricCard
                            icon={Clock}
                            label="Overdue Tasks"
                            value={overdueCount}
                            description="Open tasks with a due date earlier than today."
                            accentClassName="text-[#F59E0B]"
                            stateClassName={overdueCount > 0 ? "app-status-warning" : undefined}
                            meta={upcomingTasks.length > 0 ? `${upcomingTasks.length} upcoming due next` : "No upcoming due dates"}
                        />
                        <DashboardMetricCard
                            icon={Target}
                            label="Test Pass Rate"
                            value={`${passRate}%`}
                            description="Percentage of all test cases in the project that currently have a passed result."
                            accentClassName="text-[#10B981]"
                            meta={`${passedTests} passed out of ${testCasesCount}`}
                        />
                        <DashboardMetricCard
                            icon={XCircle}
                            label="Failed Tests"
                            value={failedTests}
                            description="Test cases whose latest recorded status is failed."
                            accentClassName="text-[#EF4444]"
                            stateClassName={failedTests > 0 ? "app-status-danger" : undefined}
                            meta={failedTests > 0 ? "Failures are present in the latest results" : "No failed test results"}
                        />
                        <DashboardMetricCard
                            icon={PlayCircle}
                            label="Not Run"
                            value={notRunTests}
                            description="Test cases that exist in the project but have not been executed yet."
                            accentClassName="text-[#9CA3AF]"
                            meta="Potential execution backlog"
                        />
                        <DashboardMetricCard
                            icon={Target}
                            label="Test Coverage"
                            value={`${coveragePercent}%`}
                            description="Share of scoped tasks linked to at least one test case by source issue reference."
                            accentClassName="text-primary"
                            stateClassName={coverageGapCount > 0 ? "border-primary/20 bg-primary/5" : undefined}
                            meta={coverageGapCount > 0 ? `${coverageGapCount} tasks still uncovered` : "All scoped tasks have coverage"}
                        />
                    </div>
                </MetricsSection>

                <MetricsSection
                    eyebrow="Collaboration Flow"
                    title="QA Handoff And Release"
                    description="Operational handoff indicators are separated here so the team can see queue health without scanning the whole page."
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <DashboardMetricCard
                            icon={Handshake}
                            label="Awaiting Dev Ack"
                            value={awaitingDevAckCount}
                            description="Tasks handed to development that have not yet been acknowledged by the dev side."
                            accentClassName="text-[#F59E0B]"
                            meta="Waiting for developer pickup"
                        />
                        <DashboardMetricCard
                            icon={Handshake}
                            label="Ready for QA"
                            value={readyForQaCount}
                            description="Tasks marked as ready for QA verification but not yet fully verified."
                            accentClassName="text-[#38BDF8]"
                            meta="Available for retest"
                        />
                        <DashboardMetricCard
                            icon={Target}
                            label="Verified Today"
                            value={verifiedTodayCount}
                            description="Verification-passed collaboration events recorded on the current calendar day."
                            accentClassName="text-[#10B981]"
                            meta="Daily verification throughput"
                        />
                        <DashboardMetricCard
                            icon={AlertOctagon}
                            label="Missing Evidence"
                            value={missingEvidenceCount}
                            description="Handoffs that do not include linked execution evidence, files, or notes."
                            accentClassName="text-[#EF4444]"
                            stateClassName={missingEvidenceCount > 0 ? "app-status-danger" : undefined}
                            meta={missingEvidenceCount > 0 ? "Evidence gap in active handoffs" : "Handoffs include evidence"}
                        />
                        <DashboardMetricCard
                            icon={GitPullRequest}
                            label="PRs Waiting QA"
                            value={prsWaitingForQaCount}
                            description="Handoffs with linked pull requests that still need QA retest or verification."
                            accentClassName="text-[#A78BFA]"
                            meta="Retest queue linked to PRs"
                        />
                        {releaseQueue && collaborationMetrics ? (
                            <DashboardMetricCard
                                icon={Clock}
                                label="Avg Dev Ack"
                                value={collaborationMetrics.avgDevAcknowledgementHours === null ? 'n/a' : `${collaborationMetrics.avgDevAcknowledgementHours}h`}
                                description="Average time from a QA-to-dev handoff until the developer acknowledges the work."
                                accentClassName="text-[#F59E0B]"
                                meta={`Reopen rate ${collaborationMetrics.reopenRate}%`}
                            />
                        ) : null}
                    </div>
                    {releaseQueue && collaborationMetrics ? (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24]/40 p-4">
                                <p className="app-section-label">Release Queue</p>
                                <p className="mt-2 text-2xl font-semibold text-[#38BDF8]">{releaseQueue.tasksReadyForQa.length}</p>
                                <p className="mt-1 text-xs text-[#6B7280]">Tasks ready for QA verification.</p>
                            </div>
                            <div className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24]/40 p-4">
                                <p className="app-section-label">Evidence Health</p>
                                <p className="mt-2 text-2xl font-semibold text-[#EF4444]">{releaseQueue.handoffsMissingEvidence.length}</p>
                                <p className="mt-1 text-xs text-[#6B7280]">Active handoffs missing evidence artifacts.</p>
                            </div>
                            <div className="rounded-xl border border-[#2A2A3A] bg-[#1A1A24]/40 p-4">
                                <p className="app-section-label">Verification Reopen Rate</p>
                                <p className="mt-2 text-2xl font-semibold text-[#A78BFA]">{collaborationMetrics.reopenRate}%</p>
                                <p className="mt-1 text-xs text-[#6B7280]">Share of verifications that were reopened after review.</p>
                            </div>
                        </div>
                    ) : null}
                </MetricsSection>
            </div>

            {workflowHealth && (
                <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
                    <section className="app-panel p-5 md:p-6">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div>
                                <p className="app-section-label">What Needs Attention</p>
                                <h2 className="text-lg font-semibold text-[#E2E8F0]">Workflow Health</h2>
                            </div>
                            <Button variant="outline" className="border-[#2A2A3A] text-[#E2E8F0]" onClick={() => window.location.hash = '#/release-queue'}>
                                Open Release Queue
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                { label: 'Waiting For Dev Ack', count: workflowHealth.counts.waitingForDevAck, items: workflowHealth.items.waitingForDevAck },
                                { label: 'Ready For QA Without PR', count: workflowHealth.counts.readyForQaWithoutPr, items: workflowHealth.items.readyForQaWithoutPr },
                                { label: 'Failed Verification Without Follow-Up', count: workflowHealth.counts.failedVerificationWithoutFollowUp, items: workflowHealth.items.failedVerificationWithoutFollowUp },
                                { label: 'Incomplete Active Handoffs', count: workflowHealth.counts.incompleteActiveHandoffs, items: workflowHealth.items.incompleteActiveHandoffs },
                            ].map((group) => (
                                <div key={group.label} className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#E2E8F0]">{group.label}</p>
                                        <span className={cn(
                                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                            group.count > 0 ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#10B981]/10 text-[#10B981]"
                                        )}>
                                            {group.count}
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {group.items.length === 0 ? (
                                            <p className="text-xs text-[#6B7280]">No issues right now.</p>
                                        ) : group.items.slice(0, 2).map((item) => (
                                            <div key={`${group.label}-${item.taskId}`} className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-3">
                                                <div className="text-xs font-semibold text-[#E2E8F0]">{item.title}</div>
                                                <div className="mt-1 text-[11px] text-[#9CA3AF]">{item.detail}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="app-panel p-5 md:p-6">
                        <p className="app-section-label">Shared Confidence</p>
                        <h2 className="text-lg font-semibold text-[#E2E8F0]">Cloud Sync</h2>
                        <div className={cn(
                            "mt-4 rounded-xl border p-4",
                            syncSummary.tone === 'danger' && "border-[#EF4444]/30 bg-[#EF4444]/10",
                            syncSummary.tone === 'warning' && "border-[#F59E0B]/30 bg-[#F59E0B]/10",
                            syncSummary.tone === 'info' && "border-[#38BDF8]/20 bg-[#38BDF8]/5",
                            syncSummary.tone === 'success' && "border-[#10B981]/30 bg-[#10B981]/10",
                        )}>
                            <p className="text-sm font-semibold text-[#E2E8F0]">{syncSummary.headline}</p>
                            <p className="mt-2 text-xs text-[#9CA3AF]">{syncSummary.detail}</p>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            <div className="rounded-lg border border-[#2A2A3A] bg-[#13131A] p-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Status</div>
                                <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">{syncStatus}</div>
                            </div>
                            <div className="rounded-lg border border-[#2A2A3A] bg-[#13131A] p-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Pending</div>
                                <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">{syncPendingCount}</div>
                            </div>
                            <div className="rounded-lg border border-[#2A2A3A] bg-[#13131A] p-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Workspace</div>
                                <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">{syncWorkspaceName || 'Not connected'}</div>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {/* Layout Row 1: Key Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                 {/* Test Status Donut */}
                 <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">TEST STATUS HUB</p>
                    <div className="flex-1 w-full min-h-0">
                        <Suspense fallback={<ChartFallback />}>
                            <TestStatusDonut />
                        </Suspense>
                    </div>
                </div>

                {/* Pass Rate Trend */}
                <div className="lg:col-span-2 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">PASS RATE TREND (LAST 12 RUNS)</p>
                    <div className="flex-1 w-full min-h-0">
                        <Suspense fallback={<ChartFallback />}>
                            <PassRateTrendChart />
                        </Suspense>
                    </div>
                </div>
            </div>

            {/* Sprint Burndown (if active sprint) */}
            {tasks.some(t => t.sprint?.isActive) && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[280px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">SPRINT TEST BURNDOWN</p>
                    <div className="flex-1 w-full min-h-0">
                        <Suspense fallback={<ChartFallback />}>
                            <TestBurndownChart />
                        </Suspense>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Defect Density */}
                <div className="lg:col-span-2 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col h-[320px]">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">DEFECT DENSITY BY SAP MODULE</p>
                    <div className="flex-1 w-full min-h-0">
                        <Suspense fallback={<ChartFallback />}>
                            <DefectDensityChart />
                        </Suspense>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">ACTIVE HANDOFFS</p>
                    <div className="space-y-3">
                        {activeHandoffs.length === 0 ? (
                            <p className="text-[11px] text-[#6B7280] italic">No active handoffs.</p>
                        ) : activeHandoffs.map((handoff) => {
                            const task = tasks.find((item) => item.id === handoff.taskId)
                            return (
                                <div key={handoff.id} className="bg-[#1A1A24]/50 p-3 rounded-lg border border-[#2A2A3A]/50">
                                    <div className="text-xs font-bold text-[#E2E8F0]">{task?.title || handoff.summary}</div>
                                    <div className="text-[10px] text-[#6B7280] mt-1">{handoff.type} · {handoff.environmentName || 'No environment'}</div>
                                </div>
                            )
                        })}
                    </div>
                </div>
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">RECENT COLLAB ACTIVITY</p>
                    <div className="space-y-3">
                        {recentCollabEvents.length === 0 ? (
                            <p className="text-[11px] text-[#6B7280] italic">No collaboration activity.</p>
                        ) : recentCollabEvents.map((event) => (
                            <div key={event.id} className="bg-[#1A1A24]/50 p-3 rounded-lg border border-[#2A2A3A]/50">
                                <div className="text-xs font-bold text-[#E2E8F0]">{event.title}</div>
                                <div className="text-[10px] text-[#6B7280] mt-1">{new Date(event.timestamp).toLocaleString()}</div>
                            </div>
                        ))}
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
                        <Suspense fallback={<ChartFallback />}>
                            <ExecutionVelocityChart />
                        </Suspense>
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
