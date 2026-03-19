import { useState, useEffect } from 'react'
import { GitHubScopeGuard } from '@/components/GitHubScopeGuard'
import { GitHubSearchItem } from '@/types/github'
import { MessageSquare, RefreshCw, Loader2, ExternalLink, GitPullRequest, Eye, Plus, Minus, ArrowUpDown, EyeOff, ChevronDown } from 'lucide-react'
import { cn, formatTimeAgo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useGitHubStore } from '@/store/useGitHubStore'
import { PrDetailPanel } from '@/components/github/PrDetailPanel'

interface EnrichedPr {
    additions?: number
    deletions?: number
    changedFiles?: number
    mergeableState?: string
    draft?: boolean
}

function ReviewItem({ item, enriched, onAcknowledge, onSelect, isSelected }: {
    item: GitHubSearchItem
    enriched?: EnrichedPr
    onAcknowledge?: () => void
    onSelect?: () => void
    isSelected?: boolean
}) {
    return (
        <div className={cn("flex items-center gap-2 w-full rounded-lg bg-[#13131A] border transition-colors group", isSelected ? "border-[#A78BFA]/60" : "border-[#2A2A3A] hover:border-[#3D3D5F]")}>
        <button
            onClick={onSelect ?? (() => window.electronAPI.openUrl(item.htmlUrl))}
            className="flex-1 flex items-center gap-3 p-3 text-left"
        >
            <GitPullRequest className={cn("h-4 w-4 shrink-0", enriched?.draft ? "text-[#6B7280]" : "text-emerald-400")} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#E2E8F0] group-hover:text-[#A78BFA] transition-colors truncate">
                        {item.title}
                    </span>
                    {enriched?.draft && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[#2A2A3A] text-[#6B7280]">Draft</span>
                    )}
                    {enriched?.mergeableState === 'clean' && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">Ready</span>
                    )}
                    {enriched?.mergeableState === 'blocked' && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">Blocked</span>
                    )}
                    {enriched?.mergeableState === 'dirty' && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">Conflicts</span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#6B7280] flex-wrap">
                    <span className="font-mono">{item.repoFullName}#{item.number}</span>
                    <span>·</span>
                    <img src={item.authorAvatar} className="w-3.5 h-3.5 rounded-full" alt={item.author} />
                    <span>{item.author}</span>
                    <span>·</span>
                    <span>opened {formatTimeAgo(item.createdAt)}</span>
                    {enriched?.additions !== undefined && (
                        <>
                            <span>·</span>
                            <span className="text-emerald-400 font-mono flex items-center gap-0.5">
                                <Plus className="h-2.5 w-2.5" />{enriched.additions}
                            </span>
                            <span className="text-red-400 font-mono flex items-center gap-0.5">
                                <Minus className="h-2.5 w-2.5" />{enriched.deletions}
                            </span>
                            {enriched.changedFiles !== undefined && (
                                <span className="text-[#6B7280]">{enriched.changedFiles}f</span>
                            )}
                        </>
                    )}
                </div>
            </div>
            <ExternalLink className="h-3 w-3 text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
        {onSelect && (
            <button
                onClick={(e) => { e.stopPropagation(); window.electronAPI.openUrl(item.htmlUrl) }}
                className="p-2 rounded text-[#6B7280] hover:text-[#A78BFA] opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="Open on GitHub"
            >
                <ExternalLink className="h-3.5 w-3.5" />
            </button>
        )}
        {onAcknowledge && (
            <button
                onClick={onAcknowledge}
                className="p-2 mr-1 rounded text-[#6B7280] hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="Dismiss"
            >
                <EyeOff className="h-3.5 w-3.5" />
            </button>
        )}
        </div>
    )
}

