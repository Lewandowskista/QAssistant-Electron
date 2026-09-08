import { GitHubRepo } from '@/types/github'
import { ChevronDown, Lock, Globe, Loader2 } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { formatTimeAgo } from '@/lib/utils'

interface RepoSelectorProps {
    repos: GitHubRepo[]
    selectedRepo: GitHubRepo | null
    onSelect: (repo: GitHubRepo) => void
    loading?: boolean
}

/**
 * On DropdownMenu rather than a hand-rolled panel: the previous version pinned
 * a full-screen click-catcher div behind itself to close on outside click,
 * which left it with no Escape, no focus trap, no arrow-key navigation, and a
 * transparent layer covering the app that other overlays had to stack around.
 */
export function RepoSelector({ repos, selectedRepo, onSelect, loading }: RepoSelectorProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Select repository"
                    className="flex min-w-[200px] items-center gap-2 rounded-md border border-ui bg-panel-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-elevated"
                >
                    {selectedRepo ? (
                        <>
                            {selectedRepo.private ? <Lock className="h-3 w-3 text-muted-ui" /> : <Globe className="h-3 w-3 text-muted-ui" />}
                            <span className="flex-1 truncate text-left">{selectedRepo.fullName}</span>
                        </>
                    ) : (
                        <span className="flex-1 text-left text-muted-ui">Select repository…</span>
                    )}
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-ui" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-80 overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    </div>
                ) : repos.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-ui">No repositories found</div>
                ) : repos.map(repo => (
                    <DropdownMenuItem
                        key={repo.id}
                        onSelect={() => onSelect(repo)}
                        className={cn("gap-2 text-xs", selectedRepo?.id === repo.id && "bg-selected")}
                    >
                        {repo.private ? <Lock className="h-3 w-3 shrink-0 text-muted-ui" /> : <Globe className="h-3 w-3 shrink-0 text-muted-ui" />}
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-semibold text-foreground">{repo.fullName}</span>
                            <span className="text-[11px] text-muted-ui">{repo.defaultBranch} · {formatTimeAgo(repo.updatedAt)}</span>
                        </div>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
