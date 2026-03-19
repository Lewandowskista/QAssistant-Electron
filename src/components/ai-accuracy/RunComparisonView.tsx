import { AccuracyEvalRun } from "@/types/project"
import { getScoreColor, getScoreBg, getScoreLabel, DIMENSION_LABELS } from "@/lib/accuracy"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RunComparisonViewProps {
    baseRun: AccuracyEvalRun
    compareRun: AccuracyEvalRun
    onClose: () => void
}

function DeltaBadge({ delta }: { delta: number }) {
    if (Math.abs(delta) < 1) {
        return (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#6B7280]">
                <Minus className="h-3 w-3" /> 0
            </span>
        )
    }
    const positive = delta > 0
    return (
        <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-bold",
            positive ? "text-emerald-400" : "text-red-400"
        )}>
            {positive
                ? <TrendingUp className="h-3 w-3" />
                : <TrendingDown className="h-3 w-3" />}
            {positive ? '+' : ''}{delta}
        </span>
    )
}

function ScoreCell({ score }: { score: number }) {
    return (
        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", getScoreBg(score))}>
            {score}
        </span>
    )
}

export function RunComparisonView({ baseRun, compareRun, onClose }: RunComparisonViewProps) {
    const overallDelta = compareRun.aggregateScore - baseRun.aggregateScore

    const dimensions = ['factualAccuracy', 'completeness', 'faithfulness', 'relevance'] as const

    const dimScore = (run: AccuracyEvalRun, dim: string) =>
        run.aggregateDimensions.find(d => d.dimension === dim)?.score ?? 0

    // Per-pair deltas — match by question text (same suite, same pairs)
    const pairDeltas = baseRun.qaPairResults
        .filter(base => base.status !== 'failed')
        .map(base => {
            const match = compareRun.qaPairResults.find(
                c => c.question === base.question && c.status !== 'failed'
            )
            if (!match) return null
            return {
                question: base.question,
                baseScore: base.overallScore,
                compareScore: match.overallScore,
                delta: match.overallScore - base.overallScore
            }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.delta - b.delta)   // largest regressions first

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Run Comparison</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-[#6B7280]" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Run labels */}
            <div className="grid grid-cols-2 gap-3">
                {[
                    { label: 'Base', run: baseRun },
                    { label: 'Compare', run: compareRun }
                ].map(({ label, run }) => (
                    <div key={run.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                        <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest mb-1">{label}</p>
                        <p className="text-xs font-semibold text-[#E2E8F0] truncate">{run.name}</p>
                        <p className="text-[10px] text-[#6B7280] mt-0.5">
                            {new Date(run.startedAt).toLocaleString()}
                        </p>
                        <div className="mt-2">
                            <span
                                className="text-2xl font-black"
                                style={{ color: getScoreColor(run.aggregateScore) }}
                            >
                                {run.aggregateScore}
                            </span>
                            <span className="text-[10px] text-[#6B7280] ml-1">/100 · {getScoreLabel(run.aggregateScore)}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Overall delta banner */}
            <div className={cn(
                "rounded-xl p-4 border flex items-center gap-4",
                Math.abs(overallDelta) < 1
                    ? "bg-[#13131A] border-[#2A2A3A]"
                    : overallDelta > 0
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-red-500/5 border-red-500/20"
            )}>
                <div className="flex-1">
                    <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mb-1">Overall Change</p>
                    <div className="flex items-center gap-2">
                        <span className="text-3xl font-black" style={{ color: overallDelta >= 0 ? '#10B981' : '#EF4444' }}>
                            {overallDelta > 0 ? '+' : ''}{overallDelta}
                        </span>
                        <span className="text-xs text-[#6B7280]">points</span>
                    </div>
                </div>
                <div className="text-right">
                    <ScoreCell score={baseRun.aggregateScore} />
                    <span className="text-[10px] text-[#6B7280] mx-1">→</span>
                    <ScoreCell score={compareRun.aggregateScore} />
                </div>
            </div>

            {/* Dimension breakdown */}
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl overflow-hidden">
                <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest px-4 pt-4 pb-2">Dimension Breakdown</p>
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-[#2A2A3A]">
                            <th className="text-left px-4 py-2 text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">Dimension</th>
                            <th className="text-center px-3 py-2 text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">Base</th>
                            <th className="text-center px-3 py-2 text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">Compare</th>
                            <th className="text-center px-3 py-2 text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">Δ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dimensions.map(dim => {
                            const base = dimScore(baseRun, dim)
                            const compare = dimScore(compareRun, dim)
                            return (
                                <tr key={dim} className="border-b border-[#2A2A3A] last:border-0">
                                    <td className="px-4 py-2.5 text-[#E2E8F0] font-semibold">{DIMENSION_LABELS[dim]}</td>
                                    <td className="px-3 py-2.5 text-center"><ScoreCell score={base} /></td>
                                    <td className="px-3 py-2.5 text-center"><ScoreCell score={compare} /></td>
                                    <td className="px-3 py-2.5 text-center"><DeltaBadge delta={compare - base} /></td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Per-pair regressions & improvements */}
            {pairDeltas.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mb-3">
                        Per-Pair Changes ({pairDeltas.length} matched)
                    </p>
                    <div className="space-y-1.5">
                        {pairDeltas.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-[#13131A] border border-[#2A2A3A] rounded-lg">
                                <DeltaBadge delta={p.delta} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-[#E2E8F0] truncate">{p.question}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[#6B7280]">
                                    <ScoreCell score={p.baseScore} />
                                    <span>→</span>
                                    <ScoreCell score={p.compareScore} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
