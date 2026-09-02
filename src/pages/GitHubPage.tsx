import { useState, useEffect, useCallback } from 'react'
import { GitHubScopeGuard } from '@/components/GitHubScopeGuard'
import { GitHubRepo, GitHubPullRequest, GitHubCommit, GitHubPrDetail, GitHubReview, GitHubComment, GitHubDeployment } from '@/types/github'
import { useGitHubRepos } from '@/hooks/useGitHubRepos'
import { useListKeyboardNav } from '@/hooks/useListKeyboardNav'
import {
    GitBranch, GitPullRequest, RefreshCw, Loader2, ExternalLink,
    ChevronDown, X, Search,
    Plus, Minus, FileText, Rocket, Sparkles, Zap, CheckCircle2,
    MessageSquare, Tag
} from 'lucide-react'
import { cn, formatTimeAgo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PrAnalysisCard } from '@/components/github/PrAnalysisCard'
import { RepoSelector } from '@/components/github/RepoSelector'
import { CheckStatusIcon, mergeableLabel, ReviewSummaryBadges } from '@/components/github/StatusBadges'
import { SubtabBar } from '@/components/ui/subtab-bar'
import { FullBleedHeader } from '@/components/ui/workspace'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { sanitizeProjectForQaAi } from '@/lib/aiUtils'
import { useProjectStore } from '@/store/useProjectStore'
import { aiAnalyzePullRequest } from '@/lib/aiClient'
import { toast } from 'sonner'

type Tab = 'pulls' | 'commits'

const DESCRIPTION_TRUNCATE_LENGTH = 800

function PrDescription({ body }: { body: string }) {
    const [expanded, setExpanded] = useState(false)
    const isLong = body.length > DESCRIPTION_TRUNCATE_LENGTH

    return (
        <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-ui mb-2">Description</p>
            <p className="text-[11px] text-soft whitespace-pre-wrap leading-relaxed break-words">
                {isLong && !expanded ? body.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + '…' : body}
            </p>
            {isLong && (
                <button
                    onClick={() => setExpanded(prev => !prev)}
                    className="mt-1.5 text-[11px] font-semibold text-brand hover:text-qa-accent transition-colors"
                >
                    {expanded ? 'Show less' : 'Show more'}
                </button>
            )}
        </div>
    )
}

