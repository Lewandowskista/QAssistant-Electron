import type { CollabState, HandoffPacket, Project, Task, TaskSeverity, TestCase } from "@/types/project"

export type TaskDueState = "none" | "overdue" | "soon" | "future"
export type TaskCoverageState = "linked" | "uncovered"
export type TaskHandoffState = "none" | "draft" | "incomplete" | "ready"
export type TaskSortMode = "manual" | "due" | "priority" | "updated"
export type TaskBoardMode = "board" | "triage"
export type TaskSourceFilter = "all" | "manual" | "linear" | "jira"
export type TaskSource = Exclude<TaskSourceFilter, "all">
export type TaskBoardColumn = {
    id: string
    title: string
    color?: string
    textColor?: string
    type?: string
}

export type TaskBoardFilters = {
    source: TaskSourceFilter
    search: string
    assignee: string
    priority: "all" | Task["priority"]
    severity: "all" | TaskSeverity
    collabState: "all" | CollabState
    handoffState: "all" | TaskHandoffState
    dueState: "all" | TaskDueState
    coverageState: "all" | TaskCoverageState
    component: string
    label: string
    sprint: string
    version: string
    onlyMine: boolean
    onlyActive: boolean
    status: string
}

export type TaskViewModel = {
    task: Task
    linkedTestCount: number
    linkedTestCases: TestCase[]
    hasActiveHandoff: boolean
    handoffState: TaskHandoffState
    handoffMissingFields: string[]
    dueState: TaskDueState
    dueLabel: string | null
    dueTimestamp: number | null
    needsAttentionScore: number
    coverageState: TaskCoverageState
    isReadyForQa: boolean
    isDevQueue: boolean
    isBlockedOrCritical: boolean
    isRecentlyUpdatedExternal: boolean
}

export type TriageSection = {
    id: string
    title: string
    description: string
    tasks: TaskViewModel[]
}

export type TaskFilterOptions = {
    assignees: string[]
    components: string[]
    labels: string[]
    sprints: string[]
    statuses: string[]
    versions: string[]
}

export const DEFAULT_TASK_FILTERS: TaskBoardFilters = {
    source: "all",
    search: "",
    assignee: "all",
    priority: "all",
    severity: "all",
    collabState: "all",
    handoffState: "all",
    dueState: "all",
    coverageState: "all",
    component: "all",
    label: "all",
    sprint: "all",
    version: "",
    onlyMine: false,
    onlyActive: true,
    status: "all"
}

const ACTIVE_COLUMN_IDS = new Set(["backlog", "todo", "in-progress", "in review", "in-review", "ready", "ready for qa", "qa_retesting", "in_fix"])
const DONE_COLUMN_IDS = new Set(["done", "closed", "complete", "completed", "canceled", "cancelled", "duplicate"])
const DEFAULT_TASK_COLUMNS: TaskBoardColumn[] = [
    { id: "backlog", title: "BACKLOG", color: "bg-[#9CA3AF]", textColor: "text-[#9CA3AF]" },
    { id: "todo", title: "TODO", color: "bg-[#6B7280]", textColor: "text-[#6B7280]" },
    { id: "in-progress", title: "IN PROGRESS", color: "bg-[#3B82F6]", textColor: "text-[#3B82F6]" },
    { id: "in-review", title: "IN REVIEW", color: "bg-[#A78BFA]", textColor: "text-[#A78BFA]" },
    { id: "done", title: "DONE", color: "bg-[#10B981]", textColor: "text-[#10B981]" },
    { id: "canceled", title: "CANCELED", color: "bg-[#EF4444]", textColor: "text-[#EF4444]" },
    { id: "duplicate", title: "DUPLICATE", color: "bg-[#F59E0B]", textColor: "text-[#F59E0B]" }
]

const PRIORITY_WEIGHT: Record<Task["priority"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
}

