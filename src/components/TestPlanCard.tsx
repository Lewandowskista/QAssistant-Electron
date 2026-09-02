import { useState, useMemo } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { TestPlan, TestCaseStatus, TestCase } from "@/types/project"
import {
    ChevronDown,
    ChevronRight,
    Archive,
    Edit2,
    Trash2,
    Copy,
    PlayCircle,
    Plus,
    Filter,
    X,
    CheckSquare,
    RotateCcw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import TestCaseCard from "./TestCaseCard"

interface TestPlanCardProps {
    plan: TestPlan
    activeProjectId: string
    onEditCases: (plan: TestPlan) => void
    onRunCases: (plan: TestPlan) => void
    onRunCase: (plan: TestPlan, testCase: TestCase) => void
    onEditPlan: (plan: TestPlan) => void
}

export default function TestPlanCard({ plan, activeProjectId, onEditCases, onRunCases, onRunCase, onEditPlan }: TestPlanCardProps) {
    const { 
        archiveTestPlan, 
        deleteTestPlan, 
        resetTestPlanStatuses, 
        duplicateTestPlan,
        batchUpdateTestCases,
        batchDeleteTestCases
    } = useProjectStore()
    
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [priorityFilter, setPriorityFilter] = useState<string>("all")
    const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set())

    // Filtered Test Cases
    const filteredCases = useMemo(() => {
        return plan.testCases.filter(tc => {
            const matchesSearch = tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                tc.displayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (tc.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
            const matchesStatus = statusFilter === "all" || tc.status === statusFilter
            const matchesPriority = priorityFilter === "all" || tc.priority === priorityFilter
            return matchesSearch && matchesStatus && matchesPriority
        })
    }, [plan.testCases, searchQuery, statusFilter, priorityFilter])

    // Bulk actions
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedCaseIds(new Set(filteredCases.map(tc => tc.id)))
        } else {
            setSelectedCaseIds(new Set())
        }
    }

    const toggleSelection = (caseId: string, selected: boolean) => {
        const next = new Set(selectedCaseIds)
        if (selected) next.add(caseId)
        else next.delete(caseId)
        setSelectedCaseIds(next)
    }

    const handleBulkStatusChange = (status: TestCaseStatus) => {
        batchUpdateTestCases(activeProjectId, plan.id, Array.from(selectedCaseIds), { status })
        setSelectedCaseIds(new Set())
    }

    const handleBulkDelete = () => {
        if (confirm(`Delete ${selectedCaseIds.size} test cases?`)) {
            batchDeleteTestCases(activeProjectId, plan.id, Array.from(selectedCaseIds))
            setSelectedCaseIds(new Set())
        }
    }

    // Calculate Summary
    const statusCounts = plan.testCases.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1
        return acc
    }, {} as Record<TestCaseStatus, number>)

    const statusColors = {
        passed: 'hsl(var(--state-success))',
        failed: 'hsl(var(--state-danger))',
        blocked: 'hsl(var(--state-warning))',
        skipped: 'hsl(var(--text-secondary))',
        'not-run': 'hsl(var(--text-muted))'
    }

    const statusesRendered = Object.entries(statusCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[status as TestCaseStatus] }} />
                <span className="text-[11px] text-muted-ui">{count} {status}</span>
            </div>
        ))

    return (
        <div className={cn(
            "bg-panel border border-ui rounded-xl overflow-hidden transition-all shadow-sm",
            plan.isArchived ? "opacity-60" : "opacity-100"
        )}>
            {/* Header */}
            <div
                className="flex items-center p-4 cursor-pointer hover:bg-elevated transition-colors gap-3"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="text-brand">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] font-bold text-brand tracking-tight">{plan.displayId || 'PLAN-XXX'}</span>
                        <span className="text-[14px] font-semibold text-foreground truncate">{plan.name}</span>
                        <div className="bg-panel-muted px-2 py-0.5 rounded border border-line/50 shrink-0">
                            <span className="text-[11px] text-soft uppercase font-bold">{plan.testCases.length} CASE{plan.testCases.length !== 1 ? 'S' : ''}</span>
                        </div>
                        {plan.isArchived && <div className="bg-state-warning-soft px-2 py-0.5 rounded border border-state-warning-border shrink-0 text-[11px] font-bold text-state-warning uppercase tracking-wider">ARCHIVED</div>}
                        {plan.isRegressionSuite && <div className="bg-state-success-soft px-2 py-0.5 rounded border border-state-success-border shrink-0 text-[11px] font-bold text-state-success uppercase tracking-wider">REGRESSION</div>}
                    </div>
                    {/* Status summary */}
                    <div className="flex items-center mt-1">
                        {statusesRendered}
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-brand hover:bg-qa-accent/10" onClick={() => onRunCases(plan)} title="Execute Plan" aria-label="Execute plan">
                        <PlayCircle className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-brand hover:bg-qa-accent/10" onClick={() => resetTestPlanStatuses(activeProjectId, plan.id)} title="Reset Statuses" aria-label="Reset plan statuses">
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-brand hover:bg-qa-accent/10" onClick={() => duplicateTestPlan(activeProjectId, plan.id)} title="Duplicate Plan" aria-label="Duplicate plan">
                        <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div className="w-[1px] h-6 bg-elevated mx-0.5" />
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-brand hover:bg-qa-accent/10" onClick={() => onEditPlan(plan)} title="Edit Plan" aria-label="Edit plan">
                        <Edit2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-brand hover:bg-qa-accent/10" onClick={() => archiveTestPlan(activeProjectId, plan.id, !plan.isArchived)} aria-label={plan.isArchived ? "Restore plan from archive" : "Archive plan"}>
                        <Archive className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-ui hover:text-state-danger hover:bg-state-danger-soft" onClick={() => deleteTestPlan(activeProjectId, plan.id)} aria-label="Delete plan">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {/* Smart Filters + Bulk Action Toolbar */}
            {!isCollapsed && (
                <>
                    <div className="px-5 py-3 bg-panel border-t border-ui flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 text-[11px] font-black text-muted-ui uppercase tracking-widest mr-2">
                            <Filter className="h-3.5 w-3.5" /> Filters
                        </div>
                        <Input 
                            placeholder="Filter by title, ID or #tag…"
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-8 w-60 bg-panel-muted border-ui text-xs focus-visible:ring-indigo-500/20"
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-32 h-8 bg-panel-muted border-ui text-[11px] font-bold">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-panel-muted border-ui">
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="passed">Passed</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="not-run">Not Run</SelectItem>
                                <SelectItem value="skipped">Skipped</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                            <SelectTrigger className="w-32 h-8 bg-panel-muted border-ui text-[11px] font-bold">
                                <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent className="bg-panel-muted border-ui">
                                <SelectItem value="all">All Priorities</SelectItem>
                                <SelectItem value="blocker">Blocker</SelectItem>
                                <SelectItem value="major">Major</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                        </Select>

                        {(searchQuery || statusFilter !== 'all' || priorityFilter !== 'all') && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPriorityFilter("all"); }} className="h-8 text-[11px] font-bold text-state-danger uppercase tracking-tight">
                                <X className="h-3 w-3 mr-1" /> Clear
                            </Button>
                        )}
                    </div>

                    {/* Bulk Toolbar */}
                    {selectedCaseIds.size > 0 && (
                        <div className="mx-5 mb-4 p-3 bg-qa-accent/10 border border-qa-accent/30 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-3">
                                <CheckSquare className="h-5 w-5 text-qa-accent" />
                                <span className="text-xs font-black text-qa-accent uppercase tracking-widest">{selectedCaseIds.size} Selected</span>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(false)} className="h-6 text-[11px] font-bold text-qa-accent hover:text-foreground uppercase">Deselect All</Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatusChange('passed')} className="h-7 text-[11px] font-black uppercase bg-state-success/20 text-state-success hover:bg-state-success/30 border-none">Pass</Button>
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatusChange('failed')} className="h-7 text-[11px] font-black uppercase bg-state-danger/20 text-state-danger hover:bg-state-danger/30 border-none">Fail</Button>
                                <div className="w-[1px] h-4 bg-qa-accent/30 mx-1" />
                                <Button variant="secondary" size="sm" onClick={handleBulkDelete} className="h-7 text-[11px] font-black uppercase bg-state-danger-soft text-muted-ui hover:text-[hsl(var(--state-danger))] border-none">Delete</Button>
                            </div>
                        </div>
                    )}

                    {/* Case List */}
                    <div className="px-5 pb-4 pl-[42px] flex flex-col gap-2 bg-surface-app/30 border-t border-ui">
                        <div className="h-2" />
                        {filteredCases.length > 0 ? (
                            filteredCases.map(tc => (
                                <TestCaseCard 
                                    key={tc.id} 
                                    testCase={tc} 
                                    plan={plan} 
                                    activeProjectId={activeProjectId} 
                                    onRunCase={() => onRunCase(plan, tc)}
                                    isSelected={selectedCaseIds.has(tc.id)}
                                    onSelect={(selected) => toggleSelection(tc.id, selected)}
                                />
                            ))
                        ) : (
                            <div className="py-12 text-center opacity-40 italic text-sm text-muted-ui">
                                No test cases match the current filters.
                            </div>
                        )}
                        <div className="pt-1 flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditCases(plan)}
                                className="h-8 text-[11px] font-black text-qa-accent hover:text-qa-accent hover:bg-transparent px-0 gap-1.5 uppercase tracking-widest"
                            >
                                <Plus className="h-4 w-4" /> Add Test Case
                            </Button>
                            {filteredCases.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSelectAll(selectedCaseIds.size !== filteredCases.length)}
                                    className="h-8 text-[11px] font-black text-muted-ui hover:text-foreground hover:bg-transparent px-0 gap-1.5 uppercase tracking-widest ml-auto"
                                >
                                    {selectedCaseIds.size === filteredCases.length ? "Deselect All" : `Select All (${filteredCases.length})`}
                                </Button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
