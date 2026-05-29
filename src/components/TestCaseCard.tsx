import { useProjectStore } from "@/store/useProjectStore"
import { TestPlan, TestCase } from "@/types/project"
import {
    Trash2,
    Bug,
    Tag,
    User,
    Clock,
    LayoutGrid,
    ArrowRightCircle,
    Database,
    Sparkles,
    ThumbsUp,
    X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import FormattedText from "./FormattedText"

interface TestCaseCardProps {
    plan: TestPlan
    testCase: TestCase
    activeProjectId: string
    onRunCase: () => void
    isSelected?: boolean
    onSelect?: (selected: boolean) => void
}

export default function TestCaseCard({ plan, testCase, activeProjectId, onRunCase, isSelected, onSelect }: TestCaseCardProps) {
    const { deleteTestCase, updateTestCase } = useProjectStore()

    const handleRateAiCase = (rating: 'useful' | 'caught_bug' | 'irrelevant') => {
        updateTestCase(activeProjectId, plan.id, testCase.id, {
            aiGenerationRating: rating,
            aiGenerationRatedAt: Date.now(),
        })
    }

    const AI_RATING_CONFIG = {
        useful: { label: 'Useful', color: 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/30' },
        caught_bug: { label: 'Caught Bug', color: 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30' },
        irrelevant: { label: 'Irrelevant', color: 'bg-[#4B5563]/20 text-soft border-[#4B5563]/30' },
    }

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'blocker': return 'bg-[#451A1F] text-[#FCA5A5]'
            case 'major': return 'bg-[#422006] text-[#FCD34D]'
            case 'medium': return 'bg-[#1E1E32] text-soft'
            case 'low': return 'bg-[#064E3B] text-[#6EE7B7]'
            default: return 'bg-[#1F2937] text-soft'
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'passed': return 'bg-[#064E3B] text-[#10B981]'
            case 'failed': return 'bg-[#451A1F] text-[#EF4444]'
            case 'blocked': return 'bg-[#422006] text-[#F59E0B]'
            case 'skipped': return 'bg-[#1F2937] text-soft'
            case 'not-run':
            default: return 'bg-[#1F2937] text-soft'
        }
    }

    const getTestTypeColor = (testType?: string) => {
        switch (testType?.toLowerCase()) {
            case 'functional': return 'bg-[#1E3A5F] text-[#3B82F6]'
            case 'regression': return 'bg-[#3F1F1F] text-[#DC2626]'
            case 'smoke': return 'bg-[#2F2D1F] text-[#F59E0B]'
            case 'integration': return 'bg-[#1F2D3D] text-[#0EA5E9]'
            case 'e2e': return 'bg-[#2D1F3D] text-brand'
            case 'api': return 'bg-[#1F3D2D] text-[#06B6D4]'
            case 'performance': return 'bg-[#3D2D1F] text-[#EA580C]'
            case 'accessibility': return 'bg-[#2D3D1F] text-[#84CC16]'
            case 'security': return 'bg-[#3D1F2D] text-[#EC4899]'
            default: return 'bg-[#1F2937] text-soft'
        }
    }

    return (
        <div className={cn(
            "bg-panel-muted border rounded-[10px] p-4 flex flex-col gap-3 transition-all",
            isSelected ? "border-[#A78BFA] shadow-[0_0_15px_rgba(167,139,250,0.1)]" : "border-ui hover:border-[#3A3A4A]"
        )}>
            {/* Header Row: Bulk Select + ID + Title + Actions */}
            <div className="flex items-center gap-3">
                <Checkbox 
                    checked={isSelected} 
                    onCheckedChange={(checked) => onSelect?.(!!checked)}
                    className="border-ui data-[state=checked]:bg-[#A78BFA] data-[state=checked]:border-[#A78BFA]"
                />

                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-mono text-[13px] font-semibold text-brand">{testCase.displayId}</span>
                    <span className="font-semibold text-[13px] text-foreground line-clamp-1 ml-1 cursor-default" title={testCase.title}>{testCase.title}</span>
                    {testCase.aiGenerated && (
                        <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold bg-[#A78BFA]/10 text-brand border border-[#A78BFA]/20 px-1.5 py-0.5 rounded-full" title="AI-generated test case">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onRunCase}
                        className="bg-elevated text-[#34D399] border border-ui hover:bg-elevated hover:text-[#10B981] h-7 text-[11px] font-bold px-3 transition-all"
                    >
                        Execute
                    </Button>
                    <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", getPriorityColor(testCase.priority))}>
                        {testCase.priority || 'MEDIUM'}
                    </div>
                    {testCase.testType && (
                        <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", getTestTypeColor(testCase.testType))}>
                            {testCase.testType}
                        </div>
                    )}
                    <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", getStatusColor(testCase.status))}>
                        {testCase.status || 'not-run'}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-ui hover:text-[#F87171] hover:bg-[#EF4444]/10 transition-colors"
                        onClick={() => deleteTestCase(activeProjectId, plan.id, testCase.id)}
                        title="Delete test case"
                        aria-label={`Delete test case ${testCase.displayId}`}
                    >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {/* Sub-header: Traceability + Tags */}
            <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-[10px] text-muted-ui flex items-center gap-1.5 font-bold">
                    <LayoutGrid className="h-3 w-3" /> {testCase.displayId} <ArrowRightCircle className="h-3 w-3" /> {plan.displayId || 'PLAN'}
                </div>

                {testCase.tags && testCase.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                        {testCase.tags.map(tag => (
                            <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#A78BFA]/5 border border-[#A78BFA]/10 text-brand text-[9px] font-black uppercase tracking-widest leading-none">
                                <Tag className="h-2 w-2" /> {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Separator */}
            <div className="h-[1px] bg-elevated w-full my-1" />

            {/* Fields with uppercase labels and vertical indicators */}
            <div className="flex flex-col gap-4 mt-1">
                {testCase.preConditions && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#3B82F6]/50" /> PRE-CONDITIONS
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={testCase.preConditions} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.steps && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#10B981]/50" /> TEST STEPS
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={testCase.steps} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.testData && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#F59E0B]/50" /> TEST DATA
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30 italic opacity-80">
                            <FormattedText content={testCase.testData} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.expectedResult && (
                    <div>
                        <div className="text-[10px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-[#A78BFA]/50" /> EXPECTED RESULT
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-[#13131A]/30 p-2.5 rounded-lg border border-[#2A2A3A]/30">
                            <FormattedText content={testCase.expectedResult} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.actualResult && (
                    <div>
                        <div className="text-[10px] font-bold text-[#34D399] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-[#34D399]" /> ACTUAL RESULT
                        </div>
                        <div className="text-[11px] text-foreground bg-panel p-3 rounded-lg border border-[#34D399]/20 leading-relaxed">
                            <FormattedText content={testCase.actualResult} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer: source badge + timestamp | Bug Report button */}
            <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-[#1E1E32] px-2 py-0.5 rounded text-[10px] font-bold text-brand uppercase tracking-wider border border-[#2A2A3A]/50">
                        {testCase.sapModule || plan.source || 'Manual'}
                    </div>
                    <div className="text-[10px] text-muted-ui">
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
                {/* Execution Details / Assigned Footer */}
                <div className="flex items-center gap-4 mt-2 pt-3 border-t border-[#2A2A3A]/50">
                    {testCase.sapModule && (
                         <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-ui">
                            <Database className="h-3 w-3 text-[#3B82F6]" />
                            <span className="uppercase tracking-wide">{testCase.sapModule}</span>
                        </div>
                    )}
                    {testCase.assignedTo && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-ui">
                            <User className="h-3 w-3 text-brand" />
                            <span className="uppercase tracking-wide">{testCase.assignedTo}</span>
                        </div>
                    )}
                    {testCase.estimatedMinutes && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-ui">
                            <Clock className="h-3 w-3 text-[#F59E0B]" />
                            <span className="uppercase tracking-wide">{testCase.estimatedMinutes}m</span>
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-1 text-[10px] font-black text-[#6B7280]/40 italic uppercase pb-1">
                        Last modified: {new Date(testCase.updatedAt).toLocaleDateString()}
                    </div>
                </div>

                {/* AI Generation Rating */}
                {testCase.aiGenerated && (
                    <div className="border-t border-ui pt-2 flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-brand shrink-0" />
                        <span className="text-[10px] text-muted-ui">AI generated</span>
                        {testCase.aiGenerationRating ? (
                            <span className={cn("text-[10px] font-bold border px-2 py-0.5 rounded-full ml-1", AI_RATING_CONFIG[testCase.aiGenerationRating].color)}>
                                {AI_RATING_CONFIG[testCase.aiGenerationRating].label}
                            </span>
                        ) : (
                            <div className="ml-auto flex items-center gap-1">
                                <span className="text-[10px] text-muted-ui">Rate this test:</span>
                                <button
                                    onClick={() => handleRateAiCase('useful')}
                                    className="text-[10px] px-2 py-0.5 rounded-full border border-ui text-soft hover:border-[#10B981]/50 hover:text-[#10B981] transition-colors"
                                    title="This test was useful"
                                >
                                    <ThumbsUp className="h-3 w-3 inline mr-1" />Useful
                                </button>
                                <button
                                    onClick={() => handleRateAiCase('caught_bug')}
                                    className="text-[10px] px-2 py-0.5 rounded-full border border-ui text-soft hover:border-[#F59E0B]/50 hover:text-[#F59E0B] transition-colors"
                                    title="This test caught a bug"
                                >
                                    <Bug className="h-3 w-3 inline mr-1" />Caught Bug
                                </button>
                                <button
                                    onClick={() => handleRateAiCase('irrelevant')}
                                    className="text-[10px] px-2 py-0.5 rounded-full border border-ui text-soft hover:border-[#4B5563]/80 transition-colors"
                                    title="This test was irrelevant"
                                >
                                    <X className="h-3 w-3 inline mr-1" />Irrelevant
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