function GitHubContent() {
    const api = window.electronAPI
    const { repos, selectedRepo, setSelectedRepo, loading: loadingRepos, error: repoError } = useGitHubRepos()
    const { projects, activeProjectId, addTestPlan, batchAddTestCasesToPlan } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

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
    // Deployment status per PR head branch
    const [branchDeployments, setBranchDeployments] = useState<Record<string, GitHubDeployment>>({})
    const [prCheckStatuses, setPrCheckStatuses] = useState<Record<number, string | null>>({})

    // PR search
    const [prSearch, setPrSearch] = useState('')

    // PR Analysis
    const [analysisLoading, setAnalysisLoading] = useState(false)
    const [prAnalysisResult, setPrAnalysisResult] = useState<Awaited<ReturnType<typeof api.aiAnalyzePullRequest>> | null>(null)
    const [selectedImpactedIds, setSelectedImpactedIds] = useState<Set<string>>(new Set())
    const [buildingRegression, setBuildingRegression] = useState(false)

    // Detail panel
    const [selectedPr, setSelectedPr] = useState<GitHubPullRequest | null>(null)
    const [prDetail, setPrDetail] = useState<GitHubPrDetail | null>(null)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [prComments, setPrComments] = useState<GitHubComment[]>([])
    const [loadingComments, setLoadingComments] = useState(false)

    // QA write actions
    const [qaCommentText, setQaCommentText] = useState('')
    const [qaCommentExpanded, setQaCommentExpanded] = useState(false)
    const [postingComment, setPostingComment] = useState(false)
    const [labelDropdownOpen, setLabelDropdownOpen] = useState(false)
    const [applyingLabel, setApplyingLabel] = useState<string | null>(null)
    const projectTestCases = activeProject?.testPlans.flatMap(tp => tp.testCases || []) || []

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
            setPrs(prResult)
            setCommits(commitResult)
            setLastUpdated(new Date())

            // Fetch reviews + CI status for open PRs in parallel (best-effort, non-blocking)
            const openPrs = prResult.filter((p: GitHubPullRequest) => p.state === 'open')
            if (openPrs.length > 0) {
                const [reviewResults, checkResults, deployResult] = await Promise.all([
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
                    api.githubGetDeployments({ owner: repo.owner.login, repo: repo.name }),
                ])

                const reviewMap: Record<number, GitHubReview[]> = {}
                openPrs.forEach((pr: GitHubPullRequest, i: number) => {
                    const r = reviewResults[i]
                    if (r.status === 'fulfilled') {
                        reviewMap[pr.number] = r.value
                    }
                })
                setPrReviews(reviewMap)

                const checkMap: Record<number, string | null> = {}
                openPrs.forEach((pr: GitHubPullRequest, i: number) => {
                    const r = checkResults[i]
                    if (r.status === 'fulfilled') {
                        checkMap[pr.number] = r.value
                    }
                })
                setPrCheckStatuses(checkMap)

                // Map most recent deployment per branch
                const deployMap: Record<string, GitHubDeployment> = {}
                deployResult.forEach(d => {
                    if (!deployMap[d.ref] || d.createdAt > deployMap[d.ref].createdAt) {
                        deployMap[d.ref] = d
                    }
                })
                setBranchDeployments(deployMap)
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
            api.githubGetBranches({ owner: selectedRepo.owner.login, repo: selectedRepo.name })
                .then(result => setBranches(result))
                .catch(() => { /* non-fatal */ })
        }
    }, [selectedRepo, prFilter])

    // Open PR detail panel
    const openPrDetail = async (pr: GitHubPullRequest) => {
        if (!selectedRepo) return
        setSelectedPr(pr)
        setPrDetail(null)
        setPrComments([])
        setPrAnalysisResult(null)
        setSelectedImpactedIds(new Set())
        setLoadingDetail(true)
        setLoadingComments(true)
        try {
            const detailResult = await api.githubGetPrDetail({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: pr.number })
            setPrDetail(detailResult)
            // Fetch reviews if not already cached
            if (!prReviews[pr.number]) {
                const reviewResult = await api.githubGetPrReviews({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: pr.number })
                setPrReviews(prev => ({ ...prev, [pr.number]: reviewResult }))
            }
        } finally {
            setLoadingDetail(false)
        }
        // Fetch comments (non-blocking)
        try {
            const commentsResult = await api.githubGetPrComments({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: pr.number })
            setPrComments(commentsResult)
        } finally {
            setLoadingComments(false)
        }
    }

    const handleAnalyzePullRequest = async () => {
        if (!selectedPr || !selectedRepo || !activeProject) return
        const allTestCases = projectTestCases.map(tc => ({
            id: tc.id, title: tc.title, sapModule: tc.sapModule, components: tc.components, tags: tc.tags,
        }))
        setAnalysisLoading(true)
        try {
            const detail = prDetail || await api.githubGetPrDetail({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: selectedPr.number })
            const result = await aiAnalyzePullRequest({
                pr: {
                    number: selectedPr.number,
                    title: selectedPr.title,
                    description: detail?.body || '',
                    baseBranch: detail?.baseBranch || selectedPr.baseBranch,
                    headBranch: detail?.headBranch || selectedPr.headBranch,
                    ciStatus: prCheckStatuses[selectedPr.number] ?? selectedPr.checkStatus,
                    mergeableState: detail?.mergeableState,
                    files: detail?.files || [],
                    reviews: prReviews[selectedPr.number] || [],
                    comments: prComments,
                },
                testCases: allTestCases,
                project: sanitizeProjectForQaAi(activeProject ?? undefined),
            })
            setPrAnalysisResult(result)
            setSelectedImpactedIds(new Set(result.impactedCaseIds))
        } catch (err: any) {
            toast.error('PR analysis failed: ' + err.message)
        } finally {
            setAnalysisLoading(false)
        }
    }

    const handleBuildImpactRegressionSuite = async () => {
        if (!activeProjectId || !activeProject || selectedImpactedIds.size === 0 || !selectedPr) return
        setBuildingRegression(true)
        try {
            const selectedCases = projectTestCases.filter(tc => selectedImpactedIds.has(tc.id))
            const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            const planName = `PR #${selectedPr.number} Regression Suite · ${ts}`
            const planId = await addTestPlan(activeProjectId, planName, `Auto-generated from PR analysis for #${selectedPr.number}: ${selectedPr.title}`, true, 'manual')
            await batchAddTestCasesToPlan(activeProjectId, planId, selectedCases.map(tc => ({
                title: tc.title, preConditions: tc.preConditions, steps: tc.steps, testData: tc.testData,
                expectedResult: tc.expectedResult, actualResult: '', priority: tc.priority, status: 'not-run', sapModule: tc.sapModule, sourceIssueId: tc.sourceIssueId,
            })))
            toast.success(`Created "${planName}" with ${selectedCases.length} test cases.`)
            setPrAnalysisResult(null)
            setSelectedImpactedIds(new Set())
        } catch (err: any) {
            toast.error('Failed to create regression suite: ' + err.message)
        } finally {
            setBuildingRegression(false)
        }
    }

    const impactLoading = analysisLoading
    const impactResult = prAnalysisResult
        ? {
            impactedCaseIds: prAnalysisResult.impactedCaseIds,
            affectedModules: prAnalysisResult.affectedAreas,
            rationale: prAnalysisResult.rationale || prAnalysisResult.summary,
        }
        : null
    const impactSelectedIds = selectedImpactedIds
    const setImpactSelectedIds = setSelectedImpactedIds
    const handleTestImpactAnalysis = handleAnalyzePullRequest

    const filteredPrs = prSearch.trim()
        ? prs.filter(pr => {
            const q = prSearch.toLowerCase()
            return pr.title.toLowerCase().includes(q) ||
                `#${pr.number}`.includes(q) ||
                pr.author.toLowerCase().includes(q) ||
                pr.headBranch.toLowerCase().includes(q) ||
                pr.labels.some(l => l.name.toLowerCase().includes(q))
        })
        : prs

    const keyboardItems: Array<GitHubPullRequest | GitHubCommit> = activeTab === 'pulls' ? filteredPrs : commits

    const QA_LABELS = ['qa-approved', 'qa-blocked', 'needs-retest'] as const

    const handlePostQaComment = async () => {
        if (!selectedRepo || !selectedPr || !qaCommentText.trim()) return
        setPostingComment(true)
        try {
            await api.githubAddPrComment({
                owner: selectedRepo.owner.login,
                repo: selectedRepo.name,
                prNumber: selectedPr.number,
                body: qaCommentText.trim(),
            })
            toast.success('Comment posted')
            setQaCommentText('')
            setQaCommentExpanded(false)
            const updated = await api.githubGetPrComments({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: selectedPr.number })
            setPrComments(updated)
        } catch (e: any) {
            toast.error(e.message ?? 'Failed to post comment')
        } finally {
            setPostingComment(false)
        }
    }

    const handleApplyQaLabel = async (labelName: string) => {
        if (!selectedRepo || !selectedPr) return
        setApplyingLabel(labelName)
        setLabelDropdownOpen(false)
        try {
            const alreadyApplied = (prDetail?.labels ?? selectedPr.labels ?? []).some((l: any) => l.name === labelName)
            if (alreadyApplied) {
                await api.githubRemovePrLabel({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: selectedPr.number, labelName })
                toast.success(`Label "${labelName}" removed`)
            } else {
                await api.githubAddPrLabels({ owner: selectedRepo.owner.login, repo: selectedRepo.name, prNumber: selectedPr.number, labelNames: [labelName] })
                toast.success(`Label "${labelName}" applied`)
            }
            // Refresh PR list to reflect label change
            const refreshed = await api.githubGetPullRequests({ owner: selectedRepo.owner.login, repo: selectedRepo.name, state: prFilter, forceRefresh: true })
            setPrs(refreshed)
            // Update prDetail labels locally
            if (prDetail) {
                const currentLabels: any[] = prDetail.labels ?? []
                const newLabels = alreadyApplied
                    ? currentLabels.filter((l: any) => l.name !== labelName)
                    : [...currentLabels, { name: labelName, color: '5319e7' }]
                setPrDetail({ ...prDetail, labels: newLabels })
            }
        } catch (e: any) {
            toast.error(e.message ?? 'Failed to update label')
        } finally {
            setApplyingLabel(null)
        }
    }

    const { activeIndex: kbIndex } = useListKeyboardNav<GitHubPullRequest | GitHubCommit>({
        items: keyboardItems,
        enabled: !loadingData,
        onSelect: (item) => {
            if (activeTab === 'pulls') openPrDetail(item as GitHubPullRequest)
        },
        onOpen: (item) => {
            if (activeTab === 'pulls') {
                api.openUrl((item as GitHubPullRequest).htmlUrl)
            } else {
                api.openUrl((item as GitHubCommit).htmlUrl)
            }
        },
        onEscape: () => { setSelectedPr(null); setPrDetail(null) },
    })

    return (
        <div className="h-full flex flex-col bg-app">
            {/* Header bar */}
            <FullBleedHeader
                icon={GitBranch}
                title="GitHub"
                actions={
                    <>
                        <RepoSelector
                            repos={repos}
                            selectedRepo={selectedRepo}
                            onSelect={setSelectedRepo}
                            loading={loadingRepos}
                        />
                        <Button
                            variant="ghost" size="sm"
                            onClick={() => selectedRepo && loadRepoData(selectedRepo, true)}
                            disabled={loadingData || !selectedRepo}
                            className="h-8 w-8 p-0 text-muted-ui hover:text-brand"
                            title="Refresh"
                            aria-label="Refresh"
                        >
                            <RefreshCw aria-hidden="true" className={cn("h-3.5 w-3.5", loadingData && "animate-spin")} />
                        </Button>
                        {lastUpdated && (
                            <span className="text-[11px] text-muted-ui">{formatTimeAgo(lastUpdated.toISOString())}</span>
                        )}
                    </>
                }
            />

            {/* Tabs */}
            <div className="shrink-0 border-b app-divider bg-[hsl(var(--surface-header)/0.62)] px-5 py-3">
                <SubtabBar
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as Tab)}
                    items={[
                        { id: 'pulls', label: 'Pull Requests', icon: GitPullRequest, count: prs.length || undefined },
                        { id: 'commits', label: 'Commits', icon: GitBranch },
                    ]}
                />
            </div>

            {/* Content area — splits when detail panel is open */}
            <div className="flex-1 flex overflow-hidden">
                {/* Main scrollable area */}
                <div className={cn("overflow-y-auto custom-scrollbar transition-all duration-200", selectedPr ? "flex-1 min-w-0" : "w-full")}>
                    {(error || repoError) && (
                        <div className="m-4 p-3 rounded-lg bg-state-danger-soft border border-state-danger-border text-xs text-state-danger flex items-center justify-between gap-3">
                            <span>{error || repoError}</span>
                            {selectedRepo && (
                                <button
                                    className="shrink-0 px-2 py-1 rounded bg-state-danger-soft hover:bg-state-danger-soft text-state-danger font-medium"
                                    onClick={() => { setError(null); loadRepoData(selectedRepo, true) }}
                                >
                                    Retry
                                </button>
                            )}
                        </div>
                    )}

                    {!selectedRepo && !loadingRepos && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                            <GitBranch className="h-10 w-10 text-muted-ui opacity-40" />
                            <p className="text-sm text-muted-ui">Select a repository to get started</p>
                        </div>
                    )}

                    {loadingData && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 text-brand animate-spin" />
                        </div>
                    )}

                    {!loadingData && selectedRepo && activeTab === 'pulls' && (
                        <div className="p-4 space-y-2">
                            {/* PR filter + search */}
                            <div className="flex items-center gap-2 mb-3">
                                <SegmentedControl
                                    value={prFilter}
                                    onChange={(value) => setPrFilter(value as 'open' | 'closed' | 'all')}
                                    options={(['open', 'closed', 'all'] as const).map((item) => ({ value: item, label: item }))}
                                />
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-ui pointer-events-none" />
                                    <input
                                        type="text"
                                        aria-label="Search pull requests"
                                        placeholder="Filter by title, author, branch, label…"
                                        value={prSearch}
                                        onChange={e => setPrSearch(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 rounded-md bg-panel border border-ui text-xs text-foreground placeholder-text-muted focus:outline-none focus:border-qa-accent/60 transition-colors"
                                    />
                                </div>
                            </div>

                            {filteredPrs.length === 0 ? (
                                <div className="text-center py-12 text-muted-ui text-xs">
                                    {prSearch ? 'No matching pull requests' : 'No pull requests found'}
                                </div>
                            ) : filteredPrs.map((pr, idx) => {
                                const reviews = prReviews[pr.number]
                                const ciStatus = prCheckStatuses[pr.number] ?? pr.checkStatus
                                const isSelected = selectedPr?.number === pr.number
                                const isKbActive = activeTab === 'pulls' && kbIndex === idx

                                return (
                                    <button
                                        key={pr.number}
                                        onClick={() => openPrDetail(pr)}
                                        className={cn(
                                            "w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left group",
                                            isSelected
                                                ? "bg-panel-muted border-qa-accent/40"
                                                : isKbActive
                                                ? "bg-panel-muted border-ui-strong"
                                                : "bg-panel border-ui hover:border-ui-strong"
                                        )}
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            <GitPullRequest className={cn("h-4 w-4",
                                                pr.draft ? "text-muted-ui" :
                                                pr.state === 'open' ? "text-state-success" : "text-brand"
                                            )} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-xs font-semibold truncate transition-colors",
                                                    isSelected ? "text-brand" : "text-foreground group-hover:text-qa-accent"
                                                )}>
                                                    {pr.title}
                                                </span>
                                                {pr.draft && (
                                                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold uppercase bg-elevated text-muted-ui">Draft</span>
                                                )}
                                                {pr.labels?.map(label => (
                                                    <span
                                                        key={label.name}
                                                        className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-bold"
                                                        style={{
                                                            backgroundColor: `#${label.color}20`,
                                                            color: `#${label.color}`,
                                                        }}
                                                    >
                                                        {label.name}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-ui">
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
                                                    <span className="text-[11px] text-soft">{pr.author}</span>
                                                </div>
                                                {(pr.additions > 0 || pr.deletions > 0) && (
                                                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                                                        <span className="text-state-success flex items-center gap-0.5"><Plus className="h-2.5 w-2.5" />{pr.additions}</span>
                                                        <span className="text-state-danger flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" />{pr.deletions}</span>
                                                        <span className="text-muted-ui flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{pr.changedFiles}</span>
                                                    </div>
                                                )}
                                                {/* Review summary badges */}
                                                {reviews && reviews.length > 0 && (
                                                    <ReviewSummaryBadges reviews={reviews} />
                                                )}
                                                {/* Deployment badge */}
                                                {branchDeployments[pr.headBranch] && (() => {
                                                    const dep = branchDeployments[pr.headBranch]
                                                    const depState = dep.latestStatus?.state
                                                    const depColor = depState === 'success' ? 'text-state-success' :
                                                        depState === 'failure' || depState === 'error' ? 'text-state-danger' :
                                                        depState === 'in_progress' ? 'text-state-warning' : 'text-muted-ui'
                                                    return (
                                                        <div className={cn("flex items-center gap-1 text-[11px]", depColor)}>
                                                            <Rocket className="h-2.5 w-2.5 shrink-0" />
                                                            <span>{dep.environment}</span>
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                        <div className="shrink-0 mt-0.5 flex items-center gap-1.5">
                                            <CheckStatusIcon status={ciStatus} />
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
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-ui bg-panel hover:bg-elevated transition-colors text-xs font-semibold text-foreground w-full"
                                    >
                                        <GitBranch className="h-3.5 w-3.5 text-brand shrink-0" />
                                        <span className="flex-1 text-left font-mono truncate">{selectedBranch ?? selectedRepo.defaultBranch}</span>
                                        <ChevronDown className="h-3 w-3 text-muted-ui shrink-0" />
                                    </button>
                                    {branchDropdownOpen && (
                                        <>
                                            <div className="fixed inset-0 z-layer-sticky" onClick={() => setBranchDropdownOpen(false)} />
                                            <div className="absolute left-0 top-full mt-1 z-50 w-full max-h-60 overflow-y-auto bg-panel-muted border border-ui rounded-lg shadow-xl custom-scrollbar">
                                                {branches.map(branch => (
                                                    <button
                                                        key={branch.name}
                                                        onClick={() => {
                                                            setSelectedBranch(branch.name)
                                                            setBranchDropdownOpen(false)
                                                            if (selectedRepo) loadRepoData(selectedRepo, true, branch.name)
                                                        }}
                                                        className={cn(
                                                            "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-elevated transition-colors text-left",
                                                            selectedBranch === branch.name && "bg-selected"
                                                        )}
                                                    >
                                                        <GitBranch className="h-3 w-3 text-muted-ui shrink-0" />
                                                        <span className="font-mono text-foreground truncate flex-1">{branch.name}</span>
                                                        {branch.name === selectedRepo.defaultBranch && (
                                                            <span className="text-[11px] text-muted-ui bg-elevated px-1.5 rounded">default</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            {commits.length === 0 ? (
                                <div className="text-center py-12 text-muted-ui text-xs">No commits found</div>
                            ) : commits.map(commit => (
                                <button
                                    key={commit.sha}
                                    onClick={() => api.openUrl(commit.htmlUrl)}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-panel transition-colors text-left group"
                                >
                                    <code className="shrink-0 text-[11px] font-mono text-brand bg-qa-accent/10 px-1.5 py-0.5 rounded">
                                        {commit.shortSha}
                                    </code>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs text-foreground truncate block">{commit.message.split('\n')[0]}</span>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2">
                                        {commit.authorAvatar && (
                                            <img src={commit.authorAvatar} className="w-4 h-4 rounded-full" alt={commit.authorLogin} />
                                        )}
                                        <span className="text-[11px] text-muted-ui whitespace-nowrap">{formatTimeAgo(commit.date)}</span>
                                        <ExternalLink className="h-3 w-3 text-muted-ui opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail panel */}
                {selectedPr && (
                    <div className="w-[380px] shrink-0 border-l border-ui flex flex-col bg-app overflow-hidden">
                        {/* Panel header */}
                        <div className="shrink-0 border-b border-ui px-4 py-3 flex items-center gap-2 bg-surface/60">
                            <span className="text-xs font-bold text-soft shrink-0">#{selectedPr.number}</span>
                            <span className="text-xs font-semibold text-foreground flex-1 truncate">{selectedPr.title}</span>
                            <button
                                onClick={() => api.openUrl(selectedPr.htmlUrl)}
                                className="p-1.5 rounded hover:bg-elevated text-muted-ui hover:text-brand transition-colors shrink-0"
                                title="Open on GitHub"
                                aria-label="Open on GitHub"
                            >
                                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => { setSelectedPr(null); setPrDetail(null) }}
                                className="p-1.5 rounded hover:bg-elevated text-muted-ui hover:text-foreground transition-colors shrink-0"
                                title="Close"
                                aria-label="Close"
                            >
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {/* Panel content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                            {loadingDetail ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-5 w-5 text-brand animate-spin" />
                                </div>
                            ) : prDetail ? (
                                <>
                                    {/* Branch info */}
                                    <div className="flex items-center gap-2 text-[11px] text-muted-ui">
                                        <GitBranch className="h-3 w-3 shrink-0" />
                                        <code className="font-mono text-brand truncate">{prDetail.headBranch}</code>
                                        <span>→</span>
                                        <code className="font-mono truncate">{prDetail.baseBranch}</code>
                                        {prDetail.draft && (
                                            <span className="px-1.5 py-0.5 rounded bg-elevated text-[11px] font-bold uppercase text-muted-ui shrink-0">Draft</span>
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
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-ui">CI</span>
                                        <CheckStatusIcon status={prCheckStatuses[selectedPr.number] ?? selectedPr.checkStatus} />
                                        <span className="text-[11px] text-soft capitalize">
                                            {prCheckStatuses[selectedPr.number] ?? selectedPr.checkStatus ?? 'No checks'}
                                        </span>
                                    </div>

                                    {/* Diff stats */}
                                    {(prDetail.additions > 0 || prDetail.deletions > 0) && (
                                        <div className="flex items-center gap-3 text-[11px] font-mono p-2.5 rounded bg-panel border border-ui">
                                            <span className="text-state-success">+{prDetail.additions}</span>
                                            <span className="text-state-danger">−{prDetail.deletions}</span>
                                            <span className="text-muted-ui">{prDetail.changedFiles} file{prDetail.changedFiles !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}

                                    {/* Reviewers */}
                                    {prReviews[selectedPr.number]?.length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-ui mb-2">Reviewers</p>
                                            <div className="space-y-1.5">
                                                {Object.values(
                                                    prReviews[selectedPr.number].reduce((acc: Record<string, GitHubReview>, r) => {
                                                        if (!acc[r.user] || r.submittedAt > acc[r.user].submittedAt) acc[r.user] = r
                                                        return acc
                                                    }, {})
                                                ).map(r => (
                                                    <div key={r.user} className="flex items-center gap-2">
                                                        <img src={r.userAvatar} className="w-5 h-5 rounded-full shrink-0" alt={r.user} />
                                                        <span className="text-[11px] text-foreground flex-1 truncate">{r.user}</span>
                                                        <span className={cn("text-[11px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0",
                                                            r.state === 'APPROVED' ? 'bg-state-success/20 text-state-success' :
                                                            r.state === 'CHANGES_REQUESTED' ? 'bg-state-danger/20 text-state-danger' :
                                                            r.state === 'COMMENTED' ? 'bg-qa-accent/20 text-brand' :
                                                            'bg-elevated text-muted-ui'
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
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-ui mb-2">Awaiting review from</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedPr.requestedReviewers.map(reviewer => (
                                                    <span key={reviewer} className="px-2 py-0.5 rounded-full bg-elevated text-[11px] text-soft">
                                                        {reviewer}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* PR body */}
                                    {prDetail.body && (
                                        <PrDescription body={prDetail.body} />
                                    )}

                                    <PrAnalysisCard
                                        analysis={prAnalysisResult}
                                        isAnalyzing={analysisLoading}
                                        onAnalyze={handleAnalyzePullRequest}
                                        projectTestCases={projectTestCases}
                                        selectedImpactedIds={selectedImpactedIds}
                                        onToggleImpactedId={(id) => setSelectedImpactedIds(prev => {
                                            const next = new Set(prev)
                                            if (next.has(id)) next.delete(id)
                                            else next.add(id)
                                            return next
                                        })}
                                        onBuildRegressionSuite={handleBuildImpactRegressionSuite}
                                        isBuildingRegressionSuite={buildingRegression}
                                    />

                                    {/* Test Impact Analysis */}
                                    <div className="hidden rounded-xl border border-ui bg-app overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 border-b border-ui">
                                            <div className="flex items-center gap-2">
                                                <Sparkles className="h-3.5 w-3.5 text-brand" />
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-ui">Test Impact</span>
                                                {impactResult && (
                                                    <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 rounded bg-qa-accent/10 text-brand">
                                                        {impactResult.impactedCaseIds.length} impacted
                                                    </span>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleTestImpactAnalysis}
                                                disabled={impactLoading}
                                                className="h-7 text-[11px] font-bold text-brand hover:bg-qa-accent/10 gap-1"
                                            >
                                                {impactLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                                {impactLoading ? 'Analyzing…' : 'Analyze'}
                                            </Button>
                                        </div>
                                        {impactResult && (
                                            <div className="p-3 space-y-3">
                                                {impactResult.affectedModules.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {impactResult.affectedModules.map(m => (
                                                            <span key={m} className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-state-info-soft text-state-info uppercase">{m}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {impactResult.rationale && (
                                                    <p className="text-[11px] text-soft leading-relaxed">{impactResult.rationale}</p>
                                                )}
                                                {impactResult.impactedCaseIds.length > 0 ? (
                                                    <>
                                                        <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                                            {activeProject?.testPlans.flatMap(tp => tp.testCases || [])
                                                                .filter(tc => impactResult.impactedCaseIds.includes(tc.id))
                                                                .map(tc => (
                                                                    <label key={tc.id} className="flex items-center gap-2 cursor-pointer group">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={impactSelectedIds.has(tc.id)}
                                                                            onChange={() => setImpactSelectedIds(prev => {
                                                                                const next = new Set(prev)
                                                                                if (next.has(tc.id)) next.delete(tc.id); else next.add(tc.id)
                                                                                return next
                                                                            })}
                                                                            className="accent-qa-accent"
                                                                        />
                                                                        <span className="text-[11px] text-foreground group-hover:text-qa-accent transition-colors truncate">
                                                                            {tc.displayId} — {tc.title}
                                                                        </span>
                                                                    </label>
                                                                ))
                                                            }
                                                        </div>
                                                        <Button
                                                            onClick={handleBuildImpactRegressionSuite}
                                                            disabled={buildingRegression || impactSelectedIds.size === 0}
                                                            className="w-full h-8 bg-primary text-primary-foreground hover:bg-[hsl(var(--accent-primary-strong))] text-[11px] font-bold gap-2"
                                                        >
                                                            {buildingRegression ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                                            {buildingRegression ? 'Building...' : `Build Regression Suite (${impactSelectedIds.size})`}
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-2 py-1">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-state-success" />
                                                        <span className="text-[11px] text-state-success">No test cases identified as impacted.</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Comments */}
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-ui mb-2">
                                            Comments {prComments.length > 0 && `(${prComments.length})`}
                                        </p>
                                        {loadingComments ? (
                                            <div className="flex items-center gap-2 py-2">
                                                <Loader2 className="h-3 w-3 text-brand animate-spin" />
                                                <span className="text-[11px] text-muted-ui">Loading comments…</span>
                                            </div>
                                        ) : prComments.length === 0 ? (
                                            <p className="text-[11px] text-muted-ui">No comments</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {prComments.map(comment => (
                                                    <div key={comment.id} className="p-2.5 rounded-lg bg-panel border border-ui">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <img src={comment.userAvatar} className="w-4 h-4 rounded-full" alt={comment.user} />
                                                            <span className="text-[11px] font-semibold text-foreground">{comment.user}</span>
                                                            <span className="text-[11px] text-muted-ui">{formatTimeAgo(comment.createdAt)}</span>
                                                        </div>
                                                        <p className="text-[11px] text-soft whitespace-pre-wrap break-words leading-relaxed">
                                                            {comment.body.length > 500 ? comment.body.slice(0, 500) + '…' : comment.body}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* QA Actions */}
                                    <div className="pt-4 border-t border-ui space-y-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-brand">QA Actions</p>

                                        {/* Post QA Comment */}
                                        <div>
                                            {!qaCommentExpanded ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full text-[11px] border-ui text-soft hover:text-foreground hover:border-qa-accent/50"
                                                    onClick={() => setQaCommentExpanded(true)}
                                                >
                                                    <MessageSquare className="h-3 w-3 mr-1.5" />
                                                    Add QA Comment
                                                </Button>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={qaCommentText}
                                                        onChange={e => setQaCommentText(e.target.value)}
                                                        placeholder="Write a QA comment…"
                                                        className="text-[11px] min-h-[72px] resize-none bg-panel border-ui text-foreground placeholder:text-muted-ui focus:border-qa-accent/50"
                                                        onKeyDown={e => {
                                                            if (e.key === 'Escape') { setQaCommentExpanded(false); setQaCommentText('') }
                                                        }}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="flex-1 text-[11px] bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold"
                                                            onClick={handlePostQaComment}
                                                            disabled={postingComment || !qaCommentText.trim()}
                                                        >
                                                            {postingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-[11px] border-ui text-soft"
                                                            onClick={() => { setQaCommentExpanded(false); setQaCommentText('') }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* QA Labels */}
                                        <div className="relative">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full text-[11px] border-ui text-soft hover:text-foreground hover:border-qa-accent/50"
                                                onClick={() => setLabelDropdownOpen(v => !v)}
                                                disabled={!!applyingLabel}
                                            >
                                                {applyingLabel ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Tag className="h-3 w-3 mr-1.5" />}
                                                QA Label
                                                <ChevronDown className="h-3 w-3 ml-auto" />
                                            </Button>
                                            {labelDropdownOpen && (
                                                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-panel-muted border border-ui rounded-xl shadow-xl overflow-hidden">
                                                    {QA_LABELS.map(label => {
                                                        const applied = (prDetail?.labels ?? selectedPr?.labels ?? []).some((l: any) => l.name === label)
                                                        return (
                                                            <button
                                                                key={label}
                                                                className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-foreground hover:bg-elevated transition-colors"
                                                                onClick={() => handleApplyQaLabel(label)}
                                                            >
                                                                <span>{label}</span>
                                                                {applied && <CheckCircle2 className="h-3 w-3 text-state-success" />}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Current QA labels */}
                                        {(prDetail?.labels ?? selectedPr?.labels ?? []).filter((l: any) => QA_LABELS.includes(l.name as any)).length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {(prDetail?.labels ?? selectedPr?.labels ?? [])
                                                    .filter((l: any) => QA_LABELS.includes(l.name as any))
                                                    .map((l: any) => (
                                                        <span key={l.name} className="text-[11px] px-2 py-0.5 rounded-full bg-qa-accent/20 text-brand font-semibold">
                                                            {l.name}
                                                        </span>
                                                    ))
                                                }
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8 text-muted-ui text-xs">Failed to load details</div>
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
