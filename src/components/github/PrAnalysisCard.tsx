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
            return 'bg-red-500/15 text-red-300 border border-red-500/25'
        case 'high':
            return 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
        case 'low':
            return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
        default:
            return 'bg-sky-500/15 text-sky-300 border border-sky-500/25'
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
        <div className="rounded-xl border border-[#2A2A3A] bg-[#0D0D11] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#2A2A3A]">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#A78BFA]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">PR Analysis</span>
                    {analysis && analysis.impactedCaseIds.length > 0 && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#A78BFA]/10 text-[#A78BFA]">
                            {analysis.impactedCaseIds.length} impacted
                        </span>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
                    className="h-7 text-[10px] font-bold text-[#A78BFA] hover:bg-[#A78BFA]/10 gap-1"
                >
                    {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze PR'}
                </Button>
            </div>

            {analysis && (
                <div className="p-3 space-y-3">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">Summary</span>
                            <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase', riskPillClass(analysis.riskLevel))}>
                                {analysis.riskLevel} risk
                            </span>
                        </div>
                        <p className="text-[11px] text-[#E2E8F0] leading-relaxed">{analysis.summary}</p>
                        {analysis.rationale && (
                            <p className="text-[10px] text-[#9CA3AF] leading-relaxed">{analysis.rationale}</p>
                        )}
                    </div>

                    {analysis.hotspots.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">Hotspots</p>
                            <div className="space-y-1.5">
                                {analysis.hotspots.map((hotspot) => (
                                    <div key={`${hotspot.file}:${hotspot.reason}`} className="rounded-lg border border-[#2A2A3A] bg-[#13131A] px-2.5 py-2">
                                        <p className="text-[10px] font-mono text-[#A78BFA] break-all">{hotspot.file}</p>
                                        <p className="mt-1 text-[10px] text-[#9CA3AF] leading-relaxed">{hotspot.reason}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {analysis.affectedAreas.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">Affected Areas</p>
                            <div className="flex flex-wrap gap-1">
                                {analysis.affectedAreas.map((area) => (
                                    <span key={area} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6] uppercase">
                                        {area}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {analysis.qaChecks.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">Suggested QA Checks</p>
                            <div className="space-y-1.5">
                                {analysis.qaChecks.map((check) => (
                                    <div key={check} className="flex items-start gap-2 rounded-lg border border-[#2A2A3A] bg-[#13131A] px-2.5 py-2">
                                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                                        <p className="text-[10px] text-[#E2E8F0] leading-relaxed">{check}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">Existing Tests To Rerun</p>
                        {impactedCases.length > 0 ? (
                            <>
                                <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                    {impactedCases.map((testCase) => (
                                        <label key={testCase.id} className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={selectedImpactedIds.has(testCase.id)}
                                                onChange={() => onToggleImpactedId(testCase.id)}
                                                className="accent-[#A78BFA]"
                                            />
                                            <span className="text-[10px] text-[#E2E8F0] group-hover:text-[#A78BFA] transition-colors truncate">
                                                {testCase.displayId} - {testCase.title}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <Button
                                    onClick={onBuildRegressionSuite}
                                    disabled={isBuildingRegressionSuite || selectedImpactedIds.size === 0}
                                    className="w-full h-8 bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD] text-[10px] font-bold gap-2"
                                >
                                    {isBuildingRegressionSuite ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                    {isBuildingRegressionSuite ? 'Building...' : `Build Regression Suite (${selectedImpactedIds.size})`}
                                </Button>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 py-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                                <span className="text-[10px] text-[#9CA3AF]">No existing project tests matched this PR; use the suggested QA checks above.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default PrAnalysisCard
