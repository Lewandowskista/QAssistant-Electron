import { Check, X, Clock, CircleDot, Play } from 'lucide-react'
import { GitHubReview } from '@/types/github'

export function CheckStatusIcon({ status }: { status: string | null | undefined }) {
    if (status === 'success') return <Check className="h-3.5 w-3.5 text-state-success" />
    if (status === 'failure') return <X className="h-3.5 w-3.5 text-state-danger" />
    if (status === 'pending') return <Clock className="h-3.5 w-3.5 text-state-warning animate-pulse" />
    return <CircleDot className="h-3.5 w-3.5 text-muted-ui opacity-40" />
}

export function statusBadge(status: string, conclusion: string | null) {
    if (status === 'completed') {
        if (conclusion === 'success') return { icon: Check, color: 'text-state-success', bg: 'bg-state-success/20', label: 'Success' }
        if (conclusion === 'failure') return { icon: X, color: 'text-state-danger', bg: 'bg-state-danger/20', label: 'Failed' }
        if (conclusion === 'cancelled') return { icon: X, color: 'text-muted-ui', bg: 'bg-elevated', label: 'Cancelled' }
        if (conclusion === 'skipped') return { icon: CircleDot, color: 'text-muted-ui', bg: 'bg-elevated', label: 'Skipped' }
        if (conclusion === 'timed_out') return { icon: Clock, color: 'text-state-warning', bg: 'bg-state-warning/20', label: 'Timed out' }
        return { icon: CircleDot, color: 'text-muted-ui', bg: 'bg-elevated', label: conclusion || 'Done' }
    }
    if (status === 'in_progress') return { icon: Play, color: 'text-state-warning', bg: 'bg-state-warning/20', label: 'Running' }
    if (status === 'queued') return { icon: Clock, color: 'text-muted-ui', bg: 'bg-elevated', label: 'Queued' }
    if (status === 'waiting') return { icon: Clock, color: 'text-muted-ui', bg: 'bg-elevated', label: 'Waiting' }
    return { icon: Clock, color: 'text-muted-ui', bg: 'bg-elevated', label: status }
}

export function deployStatusColor(state: string) {
    if (state === 'success') return 'text-state-success bg-state-success/20'
    if (state === 'failure' || state === 'error') return 'text-state-danger bg-state-danger/20'
    if (state === 'in_progress' || state === 'pending') return 'text-state-warning bg-state-warning/20'
    if (state === 'inactive') return 'text-muted-ui bg-elevated'
    return 'text-muted-ui bg-elevated'
}

export function mergeableLabel(state: string) {
    if (state === 'clean') return { text: 'Ready to merge', cls: 'bg-state-success-soft text-state-success' }
    if (state === 'blocked') return { text: 'Merge blocked', cls: 'bg-state-danger-soft text-state-danger' }
    if (state === 'behind') return { text: 'Behind base branch', cls: 'bg-state-warning-soft text-state-warning' }
    if (state === 'dirty') return { text: 'Has conflicts', cls: 'bg-state-danger-soft text-state-danger' }
    return { text: state, cls: 'bg-elevated text-muted-ui' }
}

export function summarizeReviews(reviews: GitHubReview[]) {
    const latest: Record<string, GitHubReview> = {}
    for (const r of reviews) {
        if (!latest[r.user] || r.submittedAt > latest[r.user].submittedAt) {
            latest[r.user] = r
        }
    }
    const vals = Object.values(latest)
    return {
        approved: vals.filter(r => r.state === 'APPROVED').length,
        changesRequested: vals.filter(r => r.state === 'CHANGES_REQUESTED').length,
        commented: vals.filter(r => r.state === 'COMMENTED').length,
    }
}

export function ReviewSummaryBadges({ reviews }: { reviews: GitHubReview[] }) {
    const summary = summarizeReviews(reviews)
    return (
        <div className="flex items-center gap-1">
            {summary.approved > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-state-success/20 text-state-success">
                    <Check className="h-2.5 w-2.5" />{summary.approved}
                </span>
            )}
            {summary.changesRequested > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-state-danger/20 text-state-danger">
                    <X className="h-2.5 w-2.5" />{summary.changesRequested}
                </span>
            )}
            {summary.commented > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-elevated text-muted-ui">
                    <CircleDot className="h-2.5 w-2.5" />{summary.commented}
                </span>
            )}
        </div>
    )
}
