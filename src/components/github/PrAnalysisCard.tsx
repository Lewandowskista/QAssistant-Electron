import { AiPullRequestAnalysisResult } from '@/types/ai'
import { TestCase } from '@/types/project'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

type PrAnalysisCardProps = {
    analysis: AiPullRequestAnalysisResult | null
    isAnalyzing: boolean
    onAnalyze: () => void
    projectTestCases: TestCase[]
    selectedImpactedIds: Set<string>
    onToggleImpactedId: (id: string) => void
    onBuildRegressionSuite: () => void
    isBuildingRegressionSuite: boolean
}

function riskPillClass(riskLevel: AiPullRequestAnalysisResult['riskLevel']) {
    switch (riskLevel) {
        case 'critical':
            return 'bg-state-danger-soft text-state-danger border border-state-danger-border'
        case 'high':
            return 'bg-state-warning-soft text-state-warning border border-state-warning-border'
        case 'low':
            return 'bg-state-success-soft text-state-success border border-state-success-border'
        default:
            return 'bg-state-info-soft text-state-info border border-state-info-border'
    }
}

export function PrAnalysisCard({
    analysis,
    isAnalyzing,
    onAnalyze,
    projectTestCases,
    selectedImpactedIds,
    onToggleImpactedId,
    onBuildRegressionSuite,
    isBuildingRegressionSuite,
}: PrAnalysisCardProps) {
    const impactedCases = analysis
        ? projectTestCases.filter((testCase) => analysis.impactedCaseIds.includes(testCase.id))
        : []

    return (
        <div className="rounded-xl border border-ui bg-app overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-ui">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-brand" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">PR Analysis</span>
                    {analysis && analysis.impactedCaseIds.length > 0 && (
                        <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-qa-accent/10 text-brand">
                            {analysis.impactedCaseIds.length} impacted
                        </span>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
                    className="h-7 text-[11px] font-bold text-brand hover:bg-qa-accent/10 gap-1"
                >
                    {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {isAnalyzing ? 'Analyzing…' : 'Analyze PR'}
                </Button>
            </div>

            {analysis && (
                <div className="p-3 space-y-3">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">Summary</span>
                            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold uppercase', riskPillClass(analysis.riskLevel))}>
                                {analysis.riskLevel} risk
                            </span>
                        </div>
                        <p className="text-[11px] text-foreground leading-relaxed">{analysis.summary}</p>
                        {analysis.rationale && (
                            <p className="text-[11px] text-soft leading-relaxed">{analysis.rationale}</p>
                        )}
                    </div>

                    {analysis.hotspots.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">Hotspots</p>
                            <div className="space-y-1.5">
                                {analysis.hotspots.map((hotspot) => (
                                    <div key={`${hotspot.file}:${hotspot.reason}`} className="rounded-lg border border-ui bg-panel px-2.5 py-2">
                                        <p className="text-[11px] font-mono text-brand break-all">{hotspot.file}</p>
                                        <p className="mt-1 text-[11px] text-soft leading-relaxed">{hotspot.reason}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {analysis.affectedAreas.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">Affected Areas</p>
                            <div className="flex flex-wrap gap-1">
                                {analysis.affectedAreas.map((area) => (
                                    <span key={area} className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-state-info-soft text-state-info uppercase">
                                        {area}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {analysis.qaChecks.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">Suggested QA Checks</p>
                            <div className="space-y-1.5">
                                {analysis.qaChecks.map((check) => (
                                    <div key={check} className="flex items-start gap-2 rounded-lg border border-ui bg-panel px-2.5 py-2">
                                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-success" />
                                        <p className="text-[11px] text-foreground leading-relaxed">{check}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">Existing Tests To Rerun</p>
                        {impactedCases.length > 0 ? (
                            <>
                                <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                    {impactedCases.map((testCase) => (
                                        <label key={testCase.id} className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={selectedImpactedIds.has(testCase.id)}
                                                onChange={() => onToggleImpactedId(testCase.id)}
                                                className="accent-qa-accent"
                                            />
                                            <span className="text-[11px] text-foreground group-hover:text-qa-accent transition-colors truncate">
                                                {testCase.displayId} - {testCase.title}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <Button
                                    onClick={onBuildRegressionSuite}
                                    disabled={isBuildingRegressionSuite || selectedImpactedIds.size === 0}
                                    className="w-full h-8 bg-primary text-primary-foreground hover:bg-[hsl(var(--accent-primary-strong))] text-[11px] font-bold gap-2"
                                >
                                    {isBuildingRegressionSuite ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                    {isBuildingRegressionSuite ? 'Building...' : `Build Regression Suite (${selectedImpactedIds.size})`}
                                </Button>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 py-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-state-success" />
                                <span className="text-[11px] text-soft">No existing project tests matched this PR; use the suggested QA checks above.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default PrAnalysisCard
