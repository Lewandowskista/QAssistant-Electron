import { useState } from "react"
import { AccuracyEvalRun } from "@/types/project"
import { getScoreBg, getScoreLabel } from "@/lib/accuracy"
import { Button } from "@/components/ui/button"
import { Trash2, Eye, GitCompare } from "lucide-react"
import { cn } from "@/lib/utils"

interface EvalRunHistoryProps {
    runs: AccuracyEvalRun[]
    activeRunId?: string
    onSelectRun: (run: AccuracyEvalRun) => void
    onDeleteRun: (runId: string) => void
    onCompareRuns?: (base: AccuracyEvalRun, compare: AccuracyEvalRun) => void
}

const STATUS_STYLES: Record<string, string> = {
    completed: 'text-state-success bg-state-success-soft',
    running: 'text-state-info bg-state-info-soft',
    failed: 'text-state-danger bg-state-danger-soft',
    pending: 'text-muted-ui bg-surface-elevated/60',
    cancelled: 'text-state-warning bg-state-warning-soft'
}

export function EvalRunHistory({ runs, activeRunId, onSelectRun, onDeleteRun, onCompareRuns }: EvalRunHistoryProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    const completedRuns = runs.filter(r => r.status === 'completed')

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else if (next.size < 2) {
                next.add(id)
            }
            return next
        })
    }

    const handleCompare = () => {
        if (selectedIds.size !== 2 || !onCompareRuns) return
        const [id1, id2] = [...selectedIds]
        const run1 = completedRuns.find(r => r.id === id1)!
        const run2 = completedRuns.find(r => r.id === id2)!
        // base = older run, compare = newer run
        const [base, compare] = run1.startedAt <= run2.startedAt ? [run1, run2] : [run2, run1]
        onCompareRuns(base, compare)
        setSelectedIds(new Set())
    }

    if (runs.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <div className="text-center space-y-2">
                    <p className="text-sm font-semibold text-foreground">No evaluation runs yet</p>
                    <p className="text-xs text-muted-ui">Run an evaluation from the Setup tab to see results here.</p>
                </div>
            </div>
        )
    }

    const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt)

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-muted-ui uppercase tracking-widest">
                    Evaluation History ({runs.length})
                </p>
                {onCompareRuns && completedRuns.length >= 2 && (
                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                            <span className="text-[10px] text-muted-ui">
                                {selectedIds.size}/2 selected
                            </span>
                        )}
                        <Button
                            variant="outline" size="sm"
                            disabled={selectedIds.size !== 2}
                            onClick={handleCompare}
                            className={cn(
                                "h-7 text-[10px] font-bold border-ui",
                                selectedIds.size === 2
                                    ? "text-brand border-qa-accent/30 hover:bg-qa-accent/10"
                                    : "text-muted-ui"
                            )}
                        >
                            <GitCompare className="h-3.5 w-3.5 mr-1" />
                            Compare
                        </Button>
                    </div>
                )}
            </div>

            {onCompareRuns && completedRuns.length >= 2 && selectedIds.size === 0 && (
                <p className="text-[10px] text-text-muted/70 italic mb-2">
                    Select 2 completed runs to compare them
                </p>
            )}

            {sorted.map(run => {
                const isSelectable = run.status === 'completed' && onCompareRuns && completedRuns.length >= 2
                const isSelected = selectedIds.has(run.id)
                return (
                    <div
                        key={run.id}
                        className={cn(
                            "border border-ui rounded-xl p-4 flex items-center gap-3 bg-panel transition-colors",
                            activeRunId === run.id && !isSelected && "border-qa-accent/40 bg-qa-accent/5",
                            isSelected && "border-qa-accent/60 bg-qa-accent/10",
                            isSelectable && "hover:bg-elevated cursor-pointer",
                            !isSelectable && "hover:bg-elevated"
                        )}
                        onClick={isSelectable ? () => toggleSelect(run.id) : undefined}
                    >
                        {isSelectable && (
                            <div className={cn(
                                "w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center",
                                isSelected ? "border-qa-accent bg-primary" : "border-ui"
                            )}>
                                {isSelected && <div className="w-2 h-2 bg-app rounded-sm" />}
                            </div>
                        )}
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
                            <p className="text-xs font-semibold text-foreground truncate">{run.name}</p>
                            <p className="text-[10px] text-muted-ui mt-0.5">
                                {run.completedPairs}/{run.totalPairs} pairs · {new Date(run.startedAt).toLocaleString()}
                            </p>
                            {run.error && (
                                <p className="text-[10px] text-state-danger mt-1 truncate">{run.error}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            {run.status === 'completed' && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-ui hover:text-brand"
                                    onClick={() => onSelectRun(run)}
                                    title="View results"
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-ui hover:text-state-danger"
                                onClick={() => onDeleteRun(run.id)}
                                title="Delete run"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