function CodeReviewsContent() {
    const api = window.electronAPI
    const { acknowledge, unacknowledge, isAcknowledged } = useGitHubStore()
    const [showAcknowledged, setShowAcknowledged] = useState(false)

    const [reviewRequests, setReviewRequests] = useState<GitHubSearchItem[]>([])
    const [myPrs, setMyPrs] = useState<GitHubSearchItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [enriched, setEnriched] = useState<Record<string, EnrichedPr>>({})
    const [selectedItem, setSelectedItem] = useState<GitHubSearchItem | null>(null)
    const [enriching, setEnriching] = useState(false)
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'largest'>('newest')

    const enrichItems = async (items: GitHubSearchItem[]) => {
        if (items.length === 0) return
        setEnriching(true)
        // Cap at 12 to stay within rate limits
        const top = items.slice(0, 12)
        const results = await Promise.allSettled(
            top.map(async item => {
                const [owner, repo] = item.repoFullName.split('/')
                const detail = await api.githubGetPrDetail({ owner, repo, prNumber: item.number })
                return { key: `${item.repoFullName}#${item.number}`, detail }
            })
        )
        const map: Record<string, EnrichedPr> = {}
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) {
                const { key, detail } = r.value
                map[key] = {
                    additions: detail.additions,
                    deletions: detail.deletions,
                    changedFiles: detail.changedFiles,
                    mergeableState: detail.mergeableState ?? undefined,
                    draft: detail.draft,
                }
            }
        })
        setEnriched(map)
        setEnriching(false)
    }

    const loadData = async (force = false) => {
        setLoading(true)
        setError(null)
        setEnriched({})
        try {
            const [reviewResult, myPrResult] = await Promise.all([
                api.githubGetReviewRequests({ forceRefresh: force }),
                api.githubGetMyOpenPrs({ forceRefresh: force }),
            ])
            setReviewRequests(reviewResult)
            setMyPrs(myPrResult)
            setLastUpdated(new Date())
            // Enrich after main load completes (non-blocking)
            enrichItems([...reviewResult, ...myPrResult])
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadData() }, [])

    const getKey = (item: GitHubSearchItem) => `${item.repoFullName}#${item.number}`

    const sortItems = (items: GitHubSearchItem[]) => {
        const sorted = [...items]
        if (sortBy === 'oldest') {
            sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        } else if (sortBy === 'largest') {
            sorted.sort((a, b) => {
                const aSize = (enriched[getKey(a)]?.additions ?? 0) + (enriched[getKey(a)]?.deletions ?? 0)
                const bSize = (enriched[getKey(b)]?.additions ?? 0) + (enriched[getKey(b)]?.deletions ?? 0)
                return bSize - aSize
            })
        } else {
            sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        }
        return sorted
    }

    return (
        <div className="h-full flex flex-col bg-[#0F0F13]">
            {/* Header */}
            <div className="shrink-0 border-b border-[#2A2A3A] bg-[#13131A]/60 px-5 py-3 flex items-center gap-3">
                <MessageSquare className="h-4 w-4 text-[#A78BFA]" />
                <h1 className="text-sm font-bold text-[#E2E8F0]">Code Reviews</h1>
                <div className="flex-1" />
                {enriching && (
                    <span className="text-[10px] text-[#6B7280] flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Enriching…
                    </span>
                )}
                <div className="flex items-center gap-1">
                    <ArrowUpDown className="h-3 w-3 text-[#6B7280]" />
                    {(['newest', 'oldest', 'largest'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setSortBy(s)}
                            className={cn(
                                "px-2 py-1 rounded text-[10px] font-bold capitalize transition-colors",
                                sortBy === s
                                    ? "bg-[#A78BFA]/20 text-[#A78BFA]"
                                    : "text-[#6B7280] hover:text-[#E2E8F0]"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadData(true)}
                    disabled={loading}
                    className="h-8 w-8 p-0 text-[#6B7280] hover:text-[#A78BFA]"
                    title="Refresh"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </Button>
                {lastUpdated && (
                    <span className="text-[10px] text-[#6B7280]">{formatTimeAgo(lastUpdated.toISOString())}</span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                {error && (
                    <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/40 text-xs text-red-300">{error}</div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 text-[#A78BFA] animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Awaiting My Review */}
                        <section>
                            {(() => {
                                const sorted = sortItems(reviewRequests)
                                const unacked = sorted.filter(item => !isAcknowledged(getKey(item)))
                                const acked = sorted.filter(item => isAcknowledged(getKey(item)))
                                return (
                                    <>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Eye className="h-3.5 w-3.5 text-amber-400" />
                                            <h2 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">Awaiting My Review</h2>
                                            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-400">
                                                {unacked.length}
                                            </span>
                                        </div>
                                        {unacked.length === 0 ? (
                                            <div className="text-center py-8 text-[#6B7280] text-xs bg-[#13131A] rounded-lg border border-[#2A2A3A]">
                                                No reviews pending — you're all caught up!
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {unacked.map(item => (
                                                    <ReviewItem
                                                        key={getKey(item)}
                                                        item={item}
                                                        enriched={enriched[getKey(item)]}
                                                        onAcknowledge={() => acknowledge(getKey(item))}
                                                        onSelect={() => setSelectedItem(selectedItem?.number === item.number && selectedItem?.repoFullName === item.repoFullName ? null : item)}
                                                        isSelected={selectedItem?.number === item.number && selectedItem?.repoFullName === item.repoFullName}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {acked.length > 0 && (
                                            <div className="mt-3">
                                                <button
                                                    onClick={() => setShowAcknowledged(v => !v)}
                                                    className="flex items-center gap-1.5 text-[10px] text-[#6B7280] hover:text-[#9CA3AF] transition-colors mb-2"
                                                >
                                                    <ChevronDown className={cn("h-3 w-3 transition-transform", showAcknowledged && "rotate-180")} />
                                                    <EyeOff className="h-3 w-3" />
                                                    {acked.length} dismissed
                                                </button>
                                                {showAcknowledged && (
                                                    <div className="space-y-2 opacity-50">
                                                        {acked.map(item => (
                                                            <ReviewItem
                                                                key={getKey(item)}
                                                                item={item}
                                                                enriched={enriched[getKey(item)]}
                                                                onAcknowledge={() => unacknowledge(getKey(item))}
                                                                onSelect={() => setSelectedItem(selectedItem?.number === item.number && selectedItem?.repoFullName === item.repoFullName ? null : item)}
                                                                isSelected={selectedItem?.number === item.number && selectedItem?.repoFullName === item.repoFullName}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )
                            })()}
                        </section>

                        {/* My Open PRs */}
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <GitPullRequest className="h-3.5 w-3.5 text-[#A78BFA]" />
                                <h2 className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">My Open PRs</h2>
                                <span className="px-1.5 py-0.5 rounded-full bg-[#A78BFA]/20 text-[10px] font-bold text-[#A78BFA]">
                                    {myPrs.length}
                                </span>
                            </div>
                            {myPrs.length === 0 ? (
                                <div className="text-center py-8 text-[#6B7280] text-xs bg-[#13131A] rounded-lg border border-[#2A2A3A]">
                                    No open pull requests
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sortItems(myPrs).map(item => (
                                        <ReviewItem
                                            key={getKey(item)}
                                            item={item}
                                            enriched={enriched[getKey(item)]}
                                            onSelect={() => setSelectedItem(selectedItem?.number === item.number && selectedItem?.repoFullName === item.repoFullName ? null : item)}
                                            isSelected={selectedItem?.number === item.number && selectedItem?.repoFullName === item.repoFullName}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
            {selectedItem && (() => {
                const [owner, repo] = selectedItem.repoFullName.split('/')
                return (
                    <PrDetailPanel
                        owner={owner}
                        repo={repo}
                        prNumber={selectedItem.number}
                        prTitle={selectedItem.title}
                        prHtmlUrl={selectedItem.htmlUrl}
                        onClose={() => setSelectedItem(null)}
                    />
                )
            })()}
            </div>
        </div>
    )
}

export default function CodeReviewsPage() {
    return (
        <GitHubScopeGuard>
            <CodeReviewsContent />
        </GitHubScopeGuard>
    )
}
