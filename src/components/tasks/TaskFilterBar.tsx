import type { ReactNode } from "react"
import { ChevronDown, ChevronUp, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
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

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ")

/** Sentinel for "no filter". Radix Select cannot hold an empty-string value. */
const ANY = "all"

/**
 * One labelled facet. Every filter is a Radix Select rather than a native
 * `<select>`: the row used to be fourteen OS-rendered dropdowns, which on
 * macOS paint in the system's own chrome — a different font, radius and
 * (in dark mode) a different background from every other control on screen.
 */
function Facet({
    label,
    value,
    onChange,
    options,
    anyLabel,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    options: Array<{ label: string; value: string }>
    anyLabel: string
}) {
    return (
        <label className="flex min-w-0 flex-col gap-1">
            <span className="filter-field-label">{label}</span>
            <Select value={value || ANY} onValueChange={onChange}>
                <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ANY} className="text-xs">{anyLabel}</SelectItem>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </label>
    )
}

function FilterToggle({
    pressed,
    onClick,
    children,
}: {
    pressed: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            onClick={onClick}
            data-pressed={pressed || undefined}
            className="filter-toggle"
        >
            {children}
        </button>
    )
}

/**
 * Board toolbar: the controls that are always worth a click sit on one flush
 * band, and the long tail of facets lives behind "Filters".
 *
 * Everything used to be in the open at once — search, two view buttons, sync,
 * shortcuts, a quick-views chip row, fourteen unlabelled dropdowns, two
 * toggles, clear, and a saved-views row — wrapping into five or six lines
 * above the board on a laptop. Expanded, the facets are now a labelled grid,
 * so a dropdown reading "Major" says which axis it belongs to.
 */
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
    const set = <K extends keyof TaskBoardFilters>(key: K, value: TaskBoardFilters[K]) =>
        setFilters((current) => ({ ...current, [key]: value }))

    return (
        <div className="shrink-0">
            <div className="board-toolbar">
                <SegmentedControl
                    value={boardMode}
                    onChange={(mode) => onBoardModeChange(mode as TaskBoardMode)}
                    options={[
                        { value: "board", label: "Board" },
                        { value: "triage", label: "Triage" },
                    ]}
                />

                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-ui" />
                    <Input
                        aria-label="Search tasks"
                        value={filters.search}
                        onChange={(event) => set("search", event.target.value)}
                        placeholder="Search title, ID, label, component…"
                        className="h-9 border-ui bg-background pl-9 text-xs"
                    />
                </div>

                <Select value={sortMode} onValueChange={(value) => onSortModeChange(value as TaskSortMode)}>
                    <SelectTrigger aria-label="Sort tasks" className="h-9 w-[168px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="manual" className="text-xs">Manual order</SelectItem>
                        <SelectItem value="due" className="text-xs">Due date</SelectItem>
                        <SelectItem value="priority" className="text-xs">Priority / severity</SelectItem>
                        <SelectItem value="updated" className="text-xs">Recently updated</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={!collapsed}
                    onClick={() => onCollapsedChange(!collapsed)}
                    className="h-9 gap-2 border-ui bg-background text-foreground"
                >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold leading-none text-primary">
                            {activeFilterCount}
                        </span>
                    )}
                    {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </Button>

                {activeFilterCount > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-9 gap-1 text-muted-ui hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                        Clear
                    </Button>
                )}

                <div className="flex-1" />

                {onSync && syncLabel ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onSync}
                        disabled={syncDisabled}
                        title={syncMeta}
                        className="h-9 gap-2 text-primary hover:bg-primary/10"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {syncLabel}
                    </Button>
                ) : null}
                {onOpenShortcuts ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onOpenShortcuts}
                        aria-label="Keyboard shortcuts"
                        className="h-9 w-9 p-0 font-mono text-muted-ui hover:text-foreground"
                    >
                        ?
                    </Button>
                ) : null}
            </div>

            {!collapsed && (
                <div className="board-filter-panel space-y-4">
                    {summaryItems.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="filter-field-label mr-1">Quick views</span>
                            {summaryItems.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSelectSummary?.(item.id)}
                                    className="inline-flex items-center gap-2 rounded-full border border-ui bg-background px-3 py-1 text-xs text-soft transition-[border-color,color] hover:border-ui-strong hover:text-foreground"
                                >
                                    <span>{item.title}</span>
                                    <span className="text-muted-ui">{item.count}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                        <Facet
                            label="Status" anyLabel="Any status"
                            value={filters.status}
                            onChange={(value) => set("status", value)}
                            options={statuses.map((status) => ({ label: status, value: status }))}
                        />
                        <Facet
                            label="Assignee" anyLabel="Anyone"
                            value={filters.assignee}
                            onChange={(value) => set("assignee", value)}
                            options={assignees.map((assignee) => ({ label: assignee, value: assignee }))}
                        />
                        <Facet
                            label="Priority" anyLabel="Any priority"
                            value={filters.priority}
                            onChange={(value) => set("priority", value as TaskBoardFilters["priority"])}
                            options={[
                                { label: "Critical", value: "critical" },
                                { label: "High", value: "high" },
                                { label: "Medium", value: "medium" },
                                { label: "Low", value: "low" },
                            ]}
                        />
                        <Facet
                            label="Severity" anyLabel="Any severity"
                            value={filters.severity}
                            onChange={(value) => set("severity", value as TaskSeverity | "all")}
                            options={severities.map((severity) => ({ label: titleCase(severity), value: severity }))}
                        />
                        <Facet
                            label="Collaboration" anyLabel="Any state"
                            value={filters.collabState}
                            onChange={(value) => set("collabState", value as TaskBoardFilters["collabState"])}
                            options={collabStates.map((state) => ({ label: titleCase(state), value: state }))}
                        />
                        <Facet
                            label="Handoff" anyLabel="Any handoff"
                            value={filters.handoffState}
                            onChange={(value) => set("handoffState", value as TaskBoardFilters["handoffState"])}
                            options={[
                                { label: "Ready", value: "ready" },
                                { label: "Incomplete", value: "incomplete" },
                                { label: "Draft", value: "draft" },
                                { label: "None", value: "none" },
                            ]}
                        />
                        <Facet
                            label="Due" anyLabel="Any due date"
                            value={filters.dueState}
                            onChange={(value) => set("dueState", value as TaskBoardFilters["dueState"])}
                            options={[
                                { label: "Overdue", value: "overdue" },
                                { label: "Due soon", value: "soon" },
                                { label: "No due date", value: "none" },
                            ]}
                        />
                        <Facet
                            label="Coverage" anyLabel="Any coverage"
                            value={filters.coverageState}
                            onChange={(value) => set("coverageState", value as TaskBoardFilters["coverageState"])}
                            options={[
                                { label: "Linked tests", value: "linked" },
                                { label: "No linked tests", value: "uncovered" },
                            ]}
                        />
                        <Facet
                            label="Component" anyLabel="Any component"
                            value={filters.component}
                            onChange={(value) => set("component", value)}
                            options={components.map((component) => ({ label: component, value: component }))}
                        />
                        {labels.length > 0 && (
                            <Facet
                                label="Label" anyLabel="Any label"
                                value={filters.label}
                                onChange={(value) => set("label", value)}
                                options={labels.map((label) => ({ label, value: label }))}
                            />
                        )}
                        {sprints.length > 0 && (
                            <Facet
                                label="Sprint" anyLabel="Any sprint"
                                value={filters.sprint}
                                onChange={(value) => set("sprint", value)}
                                options={sprints.map((sprint) => ({ label: sprint, value: sprint }))}
                            />
                        )}
                        {versions.length > 0 && (
                            <Facet
                                label="Version" anyLabel="Any version"
                                value={filters.version || ANY}
                                onChange={(value) => set("version", value === ANY ? "" : value)}
                                options={versions.map((version) => ({ label: version, value: version }))}
                            />
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-ui/70 pt-3">
                        {/* Toggles, not calls to action: a filled primary button here
                            competed with "New Task" for the eye. Selected state is
                            carried by the same selected-surface the rail uses. */}
                        <FilterToggle pressed={filters.onlyMine} onClick={() => set("onlyMine", !filters.onlyMine)}>
                            Only my work
                        </FilterToggle>
                        <FilterToggle pressed={filters.onlyActive} onClick={() => set("onlyActive", !filters.onlyActive)}>
                            Only active
                        </FilterToggle>

                        <div className="flex-1" />

                        {presets.length > 0 ? <span className="filter-field-label">Saved views</span> : null}
                        {presets.map((preset) => (
                            <div key={preset.name} className="flex items-center gap-1 rounded-full border border-ui bg-background py-0.5 pl-2.5 pr-1">
                                <button
                                    type="button"
                                    onClick={() => onApplyPreset?.(preset.name)}
                                    className="text-xs font-medium text-foreground"
                                >
                                    {preset.name}
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Delete saved view ${preset.name}`}
                                    onClick={() => onDeletePreset?.(preset.name)}
                                    className="rounded-full p-0.5 text-muted-ui hover:bg-state-danger-soft hover:text-state-danger"
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </div>
                        ))}
                        {showPresetInput ? (
                            <div className="flex items-center gap-1.5">
                                <Input
                                    autoFocus
                                    value={presetInput}
                                    onChange={(event) => onPresetInputChange?.(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") onSavePreset?.()
                                        if (event.key === "Escape") onCancelPreset?.()
                                    }}
                                    placeholder="View name…"
                                    className="h-8 w-36 border-ui bg-background px-2 text-xs"
                                />
                                <Button type="button" size="sm" onClick={onSavePreset} className="h-8 px-2">Save</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={onCancelPreset} className="h-8 px-2 text-muted-ui">Cancel</Button>
                            </div>
                        ) : (
                            <Button type="button" variant="ghost" size="sm" onClick={onShowPresetInput} className="h-8 px-2 text-muted-ui hover:text-foreground">
                                Save current filters
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
