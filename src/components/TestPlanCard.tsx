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
    const { archiveTestPlan, deleteTestPlan } = useProjectStore()
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

    const statusesRendered = Object.entries(statusCounts).map(([status, count]) => (
        <div key={status} className="flex items-center gap-1.5 bg-[#1E1E32]/50 px-2 py-0.5 rounded-full border border-[#2A2A3A]/50">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[status as TestCaseStatus] }} />
            <span className="text-[10px] font-bold text-[#9CA3AF] capitalize">{count} {status}</span>
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
                <div className="text-[#A78BFA] mr-3">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>

                <div className="flex items-center gap-2 flex-1">
                    <span className="font-mono text-[13px] font-bold text-[#A78BFA] tracking-tight">{plan.displayId || 'PLAN-XXX'}</span>
                    <span className="text-sm font-semibold text-[#E2E8F0] ml-1">{plan.name}</span>
                    <div className="bg-[#1E1E32] px-2 py-0.5 rounded ml-1 border border-[#2A2A3A]/50">
                        <span className="text-[10px] font-bold text-[#9CA3AF]">{plan.testCases.length} case(s)</span>
                    </div>
                    {plan.isArchived && (
                        <div className="bg-[#FBBF24]/10 border border-[#FBBF24]/20 px-2 py-0.5 rounded ml-2">
                            <span className="text-[9px] font-bold text-[#FBBF24] uppercase tracking-[0.2em]">Archived</span>
                        </div>
                    )}
                    {plan.isRegressionSuite && (
                        <div className="bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 rounded ml-2">
                            <span className="text-[9px] font-bold text-[#10B981] uppercase tracking-[0.2em]">Regression</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 ml-4">
                        {statusesRendered}
                    </div>
                </div>

                {/* Right Align Actions */}
                <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[#10B981] hover:bg-[#10B981]/10 hover:text-[#10B981]" onClick={() => onRunCases(plan)} title="Run all test cases">
                        <PlayCircle className="h-4 w-4" />
                    </Button>
                    {/* Placeholder for Duplicate button */}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[#6B7280] hover:text-[#E2E8F0]" title="Duplicate plan (TBD)">
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[#6B7280] hover:text-[#E2E8F0]" onClick={() => onEditPlan(plan)} title="Rename / Edit plan">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[#6B7280] hover:text-[#E2E8F0]" onClick={() => archiveTestPlan(activeProjectId, plan.id, !plan.isArchived)} title={plan.isArchived ? "Unarchive plan" : "Archive plan"}>
                        <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10" onClick={() => deleteTestPlan(activeProjectId, plan.id)} title="Delete plan">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {!isCollapsed && (
                <div className="px-5 pb-4 pl-[42px] flex flex-col gap-2 bg-[#0F0F13]/50 border-t border-[#2A2A3A]">
                    <div className="h-2" /> {/* Spacing */}
                    {plan.testCases.map(tc => (
                        <TestCaseCard key={tc.id} testCase={tc} plan={plan} activeProjectId={activeProjectId} onRunCase={() => onRunCases(plan)} />
                    ))}
                    <div className="pt-2">
                        <Button variant="ghost" size="sm" onClick={() => onEditCases(plan)} className="h-8 text-[11px] font-bold text-[#A78BFA] hover:text-[#C4B5FD] hover:bg-transparent px-0 gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> ADD TEST CASE
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
