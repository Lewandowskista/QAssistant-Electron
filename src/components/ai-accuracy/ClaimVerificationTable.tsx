import { AccuracyClaim } from "@/types/project"
import { getVerdictBg, getVerdictLabel } from "@/lib/accuracy"
import { cn } from "@/lib/utils"

interface ClaimVerificationTableProps {
    claims: AccuracyClaim[]
}

export function ClaimVerificationTable({ claims }: ClaimVerificationTableProps) {
    if (claims.length === 0) {
        return (
            <div className="text-[10px] text-muted-ui italic py-2">No claims extracted.</div>
        )
    }

    return (
        <div className="space-y-1.5">
            {claims.map((claim, i) => (
                <div key={claim.id} className="border border-ui rounded-lg p-3 bg-app">
                    <div className="flex items-start gap-2">
                        <span className="text-[9px] font-mono text-muted-ui mt-0.5 shrink-0 w-4 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className={cn(
                                    "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                    getVerdictBg(claim.verdict)
                                )}>
                                    {getVerdictLabel(claim.verdict)}
                                </span>
                                <span className="text-[9px] text-muted-ui">
                                    {Math.round(claim.confidence * 100)}% confidence
                                </span>
                                <span className="text-[9px] text-muted-ui capitalize">
                                    · {claim.claimText.split(' ').length > 1 ? 'claim' : ''}
                                </span>
                            </div>
                            <p className="text-xs text-foreground leading-relaxed mb-1">
                                {claim.claimText}
                            </p>
                            {claim.reasoning && (
                                <p className="text-[10px] text-muted-ui leading-relaxed italic">
                                    {claim.reasoning}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
