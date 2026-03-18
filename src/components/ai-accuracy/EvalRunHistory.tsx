import { AccuracyEvalRun } from "@/types/project"
import { getScoreBg, getScoreLabel } from "@/lib/accuracy"
import { Button } from "@/components/ui/button"
import { Trash2, Eye } from "lucide-react"
import { cn } from "@/lib/utils"

interface EvalRunHistoryProps {
    runs: AccuracyEvalRun[]
    activeRunId?: string
    onSelectRun: (run: AccuracyEvalRun) => void
    onDeleteRun: (runId: string) => void
}

const STATUS_STYLES: Record<string, string> = {
    completed: 'text-emerald-400 bg-emerald-500/10',
    running: 'text-blue-400 bg-blue-500/10',
    failed: 'text-red-400 bg-red-500/10',
    pending: 'text-slate-400 bg-slate-500/10',
    cancelled: 'text-amber-400 bg-amber-500/10'
}

export function EvalRunHistory({ runs, activeRunId, onSelectRun, onDeleteRun }: EvalRunHistoryProps) {
    if (runs.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="text-center space-y-2">
                    <p className="text-sm font-semibold text-[#E2E8F0]">No evaluation runs yet</p>
                    <p className="text-xs text-[#6B7280]">Run an evaluation from the Setup tab to see results here.</p>
                </div>
            </div>
        )
    }

    const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt)

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
            <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mb-3">
                Evaluation History ({runs.length})
            </p>
            {sorted.map(run => (
                <div
                    key={run.id}
                    className={cn(
                        "border border-[#2A2A3A] rounded-xl p-4 flex items-center gap-3 bg-[#13131A] hover:bg-[#1A1A24] transition-colors",
                        activeRunId === run.id && "border-[#A78BFA]/40 bg-[#A78BFA]/5"
                    )}
                >
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full capitalize", STATUS_STYLES[run.status] || STATUS_STYLES.pending)}>
                                {run.status}
                            </span>
                            {run.status === 'completed' && (
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getScoreBg(run.aggregateScore))}>
                                    {run.aggregateScore} — {getScoreLabel(run.aggregateScore)}
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-semibold text-[#E2E8F0] truncate">{run.name}</p>
                        <p className="text-[10px] text-[#6B7280] mt-0.5">
                            {run.completedPairs}/{run.totalPairs} pairs · {new Date(run.startedAt).toLocaleString()}
                        </p>
                        {run.error && (
                            <p className="text-[10px] text-red-400 mt-1 truncate">{run.error}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {run.status === 'completed' && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[#6B7280] hover:text-[#A78BFA]"
                                onClick={() => onSelectRun(run)}
                                title="View results"
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#6B7280] hover:text-red-400"
                            onClick={() => onDeleteRun(run.id)}
                            title="Delete run"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    )
}
