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
    activeFilterCount?: number
    presets?: Array<{ name: string }>
    onApplyPreset?: (name: string) => void
    onDeletePreset?: (name: string) => void
    onShowPresetInput?: () => void
    showPresetInput?: boolean
    presetInput?: string
    onPresetInputChange?: (value: string) => void
    onSavePreset?: () => void
    onCancelPreset?: () => void
    summaryItems?: Array<{ id: string; title: string; count: number }>
    onSelectSummary?: (id: string) => void
    onSync?: () => void
    syncLabel?: string
    syncMeta?: string
    syncDisabled?: boolean
    onOpenShortcuts?: () => void
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
    onCollapsedChange,
    activeFilterCount = 0,
    presets = [],
    onApplyPreset,
    onDeletePreset,
    onShowPresetInput,
    showPresetInput = false,
    presetInput = "",
    onPresetInputChange,
    onSavePreset,
    onCancelPreset,
    summaryItems = [],
    onSelectSummary,
    onSync,
    syncLabel,
    syncMeta,
    syncDisabled = false,
    onOpenShortcuts
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
                    More
                    {activeFilterCount > 0 && (
                        <span className="rounded-full bg-[#A78BFA]/20 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#A78BFA]">
                            {activeFilterCount}
                        </span>
                    )}
                    {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>
            </div>
            {!collapsed && (
                <div className="mt-3 space-y-3 border-t border-[#2A2A3A]/70 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#6B7280]">View</span>
                        {(["board", "triage"] as const).map((mode) => (
                            <Button
                                key={mode}
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onBoardModeChange(mode)}
                                className={boardMode === mode ? "h-8 bg-[#1A1A24] px-3 text-[11px] font-medium text-[#E2E8F0]" : "h-8 px-3 text-[11px] text-[#6B7280]"}
                            >
                                {mode === "board" ? "Board" : "Triage"}
                            </Button>
                        ))}
                        {onSync && syncLabel ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onSync}
                                disabled={syncDisabled}
                                className="h-8 px-3 text-[11px] font-medium text-[#A78BFA] hover:bg-[#A78BFA]/10"
                            >
                                {syncLabel}
                            </Button>
                        ) : null}
                        {onOpenShortcuts ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onOpenShortcuts}
                                className="h-8 px-3 text-[11px] font-medium text-[#6B7280] hover:text-[#E2E8F0]"
                            >
                                Shortcuts
                            </Button>
                        ) : null}
                        {syncMeta ? <span className="text-[11px] text-[#6B7280]">{syncMeta}</span> : null}
                    </div>

                    {summaryItems.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-[#2A2A3A]/70 pt-3">
                            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#6B7280]">Quick Views</span>
                            {summaryItems.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSelectSummary?.(item.id)}
                                    className="inline-flex items-center gap-2 rounded-full border border-[#2A2A3A] bg-[#0F0F13] px-3 py-1 text-[11px] text-[#C4CBD7] transition-colors hover:border-[#A78BFA]/40 hover:text-[#E2E8F0]"
                                >
                                    <span>{item.title}</span>
                                    <span className="text-[#6B7280]">{item.count}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
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

                    {(presets.length > 0 || showPresetInput || onShowPresetInput) && (
                        <div className="flex w-full flex-wrap items-center gap-2 border-t border-[#2A2A3A]/70 pt-3">
                            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#6B7280]">Saved Views</span>
                            {presets.map((preset) => (
                                <div key={preset.name} className="flex items-center gap-1 rounded-full border border-[#2A2A3A] bg-[#0F0F13] pl-2.5 pr-1 py-0.5">
                                    <button
                                        type="button"
                                        onClick={() => onApplyPreset?.(preset.name)}
                                        className="text-[11px] font-medium text-[#E2E8F0] hover:text-white"
                                    >
                                        {preset.name}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDeletePreset?.(preset.name)}
                                        className="rounded-full p-0.5 text-[#6B7280] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                </div>
                            ))}
                            {showPresetInput ? (
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        value={presetInput}
                                        onChange={(event) => onPresetInputChange?.(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") onSavePreset?.()
                                            if (event.key === "Escape") onCancelPreset?.()
                                        }}
                                        placeholder="Preset name..."
                                        className="h-8 w-36 border-[#2A2A3A] bg-[#0F0F13] px-2 text-[10px]"
                                    />
                                    <Button type="button" size="sm" onClick={onSavePreset} className="h-8 bg-[#A78BFA] px-2 text-[#0F0F13]">
                                        Save
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" onClick={onCancelPreset} className="h-8 px-2 text-[#6B7280]">
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button type="button" variant="ghost" size="sm" onClick={onShowPresetInput} className="h-8 px-2 text-[11px] font-medium text-[#6B7280] hover:text-[#E2E8F0]">
                                    Save current filters
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
