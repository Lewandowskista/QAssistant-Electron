import { useState, useEffect } from 'react'
import { GitHubPrDetail, GitHubReview, GitHubComment } from '@/types/github'
import { GitBranch, ExternalLink, X, Loader2, Link2 } from 'lucide-react'
import { cn, formatTimeAgo } from '@/lib/utils'
import { CheckStatusIcon, mergeableLabel } from '@/components/github/StatusBadges'
import { useProjectStore } from '@/store/useProjectStore'
import { Button } from '@/components/ui/button'

const DESCRIPTION_TRUNCATE_LENGTH = 800

function PrDescription({ body }: { body: string }) {
    const [expanded, setExpanded] = useState(false)
    const isLong = body.length > DESCRIPTION_TRUNCATE_LENGTH

    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Description</p>
            <p className="text-[11px] text-[#9CA3AF] whitespace-pre-wrap leading-relaxed break-words">
                {isLong && !expanded ? body.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + '…' : body}
            </p>
            {isLong && (
                <button
                    onClick={() => setExpanded(prev => !prev)}
                    className="mt-1.5 text-[10px] font-semibold text-[#A78BFA] hover:text-[#C4B5FD] transition-colors"
                >
                    {expanded ? 'Show less' : 'Show more'}
                </button>
            )}
        </div>
    )
}

interface PrDetailPanelProps {
    owner: string
    repo: string
    prNumber: number
    prTitle: string
    prHtmlUrl: string
    onClose: () => void
}

