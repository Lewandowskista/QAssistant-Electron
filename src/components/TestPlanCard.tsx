import { useState } from "react"
import { useProjectStore, TestPlan, TestCaseStatus } from "@/store/useProjectStore"
import {
    ChevronDown,
    ChevronRight,
    Archive,
    Edit2,
    Trash2,
    Copy,
    PlayCircle,
    Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import TestCaseCard from "./TestCaseCard"

interface TestPlanCardProps {
    plan: TestPlan
    activeProjectId: string
    onEditCases: (plan: TestPlan) => void
    onRunCases: (plan: TestPlan) => void
    onEditPlan: (plan: TestPlan) => void
}

export default function TestPlanCard({ plan, activeProjectId, onEditCases, onRunCases, onEditPlan }: TestPlanCardProps) {
    const { archiveTestPlan, deleteTestPlan, resetTestPlanStatuses, duplicateTestPlan } = useProjectStore()
    const [isCollapsed, setIsCollapsed] = useState(false)

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
            "bg-[#13131A] border border-[#2A2A3A] rounded-xl overflow-hidden transition-opacity shadow-sm",
            plan.isArchived ? "opacity-60" : "opacity-100"
        )}>
            {/* Header (Clickable to Collapse) */}
            <div
                className="flex items-center p-4 cursor-pointer hover:bg-[#1A1A24] transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="text-[#A78BFA] mr-[10px]">
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>

                <div className="flex flex-col flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] font-bold text-[#A78BFA] tracking-tight">{plan.displayId || 'PLAN-XXX'}</span>
                        <span className="text-[14px] font-semibold text-[#E2E8F0]">{plan.name}</span>
                        <div className="bg-[#1E1E32] px-[6px] py-[2px] rounded border border-[#2A2A3A]/50 self-center">
                            <span className="text-[10px] text-[#9CA3AF] uppercase font-medium">{plan.testCases.length} case(s)</span>
                        </div>
                        {plan.isArchived && (
                            <div className="bg-[#2D2010] px-[6px] py-[2px] rounded border border-[#FBBF24]/20 self-center">
                                <span className="text-[9px] font-bold text-[#FBBF24] uppercase tracking-widest">ARCHIVED</span>
                            </div>
                        )}
                        {plan.isRegressionSuite && (
                            <div className="bg-[#10B981]/10 px-[6px] py-[2px] rounded border border-[#10B981]/20 self-center">
                                <span className="text-[9px] font-bold text-[#10B981] uppercase tracking-widest">REGRESSION</span>
                            </div>
                        )}
                    </div>
                    {/* Status summary */}
                    <div className="flex items-center mt-1">
                        {statusesRendered}
                    </div>
                </div>

                {/* Action buttons (Reference: runAllBtn, resetBtn, duplicateBtn, renameBtn, archiveBtn, deletePlanBtn) */}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A78BFA] hover:bg-[#A78BFA]/10"
                        onClick={() => onRunCases(plan)}
                        title="Run all test cases"
                    >
                        <PlayCircle className="h-[14px] w-[14px]" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A78BFA] hover:bg-[#A78BFA]/10"
                        onClick={() => resetTestPlanStatuses(activeProjectId, plan.id)}
                        title="Reset all statuses to Not Run"
                    >
                        {/* Reference glyph \uE72C is Refresh/Reset */}
                        <Plus className="h-[14px] w-[14px] rotate-45" /> {/* approximation of reset if Refresh icon missing */}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A78BFA] hover:bg-[#A78BFA]/10"
                        onClick={() => duplicateTestPlan(activeProjectId, plan.id)}
                        title="Duplicate plan for re-execution"
                    >
                        <Copy className="h-[14px] w-[14px]" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A78BFA] hover:bg-[#A78BFA]/10"
                        onClick={() => onEditPlan(plan)}
                        title="Rename plan"
                    >
                        <Edit2 className="h-[14px] w-[14px]" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A78BFA] hover:bg-[#A78BFA]/10"
                        onClick={() => archiveTestPlan(activeProjectId, plan.id, !plan.isArchived)}
                        title={plan.isArchived ? "Unarchive plan" : "Archive plan"}
                    >
                        <Archive className="h-[14px] w-[14px]" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#6B7280] hover:text-[#F87171] hover:bg-[#EF4444]/10"
                        onClick={() => deleteTestPlan(activeProjectId, plan.id)}
                        title="Delete plan"
                    >
                        <Trash2 className="h-[14px] w-[14px]" />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {!isCollapsed && (
                <div className="px-5 pb-4 pl-[42px] flex flex-col gap-2 bg-[#0F0F13]/50 border-t border-[#2A2A3A]">
                    <div className="h-3" />
                    {plan.testCases.map(tc => (
                        <TestCaseCard key={tc.id} testCase={tc} plan={plan} activeProjectId={activeProjectId} onRunCase={() => onRunCases(plan)} />
                    ))}
                    <div className="pt-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditCases(plan)}
                            className="h-8 text-[11px] font-bold text-[#A78BFA] hover:text-[#C4B5FD] hover:bg-transparent px-0 gap-1.5"
                        >
                            <Plus className="h-[14px] w-[14px]" /> ADD TEST CASE
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
