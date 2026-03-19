import { useState, useEffect, useCallback } from 'react'
import { GitHubScopeGuard } from '@/components/GitHubScopeGuard'
import { GitHubRepo, GitHubWorkflowRun, GitHubDeployment, GitHubWorkflowJob, GitHubWorkflow, GitHubCommit } from '@/types/github'
import { useGitHubRepos } from '@/hooks/useGitHubRepos'
import {
    Rocket, RefreshCw, Loader2, ExternalLink,
    RotateCcw, Search, Play, ChevronDown, ChevronRight, Check, X, CircleDot, GitBranch
} from 'lucide-react'
import { cn, formatTimeAgo, formatDuration } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RepoSelector } from '@/components/github/RepoSelector'
import { statusBadge, deployStatusColor } from '@/components/github/StatusBadges'

type Tab = 'workflows' | 'deployments'

function groupByEnvironment(deps: GitHubDeployment[]): Record<string, GitHubDeployment[]> {
    return deps.reduce((acc, dep) => {
        if (!acc[dep.environment]) acc[dep.environment] = []
        acc[dep.environment].push(dep)
        return acc
    }, {} as Record<string, GitHubDeployment[]>)
}

function DeploymentsContent() {
    const api = window.electronAPI
    const { repos, selectedRepo, setSelectedRepo, loading: loadingRepos, error: repoError } = useGitHubRepos()

    const [workflows, setWorkflows] = useState<GitHubWorkflowRun[]>([])
    const [deployments, setDeployments] = useState<GitHubDeployment[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [activeTab, setActiveTab] = useState<Tab>('workflows')
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [rerunningId, setRerunningId] = useState<number | null>(null)

    const [workflowFilter, setWorkflowFilter] = useState('')
    const [isPolling, setIsPolling] = useState(false)

    // Expandable workflow job details
    const [expandedRunId, setExpandedRunId] = useState<number | null>(null)
    const [runJobs, setRunJobs] = useState<Record<number, GitHubWorkflowJob[]>>({})
    const [loadingJobs, setLoadingJobs] = useState<number | null>(null)

    // Commit messages keyed by short SHA prefix
    const [commitBySha, setCommitBySha] = useState<Record<string, GitHubCommit>>({})

    // Workflow dispatch
    const [showDispatch, setShowDispatch] = useState(false)
    const [availableWorkflows, setAvailableWorkflows] = useState<GitHubWorkflow[]>([])
    const [dispatchWorkflowId, setDispatchWorkflowId] = useState<number | null>(null)
    const [dispatchRef, setDispatchRef] = useState('')
    const [dispatching, setDispatching] = useState(false)

    const loadRepoData = useCallback(async (repo: GitHubRepo, force = false) => {
        setLoadingData(true)
        setError(null)
        try {
            const [wfResult, depResult] = await Promise.all([
                api.githubGetWorkflowRuns({ owner: repo.owner.login, repo: repo.name, forceRefresh: force }),
                api.githubGetDeployments({ owner: repo.owner.login, repo: repo.name, forceRefresh: force }),
            ])
            setWorkflows(wfResult)
            setDeployments(depResult)
            setLastUpdated(new Date())

            // Fetch commits for deployment SHA enrichment (non-blocking)
            api.githubGetCommits({ owner: repo.owner.login, repo: repo.name }).then(commitResult => {
                const map: Record<string, GitHubCommit> = {}
                commitResult.forEach(c => {
                    map[c.sha] = c
                    map[c.shortSha] = c
                })
                setCommitBySha(map)
            }).catch(() => { /* non-fatal */ })
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoadingData(false)
        }
    }, [api])

    useEffect(() => {
        if (selectedRepo) {
            setWorkflowFilter('')
            loadRepoData(selectedRepo)
        }
    }, [selectedRepo])

    // Auto-poll when runs are active
    useEffect(() => {
        const hasActive = workflows.some(r => r.status === 'in_progress' || r.status === 'queued')
        setIsPolling(hasActive)
        if (!hasActive || !selectedRepo) return
        const interval = setInterval(() => loadRepoData(selectedRepo, true), 30_000)
        return () => clearInterval(interval)
    }, [workflows, selectedRepo, loadRepoData])

    const handleRerun = async (runId: number) => {
        if (!selectedRepo) return
        setRerunningId(runId)
        try {
            await api.githubRerunWorkflow({ owner: selectedRepo.owner.login, repo: selectedRepo.name, runId })
            setTimeout(() => loadRepoData(selectedRepo, true), 2000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setRerunningId(null)
        }
    }

    const toggleRunExpand = async (runId: number) => {
        if (expandedRunId === runId) {
            setExpandedRunId(null)
            return
        }
        setExpandedRunId(runId)
        if (!runJobs[runId] && selectedRepo) {
            setLoadingJobs(runId)
            try {
                const result = await api.githubGetWorkflowJobs({ owner: selectedRepo.owner.login, repo: selectedRepo.name, runId })
                setRunJobs(prev => ({ ...prev, [runId]: result }))
            } finally {
                setLoadingJobs(null)
            }
        }
    }

    const handleDispatch = async () => {
        if (!selectedRepo || !dispatchWorkflowId || !dispatchRef) return
        setDispatching(true)
        try {
            await api.githubDispatchWorkflow({
                owner: selectedRepo.owner.login,
                repo: selectedRepo.name,
                workflowId: dispatchWorkflowId,
                ref: dispatchRef,
            })
            setShowDispatch(false)
            setTimeout(() => loadRepoData(selectedRepo, true), 2000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setDispatching(false)
        }
    }

    const openDispatchDialog = async () => {
        if (!selectedRepo) return
        setShowDispatch(true)
        setDispatchRef(selectedRepo.defaultBranch)
        try {
            const wfs = await api.githubGetWorkflowsList({ owner: selectedRepo.owner.login, repo: selectedRepo.name })
            setAvailableWorkflows(wfs)
            if (wfs.length > 0) setDispatchWorkflowId(wfs[0].id)
        } catch { /* non-fatal */ }
    }

    const filteredWorkflows = workflowFilter.trim()
        ? workflows.filter(r =>
            r.name.toLowerCase().includes(workflowFilter.toLowerCase()) ||
            r.headBranch.toLowerCase().includes(workflowFilter.toLowerCase())
        )
        : workflows

    return (
        <div className="h-full flex flex-col bg-[#0F0F13]">
            {/* Header */}
            <div className="shrink-0 border-b border-[#2A2A3A] bg-[#13131A]/60 px-5 py-3 flex items-center gap-3">
                <Rocket className="h-4 w-4 text-[#A78BFA]" />
                <h1 className="text-sm font-bold text-[#E2E8F0]">Deployments</h1>
                <div className="flex-1" />

                {/* Live polling indicator */}
                {isPolling && (
                    <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                        </span>
                        <span className="text-[10px] text-amber-400 font-semibold">Live</span>
                    </div>
                )}

                <RepoSelector
                    repos={repos}
                    selectedRepo={selectedRepo}
                    onSelect={setSelectedRepo}
                    loading={loadingRepos}
                />

                <Button
                    variant="ghost" size="sm"
                    onClick={openDispatchDialog}
                    disabled={!selectedRepo}
                    className="h-8 px-2 text-xs text-[#6B7280] hover:text-[#A78BFA] flex items-center gap-1"
                    title="Run workflow"
                >
                    <Play className="h-3 w-3" />
                    <span className="hidden sm:inline">Run</span>
                </Button>
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
                {([['workflows', 'Workflow Runs', Play], ['deployments', 'Environments', Rocket]] as const).map(([id, label, Icon]) => (
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
                        {id === 'workflows' && workflows.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#2A2A3A] text-[10px] font-bold">{workflows.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {(error || repoError) && (
                    <div className="m-4 p-3 rounded-lg bg-red-950/30 border border-red-900/40 text-xs text-red-300">{error || repoError}</div>
                )}

                {loadingData && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 text-[#A78BFA] animate-spin" />
                    </div>
                )}

                {!loadingData && selectedRepo && activeTab === 'workflows' && (
                    <div className="p-4 space-y-2">
                        {/* Filter input */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280] pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Filter by name or branch..."
                                value={workflowFilter}
                                onChange={e => setWorkflowFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-md bg-[#13131A] border border-[#2A2A3A] text-xs text-[#E2E8F0] placeholder-[#6B7280] focus:outline-none focus:border-[#A78BFA]/60 transition-colors"
                            />
                        </div>

                        {filteredWorkflows.length === 0 ? (
                            <div className="text-center py-12 text-[#6B7280] text-xs">
                                {workflowFilter ? 'No matching workflow runs' : 'No workflow runs found'}
                            </div>
                        ) : filteredWorkflows.map(run => {
                            const badge = statusBadge(run.status, run.conclusion)
                            const BadgeIcon = badge.icon
                            const isActive = run.status === 'in_progress' || run.status === 'queued'
                            const isExpanded = expandedRunId === run.id
                            const jobs = runJobs[run.id] || []
                            return (
                                <div
                                    key={run.id}
                                    className={cn(
                                        "rounded-lg border transition-colors",
                                        isActive
                                            ? "bg-[#13131A] border-amber-900/40"
                                            : "bg-[#13131A] border-[#2A2A3A] hover:border-[#3D3D5F]"
                                    )}
                                >
                                    {/* Run row */}
                                    <div className="flex items-center gap-3 p-3 group">
                                        <div className={cn("shrink-0 w-7 h-7 rounded-full flex items-center justify-center", badge.bg)}>
                                            <BadgeIcon className={cn("h-3.5 w-3.5", badge.color, isActive && "animate-pulse")} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-semibold text-[#E2E8F0] truncate">{run.name}</span>
                                                <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", badge.bg, badge.color)}>
                                                    {badge.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#6B7280]">
                                                <code className="font-mono text-[#9CA3AF]">{run.headBranch}</code>
                                                <span>·</span>
                                                <span>{run.event}</span>
                                                <span>·</span>
                                                <span>{formatTimeAgo(run.createdAt)}</span>
                                                {run.durationMs && run.status === 'completed' && (
                                                    <>
                                                        <span>·</span>
                                                        <span>{formatDuration(run.durationMs)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-1">
                                            {run.status === 'completed' && run.conclusion === 'failure' && (
                                                <Button
                                                    variant="ghost" size="sm"
                                                    onClick={() => handleRerun(run.id)}
                                                    disabled={rerunningId === run.id}
                                                    className="h-7 px-2 text-[10px] text-[#6B7280] hover:text-[#A78BFA]"
                                                    title="Re-run failed jobs"
                                                >
                                                    <RotateCcw className={cn("h-3 w-3 mr-1", rerunningId === run.id && "animate-spin")} />
                                                    <span className="text-[10px]">Re-run</span>
                                                </Button>
                                            )}
                                            <button
                                                onClick={() => api.openUrl(run.htmlUrl)}
                                                className="p-1.5 rounded hover:bg-[#252535] text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="View on GitHub"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                            </button>
                                            <button
                                                onClick={() => toggleRunExpand(run.id)}
                                                className="p-1.5 rounded hover:bg-[#252535] text-[#6B7280] hover:text-[#E2E8F0] transition-colors"
                                                title="Toggle job details"
                                            >
                                                {isExpanded
                                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                                    : <ChevronRight className="h-3.5 w-3.5" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                    {/* Expanded job details */}
                                    {isExpanded && (
                                        <div className="border-t border-[#2A2A3A] px-3 pb-3 pt-2">
                                            {loadingJobs === run.id ? (
                                                <div className="flex items-center gap-2 py-2">
                                                    <Loader2 className="h-3 w-3 text-[#A78BFA] animate-spin" />
                                                    <span className="text-[11px] text-[#6B7280]">Loading jobs…</span>
                                                </div>
                                            ) : jobs.length === 0 ? (
                                                <p className="text-[11px] text-[#6B7280] py-2">No job data available</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {jobs.map(job => (
                                                        <div key={job.id}>
                                                            <div className="flex items-center gap-2 py-1">
                                                                {job.conclusion === 'success'
                                                                    ? <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                                                                    : job.conclusion === 'failure'
                                                                    ? <X className="h-3 w-3 text-red-400 shrink-0" />
                                                                    : job.status === 'in_progress'
                                                                    ? <Loader2 className="h-3 w-3 text-amber-400 animate-spin shrink-0" />
                                                                    : <CircleDot className="h-3 w-3 text-[#6B7280] shrink-0" />
                                                                }
                                                                <span className="text-[11px] text-[#E2E8F0] font-semibold">{job.name}</span>
                                                            </div>
                                                            {job.steps.length > 0 && (
                                                                <div className="ml-5 space-y-0.5">
                                                                    {job.steps.map((step, si) => (
                                                                        <div key={si} className="flex items-center gap-1.5">
                                                                            {step.conclusion === 'success'
                                                                                ? <Check className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                                                                                : step.conclusion === 'failure'
                                                                                ? <X className="h-2.5 w-2.5 text-red-400 shrink-0" />
                                                                                : step.conclusion === 'skipped'
                                                                                ? <CircleDot className="h-2.5 w-2.5 text-[#6B7280] shrink-0" />
                                                                                : step.status === 'in_progress'
                                                                                ? <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin shrink-0" />
                                                                                : <CircleDot className="h-2.5 w-2.5 text-[#6B7280] opacity-40 shrink-0" />
                                                                            }
                                                                            <span className="text-[10px] text-[#9CA3AF]">{step.name}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {!loadingData && selectedRepo && activeTab === 'deployments' && (
                    <div className="p-4 space-y-5">
                        {deployments.length === 0 ? (
                            <div className="text-center py-12 text-[#6B7280] text-xs">No deployments found</div>
                        ) : Object.entries(groupByEnvironment(deployments)).map(([env, envDeps]) => (
                            <div key={env}>
                                {/* Environment header */}
                                <div className="flex items-center gap-2 mb-2">
                                    <Rocket className="h-3 w-3 text-[#A78BFA]" />
                                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">{env}</h3>
                                    <span className="text-[10px] text-[#6B7280] bg-[#2A2A3A] px-1.5 py-0.5 rounded-full">{envDeps.length}</span>
                                    {/* Latest status indicator */}
                                    {envDeps[0]?.latestStatus && (
                                        <span className={cn("ml-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", deployStatusColor(envDeps[0].latestStatus.state))}>
                                            {envDeps[0].latestStatus.state}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    {envDeps.map(dep => (
                                        <div
                                            key={dep.id}
                                            className="flex items-center gap-3 p-3 rounded-lg bg-[#13131A] border border-[#2A2A3A] hover:border-[#3D3D5F] transition-colors group"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 text-[11px] text-[#6B7280]">
                                                    <code className="font-mono text-[#A78BFA]">{dep.sha}</code>
                                                    <span>·</span>
                                                    <code className="font-mono text-[#9CA3AF] truncate max-w-[120px]">{dep.ref}</code>
                                                    <span>·</span>
                                                    <span>{dep.creator}</span>
                                                    <span>·</span>
                                                    <span>{formatTimeAgo(dep.createdAt)}</span>
                                                </div>
                                                {(commitBySha[dep.sha] ?? commitBySha[dep.sha.slice(0, 7)]) && (
                                                    <p className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">
                                                        {(commitBySha[dep.sha] ?? commitBySha[dep.sha.slice(0, 7)]).message.split('\n')[0]}
                                                    </p>
                                                )}
                                                {dep.latestStatus?.description && (
                                                    <p className="text-[11px] text-[#6B7280] mt-0.5 truncate">{dep.latestStatus.description}</p>
                                                )}
                                            </div>
                                            {dep.latestStatus?.targetUrl && (
                                                <button
                                                    onClick={() => api.openUrl(dep.latestStatus!.targetUrl!)}
                                                    className="p-1.5 rounded hover:bg-[#252535] text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                    title="Open deployment"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Workflow Dispatch Dialog */}
            {showDispatch && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setShowDispatch(false)} />
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl shadow-2xl p-5">
                        <h2 className="text-sm font-bold text-[#E2E8F0] mb-4 flex items-center gap-2">
                            <Play className="h-4 w-4 text-[#A78BFA]" /> Run Workflow
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1 block">Workflow</label>
                                <select
                                    value={dispatchWorkflowId ?? ''}
                                    onChange={e => setDispatchWorkflowId(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-md bg-[#13131A] border border-[#2A2A3A] text-xs text-[#E2E8F0] focus:outline-none focus:border-[#A78BFA]/60"
                                >
                                    {availableWorkflows.length === 0 && <option value="">Loading…</option>}
                                    {availableWorkflows.map(wf => (
                                        <option key={wf.id} value={wf.id}>{wf.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1 block">Branch / Tag</label>
                                <div className="relative">
                                    <GitBranch className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#6B7280] pointer-events-none" />
                                    <input
                                        type="text"
                                        value={dispatchRef}
                                        onChange={e => setDispatchRef(e.target.value)}
                                        placeholder="main"
                                        className="w-full pl-8 pr-3 py-2 rounded-md bg-[#13131A] border border-[#2A2A3A] text-xs text-[#E2E8F0] font-mono focus:outline-none focus:border-[#A78BFA]/60"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-5">
                            <button
                                onClick={() => setShowDispatch(false)}
                                className="flex-1 px-3 py-2 rounded-md border border-[#2A2A3A] text-xs text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#252535] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDispatch}
                                disabled={dispatching || !dispatchWorkflowId || !dispatchRef}
                                className="flex-1 px-3 py-2 rounded-md bg-[#A78BFA] text-white text-xs font-semibold hover:bg-[#9B7CF4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                            >
                                {dispatching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                Run
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default function DeploymentsPage() {
    return (
        <GitHubScopeGuard>
            <DeploymentsContent />
        </GitHubScopeGuard>
    )
}
