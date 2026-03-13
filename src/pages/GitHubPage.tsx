import { useState, useEffect, useCallback } from 'react'
import { GitHubScopeGuard } from '@/components/GitHubScopeGuard'
import { GitHubRepo, GitHubPullRequest, GitHubCommit, GitHubPrDetail, GitHubReview } from '@/types/github'
import {
    GitBranch, GitPullRequest, RefreshCw, Loader2, ExternalLink,
    ChevronDown, Check, X, Clock, CircleDot, Lock, Globe,
    Plus, Minus, FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
}

function summarizeReviews(reviews: GitHubReview[]) {
    // Only count the latest review per user (matches GitHub's own rule)
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

type Tab = 'pulls' | 'commits'

function GitHubContent() {
    const api = window.electronAPI

    const [repos, setRepos] = useState<GitHubRepo[]>([])
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
    const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
    const [loadingRepos, setLoadingRepos] = useState(true)

    const [prs, setPrs] = useState<GitHubPullRequest[]>([])
    const [commits, setCommits] = useState<GitHubCommit[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [activeTab, setActiveTab] = useState<Tab>('pulls')
    const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('open')
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Branch selector for commits tab
    const [branches, setBranches] = useState<{ name: string; sha: string }[]>([])
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
    const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)

    // Secondary data: reviews + CI status per PR
    const [prReviews, setPrReviews] = useState<Record<number, GitHubReview[]>>({})
    const [prCheckStatuses, setPrCheckStatuses] = useState<Record<number, string | null>>({})

    // Detail panel
    const [selectedPr, setSelectedPr] = useState<GitHubPullRequest | null>(null)
    const [prDetail, setPrDetail] = useState<GitHubPrDetail | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)

    // Load repos
    useEffect(() => {
        (async () => {
            try {
                const result = await api.githubGetRepos()
                if ('__isError' in result) {
                    setError(result.message)
                } else {
                    setRepos(result)
                    if (result.length > 0 && !selectedRepo) {
                        setSelectedRepo(result[0])
                    }
                }
            } catch (e: any) {
                setError(e.message)
            } finally {
                setLoadingRepos(false)
            }
        })()
    }, [])

    // Load PRs + commits + secondary data when repo/filter changes
    const loadRepoData = useCallback(async (repo: GitHubRepo, force = false, branch?: string | null) => {
        setLoadingData(true)
        setError(null)
        setPrReviews({})
        setPrCheckStatuses({})
        try {
            const [prResult, commitResult] = await Promise.all([
                api.githubGetPullRequests({ owner: repo.owner.login, repo: repo.name, state: prFilter, forceRefresh: force }),
                api.githubGetCommits({ owner: repo.owner.login, repo: repo.name, branch: branch ?? undefined, forceRefresh: force }),
            ])
            if ('__isError' in prResult) throw new Error(prResult.message)
            if ('__isError' in commitResult) throw new Error(commitResult.message)
            setPrs(prResult)
            setCommits(commitResult)
            setLastUpdated(new Date())

            // Fetch reviews + CI status for open PRs in parallel (best-effort, non-blocking)
            const openPrs = prResult.filter((p: GitHubPullRequest) => p.state === 'open')
            if (openPrs.length > 0) {
                const [reviewResults, checkResults] = await Promise.all([
                    Promise.allSettled(
                        openPrs.map((pr: GitHubPullRequest) =>
                            api.githubGetPrReviews({ owner: repo.owner.login, repo: repo.name, prNumber: pr.number })
                        )
                    ),
                    Promise.allSettled(
                        openPrs.map((pr: GitHubPullRequest) =>
                            api.githubGetPrCheckStatus({ owner: repo.owner.login, repo: repo.name, ref: pr.headBranch })
                        )
                    ),
                ])

                const reviewMap: Record<number, GitHubReview[]> = {}
                openPrs.forEach((pr: GitHubPullRequest, i: number) => {
                    const r = reviewResults[i]
                    if (r.status === 'fulfilled' && !('__isError' in r.value)) {
                        reviewMap[pr.number] = r.value as GitHubReview[]
                    }
                })
                setPrReviews(reviewMap)

                const checkMap: Record<number, string | null> = {}
                openPrs.forEach((pr: GitHubPullRequest, i: number) => {
                    const r = checkResults[i]
                    if (r.status === 'fulfilled' && (r.value === null || typeof r.value !== 'object' || !('__isError' in r.value))) {
                        checkMap[pr.number] = r.value as string | null
                    }
                })
                setPrCheckStatuses(checkMap)
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoadingData(false)
        }
    }, [api, prFilter])

    useEffect(() => {
        if (selectedRepo) {
            setSelectedPr(null)
            setPrDetail(null)
            setSelectedBranch(selectedRepo.defaultBranch)
            loadRepoData(selectedRepo)
            // Load branches for commit branch selector
            api.githubGetBranches({ owner: selectedRepo.owner.login, repo: selectedRepo.name }).then(result => {
                if (!('__isError' in result)) setBranches(result)
            })
        }
    }, [selectedRepo, prFilter])

    // Open PR detail panel
    const openPrDetail = async (pr: GitHubPullRequest) => {
        if (!selectedRepo) return
        setSelectedPr(pr)
        setPrDetail(null)
        setLoadingDetail(true)
        try {
            const detailResult = await api.githubGetPrDetail({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: pr.number })
            if (!('__isError' in detailResult)) setPrDetail(detailResult as GitHubPrDetail)
            // Fetch reviews if not already cached
            if (!prReviews[pr.number]) {
                const reviewResult = await api.githubGetPrReviews({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: pr.number })
                if (!('__isError' in reviewResult)) {
                    setPrReviews(prev => ({ ...prev, [pr.number]: reviewResult as GitHubReview[] }))
                }
            }
        } finally {
            setLoadingDetail(false)
        }
    }

    const checkStatusIcon = (status: string | null | undefined) => {
        if (status === 'success') return <Check className="h-3.5 w-3.5 text-emerald-400" />
        if (status === 'failure') return <X className="h-3.5 w-3.5 text-red-400" />
        if (status === 'pending') return <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
        return <CircleDot className="h-3.5 w-3.5 text-[#6B7280] opacity-40" />
    }

    const mergeableLabel = (state: string) => {
        if (state === 'clean') return { text: 'Ready to merge', cls: 'bg-emerald-500/15 text-emerald-400' }
        if (state === 'blocked') return { text: 'Merge blocked', cls: 'bg-red-500/15 text-red-400' }
        if (state === 'behind') return { text: 'Behind base branch', cls: 'bg-amber-500/15 text-amber-400' }
        if (state === 'dirty') return { text: 'Has conflicts', cls: 'bg-red-500/15 text-red-400' }
        return { text: state, cls: 'bg-[#2A2A3A] text-[#6B7280]' }
    }

    return (
        <div className="h-full flex flex-col bg-[#0F0F13]">
            {/* Header bar */}
            <div className="shrink-0 border-b border-[#2A2A3A] bg-[#13131A]/60 px-5 py-3 flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-[#A78BFA]" />
                <h1 className="text-sm font-bold text-[#E2E8F0]">GitHub</h1>
                <div className="flex-1" />

                {/* Repo selector */}
                <div className="relative">
                    <button
                        onClick={() => setRepoDropdownOpen(prev => !prev)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#2A2A3A] bg-[#1A1A24] hover:bg-[#252535] transition-colors text-xs font-semibold text-[#E2E8F0] min-w-[200px]"
                    >
                        {selectedRepo ? (
                            <>
                                {selectedRepo.private ? <Lock className="h-3 w-3 text-[#6B7280]" /> : <Globe className="h-3 w-3 text-[#6B7280]" />}
                                <span className="truncate flex-1 text-left">{selectedRepo.fullName}</span>
                            </>
                        ) : (
                            <span className="text-[#6B7280]">Select repository...</span>
                        )}
                        <ChevronDown className="h-3 w-3 text-[#6B7280] shrink-0" />
                    </button>
                    {repoDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setRepoDropdownOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-80 overflow-y-auto bg-[#1A1A24] border border-[#2A2A3A] rounded-lg shadow-xl custom-scrollbar">
                                {loadingRepos ? (
                                    <div className="p-4 flex items-center justify-center">
                                        <Loader2 className="h-4 w-4 text-[#A78BFA] animate-spin" />
                                    </div>
                                ) : repos.length === 0 ? (
                                    <div className="p-4 text-xs text-[#6B7280] text-center">No repositories found</div>
                                ) : repos.map(repo => (
                                    <button
                                        key={repo.id}
                                        onClick={() => { setSelectedRepo(repo); setRepoDropdownOpen(false) }}
                                        className={cn(
                                            "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#252535] transition-colors text-left",
                                            selectedRepo?.id === repo.id && "bg-[#2D2D3F]"
                                        )}
                                    >
                                        {repo.private ? <Lock className="h-3 w-3 text-[#6B7280] shrink-0" /> : <Globe className="h-3 w-3 text-[#6B7280] shrink-0" />}
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="font-semibold text-[#E2E8F0] truncate">{repo.fullName}</span>
                                            <span className="text-[10px] text-[#6B7280]">{repo.defaultBranch} · {formatTimeAgo(repo.updatedAt)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <Button
                    variant="ghost" size="sm"
                    onClick={() => selectedRepo && loadRepoData(selectedRepo, true)}
                    disabled={loadingData || !selectedRepo}
                    className="h-8 w-8 p-0 text-[#6B7280] hover:text-[#A78BFA]"
                    title="Refresh"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", loadingData && "animate-spin")} />
                </Button>
                {lastUpdated && (
                    <span className="text-[10px] text-[#6B7280]">{formatTimeAgo(lastUpdated.toISOString())}</span>
                )}
            </div>

            {/* Tabs */}
            <div className="shrink-0 border-b border-[#2A2A3A] bg-[#13131A]/40 px-5 flex items-center gap-1">
                {([['pulls', 'Pull Requests', GitPullRequest], ['commits', 'Commits', GitBranch]] as const).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id as Tab)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors",
                            activeTab === id
                                ? "border-[#A78BFA] text-[#A78BFA]"
                                : "border-transparent text-[#6B7280] hover:text-[#E2E8F0]"
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        {id === 'pulls' && prs.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#2A2A3A] text-[10px] font-bold">{prs.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content area — splits when detail panel is open */}
            <div className="flex-1 flex overflow-hidden">
                {/* Main scrollable area */}
                <div className={cn("overflow-y-auto custom-scrollbar transition-all duration-200", selectedPr ? "flex-1 min-w-0" : "w-full")}>
                    {error && (
                        <div className="m-4 p-3 rounded-lg bg-red-950/30 border border-red-900/40 text-xs text-red-300">{error}</div>
                    )}

                    {!selectedRepo && !loadingRepos && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                            <GitBranch className="h-10 w-10 text-[#6B7280] opacity-40" />
                            <p className="text-sm text-[#6B7280]">Select a repository to get started</p>
                        </div>
                    )}

                    {loadingData && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 text-[#A78BFA] animate-spin" />
                        </div>
                    )}

                    {!loadingData && selectedRepo && activeTab === 'pulls' && (
                        <div className="p-4 space-y-2">
                            {/* PR filter */}
                            <div className="flex items-center gap-1 mb-3">
                                {(['open', 'closed', 'all'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setPrFilter(f)}
                                        className={cn(
                                            "px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors",
                                            prFilter === f
                                                ? "bg-[#A78BFA]/20 text-[#A78BFA]"
                                                : "text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#252535]"
                                        )}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>

                            {prs.length === 0 ? (
                                <div className="text-center py-12 text-[#6B7280] text-xs">No pull requests found</div>
                            ) : prs.map(pr => {
                                const reviews = prReviews[pr.number]
                                const summary = reviews ? summarizeReviews(reviews) : null
                                const ciStatus = prCheckStatuses[pr.number] ?? pr.checkStatus
                                const isSelected = selectedPr?.number === pr.number

                                return (
                                    <button
                                        key={pr.number}
                                        onClick={() => openPrDetail(pr)}
                                        className={cn(
                                            "w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left group",
                                            isSelected
                                                ? "bg-[#1E1E2E] border-[#A78BFA]/40"
                                                : "bg-[#13131A] border-[#2A2A3A] hover:border-[#3D3D5F]"
                                        )}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            <GitPullRequest className={cn("h-4 w-4",
                                                pr.draft ? "text-[#6B7280]" :
                                                pr.state === 'open' ? "text-emerald-400" : "text-[#A78BFA]"
                                            )} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-xs font-semibold truncate transition-colors",
                                                    isSelected ? "text-[#A78BFA]" : "text-[#E2E8F0] group-hover:text-[#A78BFA]"
                                                )}>
                                                    {pr.title}
                                                </span>
                                                {pr.draft && (
                                                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[#2A2A3A] text-[#6B7280]">Draft</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#6B7280]">
                                                <span>#{pr.number}</span>
                                                <span>·</span>
                                                <span className="font-mono truncate max-w-[120px]">{pr.headBranch}</span>
                                                <span>→</span>
                                                <span className="font-mono">{pr.baseBranch}</span>
                                                <span>·</span>
                                                <span>{formatTimeAgo(pr.updatedAt)}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                <div className="flex items-center gap-1">
                                                    <img src={pr.authorAvatar} className="w-4 h-4 rounded-full" alt={pr.author} />
                                                    <span className="text-[11px] text-[#9CA3AF]">{pr.author}</span>
                                                </div>
                                                {(pr.additions > 0 || pr.deletions > 0) && (
                                                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                                        <span className="text-emerald-400 flex items-center gap-0.5"><Plus className="h-2.5 w-2.5" />{pr.additions}</span>
                                                        <span className="text-red-400 flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" />{pr.deletions}</span>
                                                        <span className="text-[#6B7280] flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{pr.changedFiles}</span>
                                                    </div>
                                                )}
                                                {/* Review summary badges */}
                                                {summary && (
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
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 mt-0.5 flex items-center gap-1.5">
                                            {checkStatusIcon(ciStatus)}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {!loadingData && selectedRepo && activeTab === 'commits' && (
                        <div className="p-4 space-y-1">
                            {/* Branch selector */}
                            {branches.length > 0 && (
                                <div className="relative mb-3">
                                    <button
                                        onClick={() => setBranchDropdownOpen(prev => !prev)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#2A2A3A] bg-[#13131A] hover:bg-[#1A1A24] transition-colors text-xs font-semibold text-[#E2E8F0] w-full"
                                    >
                                        <GitBranch className="h-3.5 w-3.5 text-[#A78BFA] shrink-0" />
                                        <span className="flex-1 text-left font-mono truncate">{selectedBranch ?? selectedRepo.defaultBranch}</span>
                                        <ChevronDown className="h-3 w-3 text-[#6B7280] shrink-0" />
                                    </button>
                                    {branchDropdownOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setBranchDropdownOpen(false)} />
                                            <div className="absolute left-0 top-full mt-1 z-50 w-full max-h-60 overflow-y-auto bg-[#1A1A24] border border-[#2A2A3A] rounded-lg shadow-xl custom-scrollbar">
                                                {branches.map(branch => (
                                                    <button
                                                        key={branch.name}
                                                        onClick={() => {
                                                            setSelectedBranch(branch.name)
                                                            setBranchDropdownOpen(false)
                                                            if (selectedRepo) loadRepoData(selectedRepo, true, branch.name)
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#252535] transition-colors text-left",
                                                            selectedBranch === branch.name && "bg-[#2D2D3F]"
                                                        )}
                                                    >
                                                        <GitBranch className="h-3 w-3 text-[#6B7280] shrink-0" />
                                                        <span className="font-mono text-[#E2E8F0] truncate flex-1">{branch.name}</span>
                                                        {branch.name === selectedRepo.defaultBranch && (
                                                            <span className="text-[9px] text-[#6B7280] bg-[#2A2A3A] px-1.5 rounded">default</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            {commits.length === 0 ? (
                                <div className="text-center py-12 text-[#6B7280] text-xs">No commits found</div>
                            ) : commits.map(commit => (
                                <button
                                    key={commit.sha}
                                    onClick={() => api.openUrl(commit.htmlUrl)}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#13131A] transition-colors text-left group"
                                >
                                    <code className="shrink-0 text-[11px] font-mono text-[#A78BFA] bg-[#A78BFA]/10 px-1.5 py-0.5 rounded">
                                        {commit.shortSha}
                                    </code>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs text-[#E2E8F0] truncate block">{commit.message.split('\n')[0]}</span>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2">
                                        {commit.authorAvatar && (
                                            <img src={commit.authorAvatar} className="w-4 h-4 rounded-full" alt={commit.authorLogin} />
                                        )}
                                        <span className="text-[11px] text-[#6B7280] whitespace-nowrap">{formatTimeAgo(commit.date)}</span>
                                        <ExternalLink className="h-3 w-3 text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail panel */}
                {selectedPr && (
                    <div className="w-[380px] shrink-0 border-l border-[#2A2A3A] flex flex-col bg-[#0D0D11] overflow-hidden">
                        {/* Panel header */}
                        <div className="shrink-0 border-b border-[#2A2A3A] px-4 py-3 flex items-center gap-2 bg-[#13131A]/60">
                            <span className="text-xs font-bold text-[#9CA3AF] shrink-0">#{selectedPr.number}</span>
                            <span className="text-xs font-semibold text-[#E2E8F0] flex-1 truncate">{selectedPr.title}</span>
                            <button
                                onClick={() => api.openUrl(selectedPr.htmlUrl)}
                                className="p-1.5 rounded hover:bg-[#252535] text-[#6B7280] hover:text-[#A78BFA] transition-colors shrink-0"
                                title="Open on GitHub"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => { setSelectedPr(null); setPrDetail(null) }}
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
                            ) : prDetail ? (
                                <>
                                    {/* Branch info */}
                                    <div className="flex items-center gap-2 text-[11px] text-[#6B7280]">
                                        <GitBranch className="h-3 w-3 shrink-0" />
                                        <code className="font-mono text-[#A78BFA] truncate">{prDetail.headBranch}</code>
                                        <span>→</span>
                                        <code className="font-mono truncate">{prDetail.baseBranch}</code>
                                        {prDetail.draft && (
                                            <span className="px-1.5 py-0.5 rounded bg-[#2A2A3A] text-[9px] font-bold uppercase text-[#6B7280] shrink-0">Draft</span>
                                        )}
                                    </div>

                                    {/* Mergeable state */}
                                    {prDetail.mergeableState && prDetail.mergeableState !== 'unknown' && (() => {
                                        const m = mergeableLabel(prDetail.mergeableState)
                                        return (
                                            <div className={cn("px-2.5 py-1.5 rounded text-[11px] font-semibold", m.cls)}>
                                                {m.text}
                                            </div>
                                        )
                                    })()}

                                    {/* CI status */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">CI</span>
                                        {checkStatusIcon(prCheckStatuses[selectedPr.number] ?? selectedPr.checkStatus)}
                                        <span className="text-[11px] text-[#9CA3AF] capitalize">
                                            {prCheckStatuses[selectedPr.number] ?? selectedPr.checkStatus ?? 'No checks'}
                                        </span>
                                    </div>

                                    {/* Diff stats */}
                                    {(prDetail.additions > 0 || prDetail.deletions > 0) && (
                                        <div className="flex items-center gap-3 text-[11px] font-mono p-2.5 rounded bg-[#13131A] border border-[#2A2A3A]">
                                            <span className="text-emerald-400">+{prDetail.additions}</span>
                                            <span className="text-red-400">−{prDetail.deletions}</span>
                                            <span className="text-[#6B7280]">{prDetail.changedFiles} file{prDetail.changedFiles !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}

                                    {/* Reviewers */}
                                    {prReviews[selectedPr.number]?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Reviewers</p>
                                            <div className="space-y-1.5">
                                                {Object.values(
                                                    prReviews[selectedPr.number].reduce((acc: Record<string, GitHubReview>, r) => {
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
                                    {selectedPr.requestedReviewers.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Awaiting review from</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedPr.requestedReviewers.map(reviewer => (
                                                    <span key={reviewer} className="px-2 py-0.5 rounded-full bg-[#2A2A3A] text-[10px] text-[#9CA3AF]">
                                                        {reviewer}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* PR body */}
                                    {prDetail.body && (
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">Description</p>
                                            <p className="text-[11px] text-[#9CA3AF] whitespace-pre-wrap leading-relaxed break-words">
                                                {prDetail.body.length > 800 ? prDetail.body.slice(0, 800) + '…' : prDetail.body}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-8 text-[#6B7280] text-xs">Failed to load details</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function GitHubPage() {
    return (
        <GitHubScopeGuard>
            <GitHubContent />
        </GitHubScopeGuard>
    )
}