const SEVERITY_WEIGHT: Record<TaskSeverity, number> = {
    blocker: 5,
    critical: 4,
    major: 3,
    minor: 2,
    cosmetic: 1
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, undefined, { sensitivity: "base" })
}

function uniqueSorted(values: Array<string | undefined | null>) {
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort(compareText)
}

function formatBoardTitle(value: string) {
    return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase()
}

function normalizeColumnId(value: string) {
    return String(value || "").trim().toLowerCase()
}

function isDoneColumn(column: TaskBoardColumn) {
    const id = normalizeColumnId(column.id)
    const type = normalizeColumnId(column.type || "")
    return ["completed", "done", "canceled", "cancelled"].includes(type) || DONE_COLUMN_IDS.has(id)
}

function isActiveColumn(column: TaskBoardColumn) {
    return !isDoneColumn(column)
}

function findColumnForStatus(columns: TaskBoardColumn[], status: string) {
    const normalizedStatus = normalizeColumnId(status)
    return columns.find((column) => normalizeColumnId(column.id) === normalizedStatus) || null
}

export function getTaskSource(task: Task): TaskSource {
    return task.source || "manual"
}

export function getTaskLabels(task: Task) {
    return uniqueSorted(String(task.labels || "").split(",").map((label) => label.trim()))
}

function columnSortWeight(column: TaskBoardColumn) {
    const id = column.id.toLowerCase()
    const type = String(column.type || "").toLowerCase()
    if (["unstarted", "backlog", "triage"].includes(type) || id === "backlog") return 0
    if (["todo", "to do"].includes(type) || id === "todo") return 1
    if (["started", "in-progress", "in progress"].includes(type) || id.includes("progress")) return 2
    if (["in-review", "review"].includes(type) || id.includes("review")) return 3
    if (["completed", "done"].includes(type) || DONE_COLUMN_IDS.has(id)) return 4
    return 2
}

export function getSourceTasks(tasks: Task[], source: TaskSource) {
    return tasks.filter((task) => getTaskSource(task) === source)
}

export function getTaskBoardColumns(project: Project, source: TaskSource): TaskBoardColumn[] {
    const sourceColumns = project.sourceColumns?.[source] || []
    const legacyColumns = source === "manual" ? (project.columns || []) : []
    const taskStatuses = uniqueSorted(getSourceTasks(project.tasks || [], source).map((task) => task.status))

    const columns = new Map<string, TaskBoardColumn>()
    const addColumn = (column: TaskBoardColumn) => {
        if (!column.id || columns.has(column.id)) return
        columns.set(column.id, {
            ...column,
            title: column.title || formatBoardTitle(column.id)
        })
    }

    sourceColumns.forEach(addColumn)
    legacyColumns.forEach(addColumn)
    taskStatuses.forEach((status) => addColumn({ id: status, title: formatBoardTitle(status) }))

    if (columns.size === 0 && source === "manual") {
        DEFAULT_TASK_COLUMNS.forEach(addColumn)
    }

    if (source !== "manual" && sourceColumns.length > 0) {
        return Array.from(columns.values())
    }

    return Array.from(columns.values()).sort((left, right) => {
        const weightDiff = columnSortWeight(left) - columnSortWeight(right)
        if (weightDiff !== 0) return weightDiff
        return compareText(left.title, right.title)
    })
}

export function getTaskFilterOptions(taskViewModels: TaskViewModel[]): TaskFilterOptions {
    return {
        assignees: uniqueSorted(taskViewModels.map((task) => task.task.assignee)),
        components: uniqueSorted(taskViewModels.flatMap((task) => task.task.components || [])),
        labels: uniqueSorted(taskViewModels.flatMap((task) => getTaskLabels(task.task))),
        sprints: uniqueSorted(taskViewModels.map((task) => task.task.sprint?.name)),
        statuses: uniqueSorted(taskViewModels.map((task) => task.task.status)),
        versions: uniqueSorted(taskViewModels.map((task) => task.task.version))
    }
}

