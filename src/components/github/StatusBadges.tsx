import { Check, X, Clock, CircleDot, Play } from 'lucide-react'
import { GitHubReview } from '@/types/github'

export function CheckStatusIcon({ status }: { status: string | null | undefined }) {
    if (status === 'success') return <Check className="h-3.5 w-3.5 text-emerald-400" />
    if (status === 'failure') return <X className="h-3.5 w-3.5 text-red-400" />
    if (status === 'pending') return <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
    return <CircleDot className="h-3.5 w-3.5 text-[#6B7280] opacity-40" />
}

export function statusBadge(status: string, conclusion: string | null) {
    if (status === 'completed') {
        if (conclusion === 'success') return { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Success' }
        if (conclusion === 'failure') return { icon: X, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Failed' }
        if (conclusion === 'cancelled') return { icon: X, color: 'text-[#6B7280]', bg: 'bg-[#2A2A3A]', label: 'Cancelled' }
        if (conclusion === 'skipped') return { icon: CircleDot, color: 'text-[#6B7280]', bg: 'bg-[#2A2A3A]', label: 'Skipped' }
        if (conclusion === 'timed_out') return { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Timed out' }
        return { icon: CircleDot, color: 'text-[#6B7280]', bg: 'bg-[#2A2A3A]', label: conclusion || 'Done' }
    }
    if (status === 'in_progress') return { icon: Play, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Running' }
    if (status === 'queued') return { icon: Clock, color: 'text-[#6B7280]', bg: 'bg-[#2A2A3A]', label: 'Queued' }
    if (status === 'waiting') return { icon: Clock, color: 'text-[#6B7280]', bg: 'bg-[#2A2A3A]', label: 'Waiting' }
    return { icon: Clock, color: 'text-[#6B7280]', bg: 'bg-[#2A2A3A]', label: status }
}

export function deployStatusColor(state: string) {
    if (state === 'success') return 'text-emerald-400 bg-emerald-500/20'
    if (state === 'failure' || state === 'error') return 'text-red-400 bg-red-500/20'
    if (state === 'in_progress' || state === 'pending') return 'text-amber-400 bg-amber-500/20'
    if (state === 'inactive') return 'text-[#6B7280] bg-[#2A2A3A]'
    return 'text-[#6B7280] bg-[#2A2A3A]'
}

export function mergeableLabel(state: string) {
    if (state === 'clean') return { text: 'Ready to merge', cls: 'bg-emerald-500/15 text-emerald-400' }
    if (state === 'blocked') return { text: 'Merge blocked', cls: 'bg-red-500/15 text-red-400' }
    if (state === 'behind') return { text: 'Behind base branch', cls: 'bg-amber-500/15 text-amber-400' }
    if (state === 'dirty') return { text: 'Has conflicts', cls: 'bg-red-500/15 text-red-400' }
    return { text: state, cls: 'bg-[#2A2A3A] text-[#6B7280]' }
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
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                    <Check className="h-2.5 w-2.5" />{summary.approved}
                </span>
            )}
            {summary.changesRequested > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">
                    <X className="h-2.5 w-2.5" />{summary.changesRequested}
                </span>
            )}
            {summary.commented > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#2A2A3A] text-[#6B7280]">
                    <CircleDot className="h-2.5 w-2.5" />{summary.commented}
                </span>
            )}
        </div>
    )
}
