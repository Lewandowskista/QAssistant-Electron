import { TestCaseExecution, useProjectStore } from "@/store/useProjectStore"
import {
    Trash2,
    Bug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import FormattedText from "./FormattedText"

interface TestCaseExecutionCardProps {
    planName: string
    caseExecution: TestCaseExecution
    activeProjectId: string
    sessionId: string
    planExecutionId: string
}

export default function TestCaseExecutionCard({ planName, caseExecution, activeProjectId, sessionId, planExecutionId }: TestCaseExecutionCardProps) {
    const { deleteTestCaseExecution } = useProjectStore()

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'passed': return 'bg-[#064E3B] text-[#10B981]'
            case 'failed': return 'bg-[#451A1F] text-[#EF4444]'
            case 'blocked': return 'bg-[#422006] text-[#F59E0B]'
            case 'skipped': return 'bg-[#1F2937] text-[#9CA3AF]'
            case 'not-run':
            default: return 'bg-[#1F2937] text-[#9CA3AF]'
        }
    }



    return (
        <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-[10px] p-4 flex flex-col gap-3">
            {/* Header Row */}
            <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-[#E2E8F0] line-clamp-1 flex-1 ml-1">{caseExecution.snapshotTestCaseTitle}</span>

                {/* Right Align Actions / Badges */}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <div className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${getStatusColor(caseExecution.result)}`}>
                        {caseExecution.result || 'not-run'}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10 ml-0.5"
                        onClick={() => deleteTestCaseExecution(activeProjectId, sessionId, planExecutionId, caseExecution.id)}
                        title="Delete test case execution"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Traceability Label */}
            <div className="font-mono text-[10px] text-[#6B7280]">
                {caseExecution.snapshotTestCaseTitle} → {planName}
            </div>

            {/* Separator */}
            <div className="h-[1px] bg-[#2A2A3A] w-full my-1" />

            {/* Snapshot Fields (Same as Generation Tab) */}
            <div className="flex flex-col gap-4 mt-1">
                {caseExecution.snapshotPreConditions && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#3B82F6]/50" /> PRE-CONDITIONS
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#9CA3AF] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={caseExecution.snapshotPreConditions} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}

                {caseExecution.snapshotSteps && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#10B981]/50" /> TEST STEPS
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#9CA3AF] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={caseExecution.snapshotSteps} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}

                {caseExecution.snapshotTestData && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#F59E0B]/50" /> TEST DATA
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#9CA3AF] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30 italic opacity-80">
                            <FormattedText content={caseExecution.snapshotTestData} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}

                {caseExecution.snapshotExpectedResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#A78BFA]/50" /> EXPECTED RESULT
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#D1D5DB] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={caseExecution.snapshotExpectedResult} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}
            </div>

            {/* Separator */}
            <div className="h-[1px] bg-[#2A2A3A] w-full my-1" />

            {/* Execution Fields (Dynamic) */}
            <div className="flex flex-col gap-3">
                {caseExecution.actualResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#34D399] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-[#34D399]" /> ACTUAL RESULT
                        </div>
                        <div className="text-[11px] text-[#E2E8F0] bg-[#13131A] p-3 rounded-lg border border-[#34D399]/20 leading-relaxed">
                            <FormattedText content={caseExecution.actualResult} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}
                {caseExecution.notes && (
                    <div>
                        <div className="text-[10px] font-bold text-[#A78BFA] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-[#A78BFA]" /> EXECUTION NOTES
                        </div>
                        <div className="text-[11px] text-[#E2E8F0] bg-[#13131A] p-3 rounded-lg border border-[#A78BFA]/20 italic opacity-90">
                            <FormattedText content={caseExecution.notes} compact projectId={activeProjectId} />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-[#1E1E32] px-2 py-0.5 rounded text-[10px] font-bold text-[#A78BFA] uppercase tracking-wider border border-[#2A2A3A]/50">
                        Execution
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 bg-[#14281C] text-[#34D399] border-[#1E3C28] hover:bg-[#1E3C28] hover:text-[#10B981] font-bold text-[11px] gap-1.5 px-3"
                    title="Generate a structured bug report from this execution (TBD)"
                >
                    <Bug className="h-3 w-3" /> Bug Report
                </Button>
            </div>
        </div>
    )
}
