import { AccuracyEvalRun } from "@/types/project"
import { getScoreColor, getScoreLabel, getScoreBg, DIMENSION_LABELS } from "@/lib/accuracy"
import { DimensionRadarChart } from "./DimensionRadarChart"
import { QaPairResultCard } from "./QaPairResultCard"
import { StatCard } from "@/components/ui/stat-card"
import { Target, CheckCircle2, ShieldCheck, MessageSquare, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface EvalResultsProps {
    run: AccuracyEvalRun
}

export function EvalResults({ run }: EvalResultsProps) {
    const dimScore = (dim: string) =>
        run.aggregateDimensions.find(d => d.dimension === dim)?.score ?? 0
    const failedCount = run.qaPairResults.filter(r => r.status === 'failed').length

    const factual = dimScore('factualAccuracy')
    const faithful = dimScore('faithfulness')
    const complete = dimScore('completeness')
    const relevant = dimScore('relevance')

    const toneFor = (score: number) => {
        if (score >= 90) return 'success' as const
        if (score >= 70) return 'info' as const
        if (score >= 50) return 'warning' as const
        return 'danger' as const
    }

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Aggregate score banner */}
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 flex items-center gap-6">
                <div className="flex flex-col items-center justify-center w-24 h-24 rounded-2xl border-2 shrink-0"
                    style={{ borderColor: getScoreColor(run.aggregateScore), backgroundColor: `${getScoreColor(run.aggregateScore)}10` }}>
                    <span className="text-3xl font-black" style={{ color: getScoreColor(run.aggregateScore) }}>
                        {run.aggregateScore}
                    </span>
                    <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider mt-0.5">
                        /100
                    </span>
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", getScoreBg(run.aggregateScore))}>
                            {getScoreLabel(run.aggregateScore)}
                        </span>
                        <span className="text-[10px] text-[#6B7280]">
                            {run.completedPairs} of {run.totalPairs} pairs evaluated
                        </span>
                        {failedCount > 0 && (
                            <span className="text-[10px] font-medium text-red-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {failedCount} failed
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-semibold text-[#E2E8F0]">{run.name}</p>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">
                        Completed {new Date(run.completedAt ?? run.startedAt).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Dimension stat cards */}
            <div className="grid grid-cols-4 gap-3">
                <StatCard icon={Target} label={DIMENSION_LABELS.factualAccuracy} value={`${factual}/100`} tone={toneFor(factual)} />
                <StatCard icon={ShieldCheck} label={DIMENSION_LABELS.faithfulness} value={`${faithful}/100`} tone={toneFor(faithful)} />
                <StatCard icon={CheckCircle2} label={DIMENSION_LABELS.completeness} value={`${complete}/100`} tone={toneFor(complete)} />
                <StatCard icon={MessageSquare} label={DIMENSION_LABELS.relevance} value={`${relevant}/100`} tone={toneFor(relevant)} />
            </div>

            {/* Radar chart */}
            {run.aggregateDimensions.length > 0 && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
                    <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mb-3">Score Overview</p>
                    <DimensionRadarChart dimensionScores={run.aggregateDimensions} />
                </div>
            )}

            {/* Per-pair results */}
            <div>
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mb-3">
                    Individual Results ({run.qaPairResults.length})
                </p>
                <div className="space-y-2">
                    {run.qaPairResults.map((result, idx) =>
                        result.status === 'failed' ? (
                            <div key={result.id} className="bg-[#13131A] border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-red-400">Evaluation Failed</span>
                                        <span className="text-[10px] text-[#6B7280]">Pair {idx + 1}</span>
                                    </div>
                                    <p className="text-xs text-[#6B7280] truncate">{result.question}</p>
                                    {result.error && (
                                        <p className="text-[11px] text-red-400/70 mt-1 font-mono">{result.error}</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <QaPairResultCard key={result.id} result={result} index={idx} />
                        )
                    )}
                </div>
            </div>
        </div>
    )
}
