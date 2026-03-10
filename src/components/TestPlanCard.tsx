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
        passed: '#10B981',
        failed: '#EF4444',
        blocked: '#F59E0B',
        skipped: '#A3A3A3',
        'not-run': '#6B7280'
    }

    const statusesRendered = Object.entries(statusCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5 px-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[status as TestCaseStatus] }} />
                <span className="text-[10px] text-[#6B7280]">{count} {status}</span>
            </div>
        ))

    return (
        <div className={cn(
            "bg-[#13131A] border border-[#2A2A3A] rounded-xl overflow-hidden transition-all shadow-sm",
            plan.isArchived ? "opacity-60" : "opacity-100"
        )}>
            {/* Header */}
            <div
                className="flex items-center p-4 cursor-pointer hover:bg-[#1A1A24] transition-colors gap-3"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="text-[#A78BFA]">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] font-bold text-[#A78BFA] tracking-tight">{plan.displayId || 'PLAN-XXX'}</span>
                        <span className="text-[14px] font-semibold text-[#E2E8F0] truncate">{plan.name}</span>
                        <div className="bg-[#1E1E32] px-2 py-0.5 rounded border border-[#2A2A3A]/50 shrink-0">
                            <span className="text-[10px] text-[#9CA3AF] uppercase font-bold">{plan.testCases.length} CASE{plan.testCases.length !== 1 ? 'S' : ''}</span>
                        </div>
                        {plan.isArchived && <div className="bg-[#2D2010] px-2 py-0.5 rounded border border-[#FBBF24]/20 shrink-0 text-[10px] font-bold text-[#FBBF24] uppercase tracking-wider">ARCHIVED</div>}
                        {plan.isRegressionSuite && <div className="bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/20 shrink-0 text-[10px] font-bold text-[#10B981] uppercase tracking-wider">REGRESSION</div>}
                    </div>
                    {/* Status summary */}
                    <div className="flex items-center mt-1">
                        {statusesRendered}
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#A78BFA] hover:bg-[#A78BFA]/10" onClick={() => onRunCases(plan)} title="Execute Plan">
                        <PlayCircle className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#A78BFA] hover:bg-[#A78BFA]/10" onClick={() => resetTestPlanStatuses(activeProjectId, plan.id)} title="Reset Statuses">
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#A78BFA] hover:bg-[#A78BFA]/10" onClick={() => duplicateTestPlan(activeProjectId, plan.id)} title="Duplicate Plan">
                        <Copy className="h-4 w-4" />
                    </Button>
                    <div className="w-[1px] h-6 bg-[#2A2A3A] mx-0.5" />
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#A78BFA] hover:bg-[#A78BFA]/10" onClick={() => onEditPlan(plan)} title="Edit Plan">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#A78BFA] hover:bg-[#A78BFA]/10" onClick={() => archiveTestPlan(activeProjectId, plan.id, !plan.isArchived)}>
                        <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-[#6B7280] hover:text-[#F87171] hover:bg-[#EF4444]/10" onClick={() => deleteTestPlan(activeProjectId, plan.id)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Smart Filters + Bulk Action Toolbar */}
            {!isCollapsed && (
                <>
                    <div className="px-5 py-3 bg-[#13131A] border-t border-[#2A2A3A] flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 text-[10px] font-black text-[#6B7280] uppercase tracking-widest mr-2">
                            <Filter className="h-3.5 w-3.5" /> Filters
                        </div>
                        <Input 
                            placeholder="Filter by title, ID or #tag..." 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-8 w-60 bg-[#1A1A24] border-[#2A2A3A] text-xs focus-visible:ring-indigo-500/20"
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-32 h-8 bg-[#1A1A24] border-[#2A2A3A] text-[11px] font-bold">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="passed">Passed</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="not-run">Not Run</SelectItem>
                                <SelectItem value="skipped">Skipped</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                            <SelectTrigger className="w-32 h-8 bg-[#1A1A24] border-[#2A2A3A] text-[11px] font-bold">
                                <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                <SelectItem value="all">All Priorities</SelectItem>
                                <SelectItem value="blocker">Blocker</SelectItem>
                                <SelectItem value="major">Major</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                            </SelectContent>
                        </Select>

                        {(searchQuery || statusFilter !== 'all' || priorityFilter !== 'all') && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPriorityFilter("all"); }} className="h-8 text-[10px] font-bold text-[#EF4444] uppercase tracking-tight">
                                <X className="h-3 w-3 mr-1" /> Clear
                            </Button>
                        )}
                    </div>

                    {/* Bulk Toolbar */}
                    {selectedCaseIds.size > 0 && (
                        <div className="mx-5 mb-4 p-3 bg-[#6366F1]/10 border border-[#6366F1]/30 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center gap-3">
                                <CheckSquare className="h-5 w-5 text-[#818CF8]" />
                                <span className="text-xs font-black text-[#A5B4FC] uppercase tracking-widest">{selectedCaseIds.size} Selected</span>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(false)} className="h-6 text-[10px] font-bold text-[#A5B4FC] hover:text-[#E2E8F0] uppercase">Deselect All</Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatusChange('passed')} className="h-7 text-[10px] font-black uppercase bg-[#10B981]/20 text-[#10B981] hover:bg-[#10B981]/30 border-none">Pass</Button>
                                <Button variant="secondary" size="sm" onClick={() => handleBulkStatusChange('failed')} className="h-7 text-[10px] font-black uppercase bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30 border-none">Fail</Button>
                                <div className="w-[1px] h-4 bg-[#6366F1]/30 mx-1" />
                                <Button variant="secondary" size="sm" onClick={handleBulkDelete} className="h-7 text-[10px] font-black uppercase bg-[#EF4444]/10 text-[#6B7280] hover:text-[#EF4444] border-none">Delete</Button>
                            </div>
                        </div>
                    )}

                    {/* Case List */}
                    <div className="px-5 pb-4 pl-[42px] flex flex-col gap-2 bg-[#0F0F13]/30 border-t border-[#2A2A3A]">
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
                            <div className="py-12 text-center opacity-40 italic text-sm text-[#6B7280]">
                                No test cases match the current filters.
                            </div>
                        )}
                        <div className="pt-1 flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditCases(plan)}
                                className="h-8 text-[10px] font-black text-[#818CF8] hover:text-[#A5B4FC] hover:bg-transparent px-0 gap-1.5 uppercase tracking-widest"
                            >
                                <Plus className="h-4 w-4" /> Add Test Case
                            </Button>
                            {filteredCases.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSelectAll(selectedCaseIds.size !== filteredCases.length)}
                                    className="h-8 text-[10px] font-black text-[#6B7280] hover:text-[#E2E8F0] hover:bg-transparent px-0 gap-1.5 uppercase tracking-widest ml-auto"
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
