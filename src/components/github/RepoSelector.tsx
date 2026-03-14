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
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-80 max-h-80 overflow-y-auto bg-[#1A1A24] border border-[#2A2A3A] rounded-lg shadow-xl custom-scrollbar">
                        {loading ? (
                            <div className="p-4 flex items-center justify-center">
                                <Loader2 className="h-4 w-4 text-[#A78BFA] animate-spin" />
                            </div>
                        ) : repos.length === 0 ? (
                            <div className="p-4 text-xs text-[#6B7280] text-center">No repositories found</div>
                        ) : repos.map(repo => (
                            <button
                                key={repo.id}
                                onClick={() => { onSelect(repo); setOpen(false) }}
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
    )
}