export function getTaskDueState(task: Task, now = Date.now()): TaskDueState {
    if (!task.dueDate) return "none"
    if (task.dueDate < now) return "overdue"
    const threeDays = 3 * 24 * 60 * 60 * 1000
    if (task.dueDate - now <= threeDays) return "soon"
    return "future"
}

export function getHandoffState(task: Task, handoff?: HandoffPacket | null): TaskHandoffState {
    if (!handoff && !task.activeHandoffId) return "none"
    if (!handoff) return "draft"
    const missing = handoff.missingFields || []
    if (missing.length > 0) return "incomplete"
    return "ready"
}

function formatDueLabel(task: Task, dueState: TaskDueState): string | null {
    if (!task.dueDate) return null
    const dateText = new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })
    if (dueState === "overdue") return `Overdue ${dateText}`
    if (dueState === "soon") return `Due ${dateText}`
    return `Due ${dateText}`
}

export function deriveTaskViewModels(project: Project, now = Date.now()): TaskViewModel[] {
    const handoffMap = new Map((project.handoffPackets || []).map((handoff) => [handoff.id, handoff]))
    const testCases = project.testPlans.flatMap((plan) => plan.testCases)

    return (project.tasks || []).map((task) => {
        const linkedTestCases = testCases.filter((testCase) => isTestCaseLinkedToTask(testCase, task))
        const activeHandoff = task.activeHandoffId ? handoffMap.get(task.activeHandoffId) : (project.handoffPackets || []).find((handoff) => handoff.taskId === task.id)
        const handoffMissingFields = activeHandoff?.missingFields || []
        const dueState = getTaskDueState(task, now)
        const isReadyForQa = task.collabState === "ready_for_qa"
        const isDevQueue = ["ready_for_dev", "dev_acknowledged", "in_fix"].includes(task.collabState || "draft")
        const severity = task.severity || "major"
        const isBlockedOrCritical = task.priority === "critical" || severity === "critical" || severity === "blocker"
        const isRecentlyUpdatedExternal = task.source !== "manual" && now - (task.updatedAt || 0) <= 2 * 24 * 60 * 60 * 1000
        const needsAttentionScore =
            (task.priority === "critical" ? 30 : task.priority === "high" ? 18 : 0) +
            (severity === "blocker" ? 30 : severity === "critical" ? 22 : 0) +
            (dueState === "overdue" ? 18 : dueState === "soon" ? 8 : 0) +
            (isReadyForQa ? 14 : 0) +
            (handoffMissingFields.length > 0 ? 10 : 0) +
            (linkedTestCases.length === 0 ? 8 : 0) +
            (!task.assignee ? 5 : 0) +
            (task.collabState === "ready_for_dev" ? 7 : 0)

        return {
            task,
            linkedTestCount: linkedTestCases.length,
            linkedTestCases,
            hasActiveHandoff: Boolean(activeHandoff),
            handoffState: getHandoffState(task, activeHandoff),
            handoffMissingFields,
            dueState,
            dueLabel: formatDueLabel(task, dueState),
            dueTimestamp: task.dueDate || null,
            needsAttentionScore,
            coverageState: linkedTestCases.length > 0 ? "linked" : "uncovered",
            isReadyForQa,
            isDevQueue,
            isBlockedOrCritical,
            isRecentlyUpdatedExternal
        }
    })
}

