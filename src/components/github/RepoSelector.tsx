import { useState } from 'react'
import { GitHubRepo } from '@/types/github'
import { ChevronDown, Lock, Globe, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimeAgo } from '@/lib/utils'

interface RepoSelectorProps {
    repos: GitHubRepo[]
    selectedRepo: GitHubRepo | null
    onSelect: (repo: GitHubRepo) => void
    loading?: boolean
}

export function RepoSelector({ repos, selectedRepo, onSelect, loading }: RepoSelectorProps) {
    const [open, setOpen] = useState(false)

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-ui bg-panel-muted hover:bg-elevated transition-colors text-xs font-semibold text-foreground min-w-[200px]"
            >
                {selectedRepo ? (
                    <>
                        {selectedRepo.private ? <Lock className="h-3 w-3 text-muted-ui" /> : <Globe className="h-3 w-3 text-muted-ui" />}
                        <span className="truncate flex-1 text-left">{selectedRepo.fullName}</span>
                    </>
                ) : (
                    <span className="text-muted-ui">Select repository…</span>
                )}
                <ChevronDown className="h-3 w-3 text-muted-ui shrink-0" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-layer-sticky" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-layer-dropdown w-80 max-h-80 overflow-y-auto bg-panel-muted border border-ui rounded-lg shadow-xl custom-scrollbar">
                        {loading ? (
                            <div className="p-4 flex items-center justify-center">
                                <Loader2 className="h-4 w-4 text-brand animate-spin" />
                            </div>
                        ) : repos.length === 0 ? (
                            <div className="p-4 text-xs text-muted-ui text-center">No repositories found</div>
                        ) : repos.map(repo => (
                            <button
                                key={repo.id}
                                onClick={() => { onSelect(repo); setOpen(false) }}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-elevated transition-colors text-left",
                                    selectedRepo?.id === repo.id && "bg-selected"
                                )}
                            >
                                {repo.private ? <Lock className="h-3 w-3 text-muted-ui shrink-0" /> : <Globe className="h-3 w-3 text-muted-ui shrink-0" />}
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="font-semibold text-foreground truncate">{repo.fullName}</span>
                                    <span className="text-[11px] text-muted-ui">{repo.defaultBranch} · {formatTimeAgo(repo.updatedAt)}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
