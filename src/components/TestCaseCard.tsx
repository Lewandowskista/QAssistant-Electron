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
        useful: { label: 'Useful', color: 'bg-state-success/20 text-state-success border-state-success-border' },
        caught_bug: { label: 'Caught Bug', color: 'bg-state-warning/20 text-state-warning border-state-warning-border' },
        irrelevant: { label: 'Irrelevant', color: 'bg-line-strong/20 text-soft border-line-strong/30' },
    }

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'blocker': return 'bg-state-danger-soft text-state-danger'
            case 'major': return 'bg-state-warning-soft text-state-warning'
            case 'medium': return 'bg-panel-muted text-soft'
            case 'low': return 'bg-state-success-soft text-state-success'
            default: return 'bg-elevated text-soft'
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'passed': return 'bg-state-success-soft text-state-success'
            case 'failed': return 'bg-state-danger-soft text-state-danger'
            case 'blocked': return 'bg-state-warning-soft text-state-warning'
            case 'skipped': return 'bg-elevated text-soft'
            case 'not-run':
            default: return 'bg-elevated text-soft'
        }
    }

    const getTestTypeColor = (testType?: string) => {
        switch (testType?.toLowerCase()) {
            case 'functional': return 'bg-state-info-soft text-state-info'
            case 'regression': return 'bg-state-danger-soft text-state-danger'
            case 'smoke': return 'bg-state-warning-soft text-state-warning'
            case 'integration': return 'bg-state-info-soft text-state-info'
            case 'e2e': return 'bg-qa-accent/10 text-brand'
            case 'api': return 'bg-state-success-soft text-state-info'
            case 'performance': return 'bg-state-warning-soft text-state-warning'
            case 'accessibility': return 'bg-state-success-soft text-state-success'
            case 'security': return 'bg-state-danger-soft text-qa-accent'
            default: return 'bg-elevated text-soft'
        }
    }

    return (
        <div className={cn(
            "bg-panel-muted border rounded-[10px] p-4 flex flex-col gap-3 transition-all",
            isSelected ? "border-qa-accent shadow-[0_0_15px_rgba(167,139,250,0.1)]" : "border-ui hover:border-ui-strong"
        )}>
            {/* Header Row: Bulk Select + ID + Title + Actions */}
            <div className="flex items-center gap-3">
                <Checkbox 
                    checked={isSelected} 
                    onCheckedChange={(checked) => onSelect?.(!!checked)}
                    className="border-ui data-[state=checked]:bg-qa-accent data-[state=checked]:border-qa-accent"
                />

                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-mono text-[13px] font-semibold text-brand">{testCase.displayId}</span>
                    <span className="font-semibold text-[13px] text-foreground line-clamp-1 ml-1 cursor-default" title={testCase.title}>{testCase.title}</span>
                    {testCase.aiGenerated && (
                        <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold bg-qa-accent/10 text-brand border border-qa-accent/20 px-1.5 py-0.5 rounded-full" title="AI-generated test case">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onRunCase}
                        className="bg-elevated text-state-success border border-ui hover:bg-elevated hover:text-state-success h-7 text-[11px] font-bold px-3 transition-all"
                    >
                        Execute
                    </Button>
                    <div className={cn("px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider", getPriorityColor(testCase.priority))}>
                        {testCase.priority || 'MEDIUM'}
                    </div>
                    {testCase.testType && (
                        <div className={cn("px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider", getTestTypeColor(testCase.testType))}>
                            {testCase.testType}
                        </div>
                    )}
                    <div className={cn("px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider", getStatusColor(testCase.status))}>
                        {testCase.status || 'not-run'}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-ui hover:text-state-danger hover:bg-state-danger-soft transition-colors"
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
                <div className="font-mono text-[11px] text-muted-ui flex items-center gap-1.5 font-bold">
                    <LayoutGrid className="h-3 w-3" /> {testCase.displayId} <ArrowRightCircle className="h-3 w-3" /> {plan.displayId || 'PLAN'}
                </div>

                {testCase.tags && testCase.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                        {testCase.tags.map(tag => (
                            <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-qa-accent/5 border border-qa-accent/10 text-brand text-[11px] font-black uppercase tracking-widest leading-none">
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
                        <div className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-state-info/50" /> PRE-CONDITIONS
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30">
                            <FormattedText content={testCase.preConditions} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.steps && (
                    <div>
                        <div className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-state-success/50" /> TEST STEPS
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30">
                            <FormattedText content={testCase.steps} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.testData && (
                    <div>
                        <div className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-state-warning/50" /> TEST DATA
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30 italic opacity-80">
                            <FormattedText content={testCase.testData} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.expectedResult && (
                    <div>
                        <div className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1.5 opacity-80">
                            <div className="w-1 h-3 rounded-full bg-qa-accent/50" /> EXPECTED RESULT
                        </div>
                        <div className="text-[11px] leading-relaxed text-soft bg-surface/30 p-2.5 rounded-lg border border-line/30">
                            <FormattedText content={testCase.expectedResult} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
                {testCase.actualResult && (
                    <div>
                        <div className="text-[11px] font-bold text-state-success uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <div className="w-1 h-3 rounded-full bg-state-success" /> ACTUAL RESULT
                        </div>
                        <div className="text-[11px] text-foreground bg-panel p-3 rounded-lg border border-state-success-border leading-relaxed">
                            <FormattedText content={testCase.actualResult} compact projectId={activeProjectId} source={plan.source} />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer: source badge + timestamp | Bug Report button */}
            <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-panel-muted px-2 py-0.5 rounded text-[11px] font-bold text-brand uppercase tracking-wider border border-line/50">
                        {testCase.sapModule || plan.source || 'Manual'}
                    </div>
                    <div className="text-[11px] text-muted-ui">
                        {new Date(testCase.updatedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 bg-state-success-soft text-state-success border-state-success-border hover:bg-state-success-soft hover:text-state-success font-bold text-[11px] gap-1.5 px-3"
                    title="Generate a structured bug report from this test case"
                >
                    <Bug className="h-3 w-3" /> Bug Report
                </Button>
                {/* Execution Details / Assigned Footer */}
                <div className="flex items-center gap-4 mt-2 pt-3 border-t border-line/50">
                    {testCase.sapModule && (
                         <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-ui">
                            <Database className="h-3 w-3 text-state-info" />
                            <span className="uppercase tracking-wide">{testCase.sapModule}</span>
                        </div>
                    )}
                    {testCase.assignedTo && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-ui">
                            <User className="h-3 w-3 text-brand" />
                            <span className="uppercase tracking-wide">{testCase.assignedTo}</span>
                        </div>
                    )}
                    {testCase.estimatedMinutes && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-ui">
                            <Clock className="h-3 w-3 text-state-warning" />
                            <span className="uppercase tracking-wide">{testCase.estimatedMinutes}m</span>
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-1 text-[11px] font-black text-text-muted/40 italic uppercase pb-1">
                        Last modified: {new Date(testCase.updatedAt).toLocaleDateString()}
                    </div>
                </div>

                {/* AI Generation Rating */}
                {testCase.aiGenerated && (
                    <div className="border-t border-ui pt-2 flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-brand shrink-0" />
                        <span className="text-[11px] text-muted-ui">AI generated</span>
                        {testCase.aiGenerationRating ? (
                            <span className={cn("text-[11px] font-bold border px-2 py-0.5 rounded-full ml-1", AI_RATING_CONFIG[testCase.aiGenerationRating].color)}>
                                {AI_RATING_CONFIG[testCase.aiGenerationRating].label}
                            </span>
                        ) : (
                            <div className="ml-auto flex items-center gap-1">
                                <span className="text-[11px] text-muted-ui">Rate this test:</span>
                                <button
                                    onClick={() => handleRateAiCase('useful')}
                                    className="text-[11px] px-2 py-0.5 rounded-full border border-ui text-soft hover:border-state-success/50 hover:text-state-success transition-colors"
                                    title="This test was useful"
                                >
                                    <ThumbsUp className="h-3 w-3 inline mr-1" />Useful
                                </button>
                                <button
                                    onClick={() => handleRateAiCase('caught_bug')}
                                    className="text-[11px] px-2 py-0.5 rounded-full border border-ui text-soft hover:border-state-warning/50 hover:text-state-warning transition-colors"
                                    title="This test caught a bug"
                                >
                                    <Bug className="h-3 w-3 inline mr-1" />Caught Bug
                                </button>
                                <button
                                    onClick={() => handleRateAiCase('irrelevant')}
                                    className="text-[11px] px-2 py-0.5 rounded-full border border-ui text-soft hover:border-line-strong/80 transition-colors"
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
