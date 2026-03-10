import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Project, TaskStatus } from "@/store/useProjectStore"

interface NewTaskModalProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    activeProject: Project | undefined
    currentColumns: any[]
    onConfirm: (taskData: any) => Promise<void>
}

export function NewTaskModal({ isOpen, onOpenChange, activeProject, currentColumns, onConfirm }: NewTaskModalProps) {
    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [newTaskDescription, setNewTaskDescription] = useState("")
    const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo')
    const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
    const [newTaskSource, setNewTaskSource] = useState<'manual' | 'linear' | 'jira'>('manual')
    const [newTaskLabels, setNewTaskLabels] = useState("")
    const [newTaskConnectionId, setNewTaskConnectionId] = useState("")

    const handleConfirm = async () => {
        await onConfirm({
            title: newTaskTitle,
            description: newTaskDescription,
            status: newTaskStatus,
            priority: newTaskPriority,
            source: newTaskSource,
            labels: newTaskLabels,
            connectionId: newTaskConnectionId
        })
        // Reset form
        setNewTaskTitle("")
        setNewTaskDescription("")
        setNewTaskStatus('todo')
        setNewTaskPriority('medium')
        setNewTaskSource('manual')
        setNewTaskLabels("")
        setNewTaskConnectionId("")
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] bg-[#13131A] border-[#2A2A3A] p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-xl font-bold text-[#E2E8F0] tracking-tight">Create New Task</DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-5">
                    {/* Source Selection */}
                    <div className="space-y-3">
                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Source Provider</Label>
                        <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                            {(['manual', 'linear', 'jira'] as const).map(source => (
                                <Button
                                    key={source}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setNewTaskSource(source)}
                                    className={cn(
                                        "flex-1 h-8 text-[11px] font-bold transition-all",
                                        newTaskSource === source
                                            ? "bg-[#2A2A3A]/80 text-[#A78BFA]"
                                            : "text-[#6B7280] hover:text-[#E2E8F0]"
                                    )}
                                >
                                    {source.charAt(0).toUpperCase() + source.slice(1)}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Connection Selection (if external) */}
                    {newTaskSource !== 'manual' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                                {newTaskSource.charAt(0).toUpperCase() + newTaskSource.slice(1)} Connection
                            </Label>
                            <Select value={newTaskConnectionId} onValueChange={setNewTaskConnectionId}>
                                <SelectTrigger className="bg-[#1A1A24] border-[#2A2A3A] text-xs h-10 text-[#E2E8F0]">
                                    <SelectValue placeholder={`Select ${newTaskSource} connection...`} />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                    {newTaskSource === 'linear' ? (
                                        activeProject?.linearConnections?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id} className="text-xs text-[#E2E8F0]">
                                                {c.label || c.teamId}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        activeProject?.jiraConnections?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id} className="text-xs text-[#E2E8F0]">
                                                {c.label || `${c.domain} - ${c.projectKey}`}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Title */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Title</Label>
                        <Input
                            autoFocus
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="What needs to be done?"
                            className="bg-[#1A1A24] border-[#2A2A3A] text-sm h-10 focus:ring-[#A78BFA]/30"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Description</Label>
                        <Textarea
                            value={newTaskDescription}
                            onChange={(e) => setNewTaskDescription(e.target.value)}
                            placeholder="Add more details..."
                            className="bg-[#1A1A24] border-[#2A2A3A] text-sm min-h-[100px] resize-none focus:ring-[#A78BFA]/30"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Status */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Status</Label>
                            <Select value={newTaskStatus} onValueChange={(v: any) => setNewTaskStatus(v)}>
                                <SelectTrigger className="bg-[#1A1A24] border-[#2A2A3A] text-xs h-10 text-[#E2E8F0]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                    {currentColumns.map((col: any) => (
                                        <SelectItem key={col.id} value={col.id} className="text-xs text-[#E2E8F0]">
                                            {col.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Priority */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Priority</Label>
                            <Select value={newTaskPriority} onValueChange={(v: any) => setNewTaskPriority(v)}>
                                <SelectTrigger className="bg-[#1A1A24] border-[#2A2A3A] text-xs h-10 text-[#E2E8F0]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1A1A24] border-[#2A2A3A]">
                                    <SelectItem value="low" className="text-xs text-[#E2E8F0]">Low</SelectItem>
                                    <SelectItem value="medium" className="text-xs text-[#E2E8F0]">Medium</SelectItem>
                                    <SelectItem value="high" className="text-xs text-[#E2E8F0]">High</SelectItem>
                                    <SelectItem value="critical" className="text-xs text-[#E2E8F0]">Critical</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Labels */}
                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Labels (comma separated)</Label>
                        <Input
                            value={newTaskLabels}
                            onChange={(e) => setNewTaskLabels(e.target.value)}
                            placeholder="bug, ui, feature..."
                            className="bg-[#1A1A24] border-[#2A2A3A] text-sm h-10 focus:ring-[#A78BFA]/30"
                        />
                    </div>
                </div>

                <DialogFooter className="p-6 pt-4 border-t border-[#2A2A3A] gap-2 bg-[#13131A]">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-xs font-bold text-[#6B7280] hover:text-[#E2E8F0]"
                    >
                        CANCEL
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!newTaskTitle.trim() || (newTaskSource !== 'manual' && !newTaskConnectionId)}
                        className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD] font-bold text-xs px-8 h-10"
                    >
                        {newTaskSource === 'manual' ? 'CREATE TASK' : `CREATE IN ${newTaskSource.toUpperCase()}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
