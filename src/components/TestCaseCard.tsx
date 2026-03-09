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
            case 'blocker': return 'bg-[#451A1F] text-[#FCA5A5]'
            case 'major': return 'bg-[#422006] text-[#FCD34D]'
            case 'medium': return 'bg-[#1E1E32] text-[#9CA3AF]'
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
            {/* Header Row: ID + Title + Run + Status + Delete */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                    <span className="font-mono text-[13px] font-semibold text-[#A78BFA]">{testCase.displayId}</span>
                    <span className="font-semibold text-[13px] text-[#E2E8F0] line-clamp-1 ml-1">{testCase.title}</span>
                </div>

                {/* Right Align Actions / Badges */}
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onRunCase}
                        className="bg-[#252535] text-[#34D399] border border-[#2A2A3A] hover:bg-[#2A2A3A] hover:text-[#10B981] h-7 text-[11px] font-bold px-3"
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
                        className="h-7 w-7 text-[#6B7280] hover:text-[#F87171] hover:bg-[#EF4444]/10"
                        onClick={() => deleteTestCase(activeProjectId, plan.id, testCase.id)}
                        title="Delete test case"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Traceability Label: TC-001 -> TP-001 */}
            <div className="font-mono text-[10px] text-[#6B7280]">
                {testCase.displayId} → {plan.displayId || 'PLAN'}
            </div>

            {/* Separator */}
            <div className="h-[1px] bg-[#2A2A3A] w-full my-1" />

            {/* Fields with uppercase labels and vertical indicators */}
            <div className="flex flex-col gap-4 mt-1">
                {testCase.preConditions && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#3B82F6]/50" /> PRE-CONDITIONS
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#9CA3AF] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={testCase.preConditions} compact />
                        </div>
                    </div>
                )}
                {testCase.steps && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#10B981]/50" /> TEST STEPS
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#9CA3AF] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={testCase.steps} compact />
                        </div>
                    </div>
                )}
                {testCase.testData && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#F59E0B]/50" /> TEST DATA
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#9CA3AF] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30 italic opacity-80">
                            <FormattedText content={testCase.testData} compact />
                        </div>
                    </div>
                )}
                {testCase.expectedResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#A78BFA]/50" /> EXPECTED RESULT
                        </div>
                        <div className="text-[11px] leading-relaxed text-[#D1D5DB] bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={testCase.expectedResult} compact />
                        </div>
                    </div>
                )}
                {testCase.actualResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#34D399] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-[#34D399]" /> ACTUAL RESULT
                        </div>
                        <div className="text-[11px] text-[#E2E8F0] bg-[#13131A] p-3 rounded-lg border border-[#34D399]/20 leading-relaxed">
                            <FormattedText content={testCase.actualResult} compact />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer: source badge + timestamp | Bug Report button */}
            <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-[#1E1E32] px-2 py-0.5 rounded text-[10px] font-bold text-[#A78BFA] uppercase tracking-wider border border-[#2A2A3A]/50">
                        {testCase.sapModule || plan.source || 'Manual'}
                    </div>
                    <div className="text-[10px] text-[#6B7280]">
                        {new Date(testCase.updatedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 bg-[#14281C] text-[#34D399] border-[#1E3C28] hover:bg-[#1E3C28] hover:text-[#10B981] font-bold text-[11px] gap-1.5 px-3"
                    title="Generate a structured bug report from this test case"
                >
                    <Bug className="h-3 w-3" /> Bug Report
                </Button>
            </div>
        </div>
    )
}
