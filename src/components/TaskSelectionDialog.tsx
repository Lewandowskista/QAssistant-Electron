import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useProjectStore } from "@/store/useProjectStore"
import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface TaskSelectionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    selectedTaskIds: string[]
    onSelectionChange: (ids: string[]) => void
    sourceFilter: string
}

export default function TaskSelectionDialog({
    open,
    onOpenChange,
    selectedTaskIds,
    onSelectionChange,
    sourceFilter
}: TaskSelectionDialogProps) {
    const { projects, activeProjectId } = useProjectStore()
    const project = projects.find(p => p.id === activeProjectId)
    const allTasks = project?.tasks || []

    const [localSelected, setLocalSelected] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        if (open) {
            setLocalSelected(new Set(selectedTaskIds))
            setSearchQuery('')
        }
    }, [open, selectedTaskIds])

    const filteredTasks = allTasks.filter(t => {
        if (sourceFilter !== 'All' && t.source?.toLowerCase() !== sourceFilter.toLowerCase()) return false
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            return t.title.toLowerCase().includes(query) || (t.sourceIssueId && t.sourceIssueId.toLowerCase().includes(query))
        }
        return true
    })

    const handleToggle = (taskId: string) => {
        const next = new Set(localSelected)
        if (next.has(taskId)) {
            next.delete(taskId)
        } else {
            next.add(taskId)
        }
        setLocalSelected(next)
    }

    const handleSelectAll = () => {
        const next = new Set(localSelected)
        if (filteredTasks.every(t => next.has(t.id))) {
            filteredTasks.forEach(t => next.delete(t.id))
        } else {
            filteredTasks.forEach(t => next.add(t.id))
        }
        setLocalSelected(next)
    }

    const handleConfirm = () => {
        onSelectionChange(Array.from(localSelected))
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl bg-[#0F0F13] border-[#2A2A3A] text-[#E2E8F0]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black text-[#A78BFA]">Select Context Issues</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 mt-4">
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
                            <input
                                className="w-full bg-[#1A1A24] border border-[#2A2A3A] text-sm text-[#E2E8F0] h-10 pl-10 pr-4 rounded-lg focus:outline-none focus:border-[#A78BFA]/50"
                                placeholder={`Search ${filteredTasks.length} issues...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="outline"
                            className="bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold"
                            onClick={handleSelectAll}
                        >
                            {filteredTasks.every(t => localSelected.has(t.id)) ? 'Deselect All' : 'Select All'}
                        </Button>
                        <Button
                            variant="ghost"
                            className="text-[#6B7280] text-xs font-bold hover:text-[#EF4444]"
                            onClick={() => setLocalSelected(new Set())}
                        >
                            Clear
                        </Button>
                    </div>

                    <div className="h-72 overflow-y-auto custom-scrollbar border border-[#2A2A3A] rounded-xl bg-[#13131A] p-2 space-y-1">
                        {filteredTasks.length === 0 ? (
                            <div className="text-center text-[#6B7280] text-sm py-10 font-bold">No issues found for {sourceFilter}.</div>
                        ) : (
                            filteredTasks.map(task => (
                                <div key={task.id} className="flex items-start gap-3 p-3 hover:bg-[#1A1A24] rounded-lg transition-colors cursor-pointer" onClick={() => handleToggle(task.id)}>
                                    <Checkbox
                                        checked={localSelected.has(task.id)}
                                        onCheckedChange={() => handleToggle(task.id)}
                                        className="mt-1"
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase text-[#A78BFA] bg-[#A78BFA]/10 px-2 py-0.5 rounded tracking-wider">
                                                {task.sourceIssueId || task.externalId || task.source}
                                            </span>
                                            <span className={cn(
                                                "text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter",
                                                task.priority === 'critical' ? "bg-[#EF4444]/20 text-[#EF4444]" :
                                                    task.priority === 'high' ? "bg-[#F59E0B]/20 text-[#F59E0B]" :
                                                        task.priority === 'medium' ? "bg-[#3B82F6]/20 text-[#3B82F6]" : "bg-[#6B7280]/20 text-[#6B7280]"
                                            )}>
                                                {task.priority || 'MED'}
                                            </span>
                                            <span className="text-[9px] font-bold text-[#6B7280] uppercase opacity-50">
                                                {task.status || 'TODO'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-[#E2E8F0] mt-1.5 leading-snug">{task.title}</p>
                                        <p className="text-[11px] text-[#6B7280] mt-1 line-clamp-1 italic">{task.description || 'No description provided.'}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <DialogFooter className="mt-6 border-t border-[#2A2A3A] pt-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#6B7280]">Cancel</Button>
                    <Button onClick={handleConfirm} className="bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold">
                        Confirm ({localSelected.size})
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
