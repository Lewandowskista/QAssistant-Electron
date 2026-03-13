import { useState, useEffect, useCallback } from 'react'
import { GitHubScopeGuard } from '@/components/GitHubScopeGuard'
import { GitHubRepo, GitHubWorkflowRun, GitHubDeployment } from '@/types/github'
import {
    Rocket, RefreshCw, Loader2, ExternalLink, ChevronDown,
    Lock, Globe, Check, X, Clock, Play, RotateCcw, CircleDot, Search
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

function formatDuration(ms: number | null): string {
    if (!ms) return '—'
    const secs = Math.floor(ms / 1000)
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    const remSecs = secs % 60
    if (mins < 60) return `${mins}m ${remSecs}s`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
}

type Tab = 'workflows' | 'deployments'

function statusBadge(status: string, conclusion: string | null) {
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

function deployStatusColor(state: string) {
    if (state === 'success') return 'text-emerald-400 bg-emerald-500/20'
    if (state === 'failure' || state === 'error') return 'text-red-400 bg-red-500/20'
    if (state === 'in_progress' || state === 'pending') return 'text-amber-400 bg-amber-500/20'
    if (state === 'inactive') return 'text-[#6B7280] bg-[#2A2A3A]'
    return 'text-[#6B7280] bg-[#2A2A3A]'
}

function groupByEnvironment(deps: GitHubDeployment[]): Record<string, GitHubDeployment[]> {
    return deps.reduce((acc, dep) => {
        if (!acc[dep.environment]) acc[dep.environment] = []
        acc[dep.environment].push(dep)
        return acc
    }, {} as Record<string, GitHubDeployment[]>)
}

function DeploymentsContent() {
    const api = window.electronAPI

    const [repos, setRepos] = useState<GitHubRepo[]>([])
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
    const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
    const [loadingRepos, setLoadingRepos] = useState(true)

    const [workflows, setWorkflows] = useState<GitHubWorkflowRun[]>([])
    const [deployments, setDeployments] = useState<GitHubDeployment[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [activeTab, setActiveTab] = useState<Tab>('workflows')
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [rerunningId, setRerunningId] = useState<number | null>(null)

    const [workflowFilter, setWorkflowFilter] = useState('')
    const [isPolling, setIsPolling] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                const result = await api.githubGetRepos()
                if ('__isError' in result) {
                    setError(result.message)
                } else {
                    setRepos(result)
                    if (result.length > 0 && !selectedRepo) setSelectedRepo(result[0])
                }
            } catch (e: any) {
                setError(e.message)
            } finally {
                setLoadingRepos(false)
            }
        })()
    }, [])

    const loadRepoData = useCallback(async (repo: GitHubRepo, force = false) => {
        setLoadingData(true)
        setError(null)
        try {
            const [wfResult, depResult] = await Promise.all([
                api.githubGetWorkflowRuns({ owner: repo.owner.login, repo: repo.name, forceRefresh: force }),
                api.githubGetDeployments({ owner: repo.owner.login, repo: repo.name, forceRefresh: force }),
            ])
            if ('__isError' in wfResult) throw new Error(wfResult.message)
            if ('__isError' in depResult) throw new Error(depResult.message)
            setWorkflows(wfResult)
            setDeployments(depResult)
            setLastUpdated(new Date())
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
            const result = await api.githubRerunWorkflow({ owner: selectedRepo.owner.login, repo: selectedRepo.name, runId })
            if ('__isError' in result) throw new Error(result.message)
            setTimeout(() => loadRepoData(selectedRepo, true), 2000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setRerunningId(null)
        }
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
                                    <div className="p-4 flex items-center justify-center"><Loader2 className="h-4 w-4 text-[#A78BFA] animate-spin" /></div>
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
                                        <span className="font-semibold text-[#E2E8F0] truncate">{repo.fullName}</span>
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
                {error && (
                    <div className="m-4 p-3 rounded-lg bg-red-950/30 border border-red-900/40 text-xs text-red-300">{error}</div>
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
                            return (
                                <div
                                    key={run.id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-lg border transition-colors group",
                                        isActive
                                            ? "bg-[#13131A] border-amber-900/40"
                                            : "bg-[#13131A] border-[#2A2A3A] hover:border-[#3D3D5F]"
                                    )}
                                >
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
                                    </div>
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
