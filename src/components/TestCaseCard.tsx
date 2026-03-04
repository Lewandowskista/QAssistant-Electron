import { useProjectStore, TestPlan, TestCase } from "@/store/useProjectStore"
import {
    Trash2,
    Bug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import FormattedText from "./FormattedText"

interface TestCaseCardProps {
    plan: TestPlan
    testCase: TestCase
    activeProjectId: string
    onRunCase: () => void
}

export default function TestCaseCard({ plan, testCase, activeProjectId, onRunCase }: TestCaseCardProps) {
    const { deleteTestCase } = useProjectStore()

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'high': return 'bg-[#451A1F] text-[#FCA5A5]'
            case 'medium': return 'bg-[#422006] text-[#FCD34D]'
            case 'low': return 'bg-[#064E3B] text-[#6EE7B7]'
            default: return 'bg-[#1F2937] text-[#D1D5DB]'
        }
    }

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
                <span className="font-mono text-[13px] font-semibold text-[#A78BFA]">{testCase.displayId}</span>
                <span className="font-semibold text-[13px] text-[#E2E8F0] line-clamp-1 flex-1 ml-1">{testCase.title}</span>

                {/* Right Align Actions / Badges */}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onRunCase}
                        className="bg-[#252535] text-[#34D399] border border-[#2A2A3A] hover:bg-[#2A2A3A] hover:text-[#10B981] h-7 text-[11px] font-bold px-3 mr-1"
                    >
                        Execute
                    </Button>
                    <div className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${getPriorityColor(testCase.priority)}`}>
                        {testCase.priority || 'MEDIUM'}
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${getStatusColor(testCase.status)}`}>
                        {testCase.status || 'not-run'}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10 ml-0.5"
                        onClick={() => deleteTestCase(activeProjectId, plan.id, testCase.id)}
                        title="Delete test case"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Traceability Label */}
            <div className="font-mono text-[10px] text-[#6B7280]">
                {testCase.displayId} → {plan.displayId || 'PLAN'}
            </div>

            {/* Separator */}
            <div className="h-[1px] bg-[#2A2A3A] w-full my-1" />

            {/* Fields */}
            <div className="flex flex-col gap-3">
                {testCase.preConditions && (
                    <div>
                        <div className="text-[10px] font-bold text-[#A78BFA]/70 uppercase tracking-wider mb-1">Pre-conditions</div>
                        <div className="text-xs text-[#E2E8F0] bg-[#13131A]/50 p-2 rounded whitespace-pre-wrap"><FormattedText content={testCase.preConditions} /></div>
                    </div>
                )}
                {testCase.steps && (
                    <div>
                        <div className="text-[10px] font-bold text-[#A78BFA]/70 uppercase tracking-wider mb-1">Test Steps</div>
                        <div className="text-xs text-[#E2E8F0] bg-[#13131A]/50 p-2 rounded whitespace-pre-wrap leading-relaxed"><FormattedText content={testCase.steps} /></div>
                    </div>
                )}
                {testCase.testData && (
                    <div>
                        <div className="text-[10px] font-bold text-[#A78BFA]/70 uppercase tracking-wider mb-1">Test Data</div>
                        <div className="text-xs text-[#E2E8F0] bg-[#13131A]/50 p-2 rounded whitespace-pre-wrap italic opacity-80"><FormattedText content={testCase.testData} /></div>
                    </div>
                )}
                {testCase.expectedResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#A78BFA]/70 uppercase tracking-wider mb-1">Expected Result</div>
                        <div className="text-xs text-[#10B981] bg-[#10B981]/5 border border-[#10B981]/20 p-2 rounded font-semibold whitespace-pre-wrap"><FormattedText content={testCase.expectedResult} /></div>
                    </div>
                )}
                {testCase.actualResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#A78BFA]/70 uppercase tracking-wider mb-1">Actual Result</div>
                        <div className="text-xs text-[#E2E8F0] bg-[#13131A]/50 p-2 rounded whitespace-pre-wrap"><FormattedText content={testCase.actualResult} /></div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-[#1E1E32] px-2 py-0.5 rounded text-[10px] font-bold text-[#A78BFA] uppercase tracking-wider border border-[#2A2A3A]/50">
                        {plan.source || 'Manual'}
                    </div>
                    <div className="text-[10px] text-[#6B7280]">
                        {new Date(testCase.updatedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 bg-[#14281C] text-[#34D399] border-[#1E3C28] hover:bg-[#1E3C28] hover:text-[#10B981] font-bold text-[11px] gap-1.5 px-3"
                    title="Generate a structured bug report from this test case (TBD)"
                >
                    <Bug className="h-3 w-3" /> Bug Report
                </Button>
            </div>
        </div>
    )
}
