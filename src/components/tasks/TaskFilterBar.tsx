import { ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { TaskBoardFilters, TaskBoardMode, TaskSortMode } from "@/lib/tasks"
import type { CollabState, TaskSeverity } from "@/types/project"

interface TaskFilterBarProps {
    filters: TaskBoardFilters
    setFilters: (updater: (filters: TaskBoardFilters) => TaskBoardFilters) => void
    versions: string[]
    assignees: string[]
    components: string[]
    statuses: string[]
    labels: string[]
    sprints: string[]
    boardMode: TaskBoardMode
    onBoardModeChange: (mode: TaskBoardMode) => void
    sortMode: TaskSortMode
    onSortModeChange: (mode: TaskSortMode) => void
    onClear: () => void
    collapsed: boolean
    onCollapsedChange: (collapsed: boolean) => void
}

const collabStates: Array<CollabState> = ["draft", "ready_for_dev", "dev_acknowledged", "in_fix", "ready_for_qa", "qa_retesting", "verified", "closed"]
const severities: Array<TaskSeverity> = ["cosmetic", "minor", "major", "critical", "blocker"]

function FilterSelect({
    value,
    onChange,
    options,
    placeholder
}: {
    value: string
    onChange: (value: string) => void
    options: Array<{ label: string; value: string }>
    placeholder: string
}) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 rounded-md border border-[#2A2A3A] bg-[#13131A] px-3 text-[11px] text-[#E2E8F0] outline-none hover:border-[#A78BFA]/30"
        >
            <option value="all">{placeholder}</option>
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    )
}