export function filterTaskViewModels(taskViewModels: TaskViewModel[], filters: TaskBoardFilters, currentUser?: string | null, boardColumns: TaskBoardColumn[] = []): TaskViewModel[] {
    const query = filters.search.trim().toLowerCase()
    return taskViewModels.filter(({ task, dueState, coverageState, handoffState }) => {
        if (filters.source !== "all" && (task.source || "manual") !== filters.source) return false
        if (filters.assignee !== "all" && (task.assignee || "") !== filters.assignee) return false
        if (filters.priority !== "all" && task.priority !== filters.priority) return false
        if (filters.severity !== "all" && (task.severity || "major") !== filters.severity) return false
        if (filters.collabState !== "all" && (task.collabState || "draft") !== filters.collabState) return false
        if (filters.handoffState !== "all" && handoffState !== filters.handoffState) return false
        if (filters.dueState !== "all" && dueState !== filters.dueState) return false
        if (filters.coverageState !== "all" && coverageState !== filters.coverageState) return false
        if (filters.component !== "all" && !(task.components || []).includes(filters.component)) return false
        if (filters.label !== "all" && !getTaskLabels(task).includes(filters.label)) return false
        if (filters.sprint !== "all" && (task.sprint?.name || "") !== filters.sprint) return false
        if (filters.version && (task.version || "") !== filters.version) return false
        if (filters.status !== "all" && task.status !== filters.status) return false
        if (filters.onlyMine && currentUser && task.assignee !== currentUser) return false
        if (filters.onlyActive) {
            const matchingColumn = findColumnForStatus(boardColumns, task.status)
            if (matchingColumn ? !isActiveColumn(matchingColumn) : !ACTIVE_COLUMN_IDS.has(task.status.toLowerCase())) return false
        }
        if (!query) return true

        const haystack = [
            task.title,
            task.sourceIssueId,
            task.externalId,
            task.description,
            task.labels,
            ...(task.components || [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()

        return haystack.includes(query)
    })
}

export function sortTaskViewModels(taskViewModels: TaskViewModel[], sortMode: TaskSortMode): TaskViewModel[] {
    if (sortMode === "manual") return taskViewModels
    const next = [...taskViewModels]
    next.sort((left, right) => {
        if (sortMode === "due") {
            return (left.dueTimestamp ?? Number.MAX_SAFE_INTEGER) - (right.dueTimestamp ?? Number.MAX_SAFE_INTEGER)
        }
        if (sortMode === "priority") {
            const rightScore = PRIORITY_WEIGHT[right.task.priority] * 10 + SEVERITY_WEIGHT[right.task.severity || "major"]
            const leftScore = PRIORITY_WEIGHT[left.task.priority] * 10 + SEVERITY_WEIGHT[left.task.severity || "major"]
            return rightScore - leftScore
        }
        return (right.task.updatedAt || 0) - (left.task.updatedAt || 0)
    })
    return next
}

export function buildTriageSections(taskViewModels: TaskViewModel[]): TriageSection[] {
    return [
        {
            id: "overdue",
            title: "Overdue",
            description: "Due date has already passed.",
            tasks: taskViewModels.filter((task) => task.dueState === "overdue").sort((a, b) => b.needsAttentionScore - a.needsAttentionScore)
        },
        {
            id: "ready-for-qa",
            title: "Ready for QA",
            description: "Returned from development and waiting for verification.",
            tasks: taskViewModels.filter((task) => task.isReadyForQa).sort((a, b) => b.needsAttentionScore - a.needsAttentionScore)
        },
        {
            id: "awaiting-dev",
            title: "Awaiting Dev Ack",
            description: "Handoffs sent but not yet acknowledged.",
            tasks: taskViewModels.filter((task) => task.task.collabState === "ready_for_dev").sort((a, b) => b.needsAttentionScore - a.needsAttentionScore)
        },
        {
            id: "high-priority-unassigned",
            title: "High Priority Unassigned",
            description: "Critical work without an owner.",
            tasks: taskViewModels
                .filter((task) => !task.task.assignee && ["high", "critical"].includes(task.task.priority))
                .sort((a, b) => b.needsAttentionScore - a.needsAttentionScore)
        },
        {
            id: "coverage-gaps",
            title: "No Linked Tests",
            description: "Tasks that still need traceable coverage.",
            tasks: taskViewModels.filter((task) => task.coverageState === "uncovered").sort((a, b) => b.needsAttentionScore - a.needsAttentionScore)
        },
        {
            id: "recent-external",
            title: "Recent External Updates",
            description: "Fresh Linear/Jira changes worth triaging.",
            tasks: taskViewModels.filter((task) => task.isRecentlyUpdatedExternal).sort((a, b) => b.task.updatedAt - a.task.updatedAt)
        }
    ].filter((section) => section.tasks.length > 0)
}

export function getBoardMetrics(taskViewModels: TaskViewModel[], currentUser?: string | null, boardColumns: TaskBoardColumn[] = []) {
    return {
        open: taskViewModels.filter((task) => {
            const matchingColumn = findColumnForStatus(boardColumns, task.task.status)
            return matchingColumn ? !isDoneColumn(matchingColumn) : !DONE_COLUMN_IDS.has(task.task.status.toLowerCase())
        }).length,
        overdue: taskViewModels.filter((task) => task.dueState === "overdue").length,
        readyForQa: taskViewModels.filter((task) => task.isReadyForQa).length,
        needsEvidence: taskViewModels.filter((task) => task.handoffState === "incomplete").length,
        uncovered: taskViewModels.filter((task) => task.coverageState === "uncovered").length,
        myItems: currentUser
            ? taskViewModels.filter((task) => task.task.assignee === currentUser).length
            : taskViewModels.filter((task) => Boolean(task.task.assignee)).length
    }
}

export function getSummaryRail(taskViewModels: TaskViewModel[]) {
    const now = Date.now()
    const endOfWeek = now + 7 * 24 * 60 * 60 * 1000
    return [
        {
            id: "qa-queue",
            title: "QA Queue",
            description: "Ready for QA or active retest work.",
            count: taskViewModels.filter((task) => ["ready_for_qa", "qa_retesting"].includes(task.task.collabState || "draft")).length
        },
        {
            id: "dev-queue",
            title: "Dev Queue",
            description: "Waiting on development follow-through.",
            count: taskViewModels.filter((task) => task.isDevQueue).length
        },
        {
            id: "blocked-critical",
            title: "Blocked / Critical",
            description: "Critical priority or severity.",
            count: taskViewModels.filter((task) => task.isBlockedOrCritical).length
        },
        {
            id: "coverage-gaps",
            title: "Coverage Gaps",
            description: "No linked tests yet.",
            count: taskViewModels.filter((task) => task.coverageState === "uncovered").length
        },
        {
            id: "due-this-week",
            title: "Due This Week",
            description: "Scheduled in the next 7 days.",
            count: taskViewModels.filter((task) => task.dueTimestamp && task.dueTimestamp >= now && task.dueTimestamp <= endOfWeek).length
        }
    ]
}

export function getAssigneeOptions(taskViewModels: TaskViewModel[]) {
    return getTaskFilterOptions(taskViewModels).assignees
}

export function getComponentOptions(taskViewModels: TaskViewModel[]) {
    return getTaskFilterOptions(taskViewModels).components
}

export function applySummaryPreset(summaryId: string, filters: TaskBoardFilters): TaskBoardFilters {
    if (summaryId === "qa-queue") return { ...filters, collabState: "ready_for_qa" }
    if (summaryId === "dev-queue") return { ...filters, collabState: "ready_for_dev" }
    if (summaryId === "blocked-critical") return { ...filters, priority: "critical", severity: "all" }
    if (summaryId === "coverage-gaps") return { ...filters, coverageState: "uncovered" }
    if (summaryId === "due-this-week") return { ...filters, dueState: "soon" }
    return filters
}

export function isTestCaseLinkedToTask(testCase: TestCase, task: Task) {
    if (testCase.sourceIssueId && task.sourceIssueId && testCase.sourceIssueId === task.sourceIssueId) return true
    if (testCase.linkedDefectIds?.includes(task.id)) return true
    return Boolean(testCase.components?.some((component) => task.components?.includes(component)))
}