export function PrDetailPanel({ owner, repo, prNumber, prTitle, prHtmlUrl, onClose }: PrDetailPanelProps) {
    const api = window.electronAPI
    const { activeProjectId, projects, linkPrToHandoff, setTaskCollabState, addCollaborationEvent } = useProjectStore()
    const activeProject = projects.find((project) => project.id === activeProjectId)

    const [detail, setDetail] = useState<GitHubPrDetail | null>(null)
    const [reviews, setReviews] = useState<GitHubReview[]>([])
    const [comments, setComments] = useState<GitHubComment[]>([])
    const [loadingDetail, setLoadingDetail] = useState(true)
    const [loadingComments, setLoadingComments] = useState(true)
    const [checkStatus, setCheckStatus] = useState<string | null>(null)
    const [selectedHandoffId, setSelectedHandoffId] = useState('')

    useEffect(() => {
        let cancelled = false
        setDetail(null)
        setReviews([])
        setComments([])
        setLoadingDetail(true)
        setLoadingComments(true)

        const load = async () => {
            const [detailResult, reviewResult] = await Promise.all([
                api.githubGetPrDetail({ owner, repo, prNumber }),
                api.githubGetPrReviews({ owner, repo, prNumber }),
            ])
            if (cancelled) return
            setDetail(detailResult)
            if (detailResult.checkStatus !== undefined) {
                setCheckStatus(detailResult.checkStatus)
            }
            setReviews(reviewResult)
            setLoadingDetail(false)

            // Comments non-blocking
            const commentsResult = await api.githubGetPrComments({ owner, repo, prNumber })
            if (cancelled) return
            setComments(commentsResult)
            setLoadingComments(false)
        }

        load()
        return () => { cancelled = true }
    }, [owner, repo, prNumber])

    return (
        <div className="w-[380px] shrink-0 border-l border-[#2A2A3A] flex flex-col bg-[#0D0D11] overflow-hidden">
            {/* Panel header */}
            <div className="shrink-0 border-b border-[#2A2A3A] px-4 py-3 flex items-center gap-2 bg-[#13131A]/60">
                <span className="text-xs font-bold text-[#9CA3AF] shrink-0">#{prNumber}</span>
                <span className="text-xs font-semibold text-[#E2E8F0] flex-1 truncate">{prTitle}</span>
                <button
                    onClick={() => api.openUrl(prHtmlUrl)}
                    className="p-1.5 rounded hover:bg-[#252535] text-[#6B7280] hover:text-[#A78BFA] transition-colors shrink-0"
                    title="Open on GitHub"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded hover:bg-[#252535] text-[#6B7280] hover:text-[#E2E8F0] transition-colors shrink-0"
                    title="Close"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {loadingDetail ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 text-[#A78BFA] animate-spin" />
                    </div>
                ) : detail ? (
                    <>
                        {/* Branch info */}
                        <div className="flex items-center gap-2 text-[11px] text-[#6B7280]">
                            <GitBranch className="h-3 w-3 shrink-0" />
                            <code className="font-mono text-[#A78BFA] truncate">{detail.headBranch}</code>
                            <span>→</span>
                            <code className="font-mono truncate">{detail.baseBranch}</code>
                            {detail.draft && (
                                <span className="px-1.5 py-0.5 rounded bg-[#2A2A3A] text-[9px] font-bold uppercase text-[#6B7280] shrink-0">Draft</span>
                            )}
                        </div>

                        {/* Mergeable state */}
                        {detail.mergeableState && detail.mergeableState !== 'unknown' && (() => {
                            const m = mergeableLabel(detail.mergeableState)
                            return (
                                <div className={cn("px-2.5 py-1.5 rounded text-[11px] font-semibold", m.cls)}>
                                    {m.text}
                                </div>
                            )
                        })()}

                        {/* CI status */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">CI</span>
                            <CheckStatusIcon status={checkStatus ?? detail.checkStatus} />
                            <span className="text-[11px] text-[#9CA3AF] capitalize">
                                {checkStatus ?? detail.checkStatus ?? 'No checks'}
                            </span>
                        </div>

                        {activeProject && (
                            <div className="rounded-lg border border-[#2A2A3A] bg-[#13131A] p-3 space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Link to Handoff</p>
                                <select value={selectedHandoffId} onChange={(event) => setSelectedHandoffId(event.target.value)} className="w-full h-9 rounded-md bg-[#0F0F13] border border-[#2A2A3A] px-2 text-xs text-[#E2E8F0]">
                                    <option value="">Select handoff...</option>
                                    {(activeProject.handoffPackets || []).map((handoff) => {
                                        const task = activeProject.tasks.find((item) => item.id === handoff.taskId)
                                        return <option key={handoff.id} value={handoff.id}>{task?.title || handoff.summary}</option>
                                    })}
                                </select>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        className="flex-1 bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]"
                                        disabled={!selectedHandoffId}
                                        onClick={async () => {
                                            const handoff = (activeProject.handoffPackets || []).find((item) => item.id === selectedHandoffId)
                                            if (!handoff) return
                                            await linkPrToHandoff(activeProject.id, handoff.id, {
                                                repoFullName: `${owner}/${repo}`,
                                                prNumber,
                                                prUrl: prHtmlUrl,
                                                status: checkStatus ?? detail.checkStatus ?? undefined
                                            })
                                        }}
                                    >
                                        <Link2 className="h-3.5 w-3.5 mr-1" /> Link PR
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-[#10B981]/20 text-[#10B981]"
                                        disabled={!selectedHandoffId || ((checkStatus ?? detail.checkStatus) !== 'success' && detail.state !== 'closed')}
                                        onClick={async () => {
                                            const handoff = (activeProject.handoffPackets || []).find((item) => item.id === selectedHandoffId)
                                            if (!handoff) return
                                            await setTaskCollabState(activeProject.id, handoff.taskId, 'ready_for_qa')
                                            await addCollaborationEvent(activeProject.id, {
                                                taskId: handoff.taskId,
                                                handoffId: handoff.id,
                                                eventType: 'ready_for_qa',
                                                actorRole: 'dev',
                                                title: `PR #${prNumber} ready for QA`
                                            })
                                        }}
                                    >
                                        Ready for QA
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {(activeProject.handoffPackets || [])
                                        .filter((handoff) => handoff.linkedPrs.some((pr) => pr.prNumber === prNumber && pr.repoFullName === `${owner}/${repo}`))
                                        .map((handoff) => {
                                            const task = activeProject.tasks.find((item) => item.id === handoff.taskId)
                                            return <span key={handoff.id} className="px-2 py-1 rounded-md bg-[#0F0F13] border border-[#2A2A3A] text-[10px] text-[#38BDF8]">{task?.title || handoff.summary}</span>
                                        })}
                                </div>
                            </div>
                        )}
                        {!activeProject && (
                            <div className="rounded-lg border border-[#2A2A3A] bg-[#13131A] p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1.5">Link to Handoff</p>
                                <p className="text-[11px] text-[#9CA3AF]">
                                    Select a project from the sidebar to link this PR to a handoff.
                                </p>
                            </div>
                        )}

                        {/* Diff stats */}
                        {(detail.additions > 0 || detail.deletions > 0) && (
                            <div className="flex items-center gap-3 text-[11px] font-mono p-2.5 rounded bg-[#13131A] border border-[#2A2A3A]">
                                <span className="text-emerald-400">+{detail.additions}</span>
                                <span className="text-red-400">−{detail.deletions}</span>
                                <span className="text-[#6B7280]">{detail.changedFiles} file{detail.changedFiles !== 1 ? 's' : ''}</span>
                            </div>
                        )}

                        {/* Reviewers */}
                        {reviews.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Reviewers</p>
                                <div className="space-y-1.5">
                                    {Object.values(
                                        reviews.reduce((acc: Record<string, GitHubReview>, r) => {
                                            if (!acc[r.user] || r.submittedAt > acc[r.user].submittedAt) acc[r.user] = r
                                            return acc
                                        }, {})
                                    ).map(r => (
                                        <div key={r.user} className="flex items-center gap-2">
                                            <img src={r.userAvatar} className="w-5 h-5 rounded-full shrink-0" alt={r.user} />
                                            <span className="text-[11px] text-[#E2E8F0] flex-1 truncate">{r.user}</span>
                                            <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0",
                                                r.state === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' :
                                                r.state === 'CHANGES_REQUESTED' ? 'bg-red-500/20 text-red-400' :
                                                r.state === 'COMMENTED' ? 'bg-[#A78BFA]/20 text-[#A78BFA]' :
                                                'bg-[#2A2A3A] text-[#6B7280]'
                                            )}>
                                                {r.state === 'CHANGES_REQUESTED' ? 'Changes' : r.state.charAt(0) + r.state.slice(1).toLowerCase()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Requested reviewers (not yet reviewed) */}
                        {detail.requestedReviewers.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Awaiting review from</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {detail.requestedReviewers.map(reviewer => (
                                        <span key={reviewer} className="px-2 py-0.5 rounded-full bg-[#2A2A3A] text-[10px] text-[#9CA3AF]">
                                            {reviewer}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* PR body */}
                        {detail.body && (
                            <PrDescription body={detail.body} />
                        )}

                        {/* Comments */}
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                                Comments {comments.length > 0 && `(${comments.length})`}
                            </p>
                            {loadingComments ? (
                                <div className="flex items-center gap-2 py-2">
                                    <Loader2 className="h-3 w-3 text-[#A78BFA] animate-spin" />
                                    <span className="text-[11px] text-[#6B7280]">Loading comments…</span>
                                </div>
                            ) : comments.length === 0 ? (
                                <p className="text-[11px] text-[#6B7280]">No comments</p>
                            ) : (
                                <div className="space-y-3">
                                    {comments.map(comment => (
                                        <div key={comment.id} className="p-2.5 rounded-lg bg-[#13131A] border border-[#2A2A3A]">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <img src={comment.userAvatar} className="w-4 h-4 rounded-full" alt={comment.user} />
                                                <span className="text-[11px] font-semibold text-[#E2E8F0]">{comment.user}</span>
                                                <span className="text-[10px] text-[#6B7280]">{formatTimeAgo(comment.createdAt)}</span>
                                            </div>
                                            <p className="text-[11px] text-[#9CA3AF] whitespace-pre-wrap break-words leading-relaxed">
                                                {comment.body.length > 500 ? comment.body.slice(0, 500) + '…' : comment.body}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="text-center py-8 text-[#6B7280] text-xs">Failed to load details</div>
                )}
            </div>
        </div>
    )
}