export function TaskFilterBar({
    filters,
    setFilters,
    versions,
    assignees,
    components,
    statuses,
    labels,
    sprints,
    boardMode,
    onBoardModeChange,
    sortMode,
    onSortModeChange,
    onClear,
    collapsed,
    onCollapsedChange
}: TaskFilterBarProps) {
    return (
        <div className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[260px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280]" />
                    <Input
                        value={filters.search}
                        onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                        placeholder="Search title, source ID, labels, description, components..."
                        className="h-9 border-[#2A2A3A] bg-[#0F0F13] pl-9 text-xs"
                    />
                </div>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => onCollapsedChange(!collapsed)}
                    className="h-9 gap-2 border-[#2A2A3A] bg-[#0F0F13] text-[#E2E8F0]"
                >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                    {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
                <div className="flex rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-1">
                    {(["board", "triage"] as const).map((mode) => (
                        <Button
                            key={mode}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onBoardModeChange(mode)}
                            className={boardMode === mode ? "h-7 bg-[#2A2A3A] px-3 text-[11px] font-bold text-[#A78BFA]" : "h-7 px-3 text-[11px] text-[#6B7280]"}
                        >
                            {mode === "board" ? "Board" : "Triage"}
                        </Button>
                    ))}
                </div>
            </div>
            {!collapsed && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#2A2A3A]/70 pt-3">
                    <FilterSelect
                        value={filters.source}
                        onChange={(value) => setFilters((current) => ({ ...current, source: value as TaskBoardFilters["source"] }))}
                        placeholder="All Sources"
                        options={[
                            { label: "Manual", value: "manual" },
                            { label: "Linear", value: "linear" },
                            { label: "Jira", value: "jira" }
                        ]}
                    />
                    <FilterSelect
                        value={filters.status}
                        onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
                        placeholder="All Statuses"
                        options={statuses.map((status) => ({ label: status, value: status }))}
                    />
                    <FilterSelect
                        value={filters.assignee}
                        onChange={(value) => setFilters((current) => ({ ...current, assignee: value }))}
                        placeholder="All Assignees"
                        options={assignees.map((assignee) => ({ label: assignee, value: assignee }))}
                    />
                    <FilterSelect
                        value={filters.priority}
                        onChange={(value) => setFilters((current) => ({ ...current, priority: value as TaskBoardFilters["priority"] }))}
                        placeholder="All Priorities"
                        options={[
                            { label: "Critical", value: "critical" },
                            { label: "High", value: "high" },
                            { label: "Medium", value: "medium" },
                            { label: "Low", value: "low" }
                        ]}
                    />
                    <FilterSelect
                        value={filters.severity}
                        onChange={(value) => setFilters((current) => ({ ...current, severity: value as TaskSeverity | "all" }))}
                        placeholder="All Severities"
                        options={severities.map((severity) => ({ label: severity, value: severity }))}
                    />
                    <FilterSelect
                        value={filters.collabState}
                        onChange={(value) => setFilters((current) => ({ ...current, collabState: value as TaskBoardFilters["collabState"] }))}
                        placeholder="All Collaboration"
                        options={collabStates.map((state) => ({ label: state.replace(/_/g, " "), value: state }))}
                    />
                    <FilterSelect
                        value={filters.handoffState}
                        onChange={(value) => setFilters((current) => ({ ...current, handoffState: value as TaskBoardFilters["handoffState"] }))}
                        placeholder="All Handoffs"
                        options={[
                            { label: "Ready", value: "ready" },
                            { label: "Incomplete", value: "incomplete" },
                            { label: "Draft", value: "draft" },
                            { label: "None", value: "none" }
                        ]}
                    />
                    <FilterSelect
                        value={filters.dueState}
                        onChange={(value) => setFilters((current) => ({ ...current, dueState: value as TaskBoardFilters["dueState"] }))}
                        placeholder="All Due Dates"
                        options={[
                            { label: "Overdue", value: "overdue" },
                            { label: "Due Soon", value: "soon" },
                            { label: "No Due Date", value: "none" }
                        ]}
                    />
                    <FilterSelect
                        value={filters.coverageState}
                        onChange={(value) => setFilters((current) => ({ ...current, coverageState: value as TaskBoardFilters["coverageState"] }))}
                        placeholder="All Coverage"
                        options={[
                            { label: "Linked Tests", value: "linked" },
                            { label: "No Linked Tests", value: "uncovered" }
                        ]}
                    />
                    <FilterSelect
                        value={filters.component}
                        onChange={(value) => setFilters((current) => ({ ...current, component: value }))}
                        placeholder="All Components"
                        options={components.map((component) => ({ label: component, value: component }))}
                    />
                    {labels.length > 0 && (
                        <FilterSelect
                            value={filters.label}
                            onChange={(value) => setFilters((current) => ({ ...current, label: value }))}
                            placeholder="All Labels"
                            options={labels.map((label) => ({ label, value: label }))}
                        />
                    )}
                    {sprints.length > 0 && (
                        <FilterSelect
                            value={filters.sprint}
                            onChange={(value) => setFilters((current) => ({ ...current, sprint: value }))}
                            placeholder="All Sprints"
                            options={sprints.map((sprint) => ({ label: sprint, value: sprint }))}
                        />
                    )}
                    {versions.length > 0 && (
                        <FilterSelect
                            value={filters.version || "all"}
                            onChange={(value) => setFilters((current) => ({ ...current, version: value === "all" ? "" : value }))}
                            placeholder="All Versions"
                            options={versions.map((version) => ({ label: version, value: version }))}
                        />
                    )}
                    <FilterSelect
                        value={sortMode}
                        onChange={(value) => onSortModeChange(value as TaskSortMode)}
                        placeholder="Manual Order"
                        options={[
                            { label: "Manual Order", value: "manual" },
                            { label: "Due Date", value: "due" },
                            { label: "Priority / Severity", value: "priority" },
                            { label: "Recently Updated", value: "updated" }
                        ]}
                    />
                    <Button
                        type="button"
                        variant={filters.onlyMine ? "default" : "outline"}
                        onClick={() => setFilters((current) => ({ ...current, onlyMine: !current.onlyMine }))}
                        className={filters.onlyMine ? "h-9 bg-[#A78BFA] text-[#0F0F13]" : "h-9 border-[#2A2A3A] bg-[#0F0F13] text-[#E2E8F0]"}
                    >
                        Only My Work
                    </Button>
                    <Button
                        type="button"
                        variant={filters.onlyActive ? "default" : "outline"}
                        onClick={() => setFilters((current) => ({ ...current, onlyActive: !current.onlyActive }))}
                        className={filters.onlyActive ? "h-9 bg-[#1E293B] text-[#38BDF8]" : "h-9 border-[#2A2A3A] bg-[#0F0F13] text-[#E2E8F0]"}
                    >
                        Only Active
                    </Button>
                    <Button type="button" variant="ghost" onClick={onClear} className="h-9 gap-1 text-[#6B7280] hover:text-[#E2E8F0]">
                        <X className="h-3.5 w-3.5" />
                        Clear
                    </Button>
                </div>
            )}
        </div>
    )
}
