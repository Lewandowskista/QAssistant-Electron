import { useState } from "react"
import { useProjectStore, TestRunSession, TestCaseStatus } from "@/store/useProjectStore"
import {
    ChevronDown,
    ChevronRight,
    Archive,
    Trash2,
    Copy,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import TestCaseExecutionCard from "./TestCaseExecutionCard"

interface TestRunSessionCardProps {
    session: TestRunSession
    activeProjectId: string
}

export default function TestRunSessionCard({ session, activeProjectId }: TestRunSessionCardProps) {
    const { archiveTestRunSession, deleteTestRunSession } = useProjectStore()
    const [isCollapsed, setIsCollapsed] = useState(false)

    // Calculate Summary across all plans in session
    const statusCounts = (session.planExecutions || []).flatMap(p => p.caseExecutions || []).reduce((acc, c) => {
        if (c && c.result) {
            acc[c.result] = (acc[c.result] || 0) + 1
        }
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
        <div key={status} className="flex items-center gap-1.5 px-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[status as TestCaseStatus] }} />
            <span className="text-[10px] text-[#9CA3AF] capitalize">{count} {status}</span>
        </div>
    ))

    const totalCases = (session.planExecutions || []).reduce((acc, p) => acc + (p.caseExecutions?.length || 0), 0)

    return (
        <div className={cn(
            "bg-[#13131A] border border-[#2A2A3A] rounded-xl overflow-hidden transition-opacity shadow-sm",
            session.isArchived ? "opacity-60" : "opacity-100"
        )}>
            {/* Header (Clickable to Collapse) */}
            <div
                className="flex items-center p-4 cursor-pointer hover:bg-[#1A1A24] transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="text-[#38BDF8] mr-[10px]">
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>

                <div className="flex flex-col flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] font-bold text-[#38BDF8] tracking-tight">EXEC-{new Date(session.timestamp).getTime().toString().slice(-4)}</span>
                        <span className="text-[14px] font-semibold text-[#E2E8F0]">{session.planExecutions?.length === 1 ? session.planExecutions[0].snapshotTestPlanName : 'Multi-Plan Execution Session'}</span>
                        <div className="bg-[#1E1E32] px-[6px] py-[2px] rounded border border-[#2A2A3A]/50 self-center">
                            <span className="text-[10px] text-[#9CA3AF] uppercase font-medium">{totalCases} execution(s)</span>
                        </div>
                        {session.isArchived && (
                            <div className="bg-[#2D2010] px-[6px] py-[2px] rounded border border-[#FBBF24]/20 self-center">
                                <span className="text-[9px] font-bold text-[#FBBF24] uppercase tracking-widest">ARCHIVED</span>
                            </div>
                        )}
                    </div>
                    {/* Status summary */}
                    <div className="flex items-center mt-1">
                        {statusesRendered}
                    </div>
                </div>

                {/* Right Align Actions */}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <div className="text-[11px] text-[#6B7280] mr-2">
                        {new Date(session.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]" title="Duplicate session">
                        <Copy className="h-[14px] w-[14px]" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#E2E8F0]" onClick={() => archiveTestRunSession(activeProjectId, session.id, !session.isArchived)} title={session.isArchived ? "Unarchive session" : "Archive session"}>
                        <Archive className="h-[14px] w-[14px]" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#F87171] hover:bg-[#EF4444]/10" onClick={() => deleteTestRunSession(activeProjectId, session.id)} title="Delete session">
                        <Trash2 className="h-[14px] w-[14px]" />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {!isCollapsed && (
                <div className="px-5 pb-4 pl-[42px] flex flex-col gap-4 bg-[#0F0F13]/50 border-t border-[#2A2A3A]">
                    <div className="h-2" />
                    {(session.planExecutions || []).map(planEx => (
                        <div key={planEx.id} className="flex flex-col gap-2">
                            <div className="text-[12px] font-bold text-[#38BDF8] mb-1 pl-1 border-b border-[#2A2A3A] pb-2 uppercase tracking-wider">
                                {planEx.snapshotTestPlanName}
                            </div>
                            <div className="flex flex-col gap-2">
                                {(planEx.caseExecutions || []).map(tc => (
                                    <TestCaseExecutionCard
                                        key={tc.id}
                                        caseExecution={tc}
                                        planName={planEx.snapshotTestPlanName}
                                        activeProjectId={activeProjectId}
                                        sessionId={session.id}
                                        planExecutionId={planEx.id}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
