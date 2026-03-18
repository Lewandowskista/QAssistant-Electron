import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { AccuracyQaPairResult, AccuracyDimensionScore } from "@/types/project"
import { getScoreColor, getScoreBg, getScoreLabel, DIMENSION_LABELS } from "@/lib/accuracy"
import { ClaimVerificationTable } from "./ClaimVerificationTable"
import { cn } from "@/lib/utils"

interface QaPairResultCardProps {
    result: AccuracyQaPairResult
    index: number
}

function DimensionBar({ ds }: { ds: AccuracyDimensionScore }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#6B7280] w-28 shrink-0 uppercase tracking-wider font-bold">
                {DIMENSION_LABELS[ds.dimension]}
            </span>
            <div className="flex-1 bg-[#1A1A24] rounded-full h-1.5 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${ds.score}%`, backgroundColor: getScoreColor(ds.score) }}
                />
            </div>
            <span className="text-[10px] font-bold text-[#E2E8F0] w-8 text-right shrink-0">
                {ds.score}
            </span>
        </div>
    )
}

export function QaPairResultCard({ result, index }: QaPairResultCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [showClaims, setShowClaims] = useState(false)

    return (
        <div className="border border-[#2A2A3A] rounded-xl overflow-hidden bg-[#13131A]">
            {/* Header row */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1A1A24] transition-colors text-left"
            >
                <span className="text-[9px] font-mono text-[#6B7280] w-6 shrink-0">#{index + 1}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#E2E8F0] truncate">{result.question}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                        "text-[10px] font-bold px-2.5 py-1 rounded-full",
                        getScoreBg(result.overallScore)
                    )}>
                        {result.overallScore} — {getScoreLabel(result.overallScore)}
                    </span>
                    {expanded
                        ? <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                        : <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                    }
                </div>
            </button>

            {expanded && (
                <div className="border-t border-[#2A2A3A] px-4 py-4 space-y-4 bg-[#0F0F13]">
                    {/* Question + Response */}
                    <div className="grid grid-cols-1 gap-3">
                        <div>
                            <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest mb-1">Question</p>
                            <p className="text-xs text-[#E2E8F0] leading-relaxed bg-[#13131A] rounded-lg p-3 border border-[#2A2A3A]">
                                {result.question}
                            </p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest mb-1">Agent Response</p>
                            <p className="text-xs text-[#E2E8F0] leading-relaxed bg-[#13131A] rounded-lg p-3 border border-[#2A2A3A] whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {result.agentResponse}
                            </p>
                        </div>
                    </div>

                    {/* Dimension scores */}
                    <div>
                        <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest mb-2">Dimension Scores</p>
                        <div className="space-y-1.5">
                            {result.dimensionScores.map(ds => (
                                <DimensionBar key={ds.dimension} ds={ds} />
                            ))}
                        </div>
                    </div>

                    {/* Dimension reasoning */}
                    {result.dimensionScores.some(ds => ds.reasoning) && (
                        <div className="grid grid-cols-2 gap-2">
                            {result.dimensionScores.filter(ds => ds.reasoning).map(ds => (
                                <div key={ds.dimension} className="bg-[#13131A] rounded-lg p-2.5 border border-[#2A2A3A]">
                                    <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider mb-1">
                                        {DIMENSION_LABELS[ds.dimension]}
                                    </p>
                                    <p className="text-[10px] text-[#9CA3AF] leading-relaxed">{ds.reasoning}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Claims toggle */}
                    <div>
                        <button
                            onClick={() => setShowClaims(!showClaims)}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-[#A78BFA] hover:text-[#C4B5FD] transition-colors"
                        >
                            {showClaims ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {result.extractedClaims.length} Extracted Claims
                        </button>
                        {showClaims && (
                            <div className="mt-2">
                                <ClaimVerificationTable claims={result.extractedClaims} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
