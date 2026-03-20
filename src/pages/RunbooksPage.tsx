import { useState, useMemo } from "react"
import { useProjectStore, RunbookStepStatus, RunbookCategory } from "@/store/useProjectStore"
import {
    Plus,
    Trash2,
    BookOpen,
    Search,
    CheckCircle2,
    Circle,
    Clock,
    AlertCircle,
    MoreVertical,
    Play,
    PlusCircle,
    GripVertical,
    RefreshCcw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

const CATEGORIES: { id: RunbookCategory; label: string; color: string }[] = [
    { id: 'deployment', label: 'Deployment', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { id: 'maintenance', label: 'Maintenance', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    { id: 'testing', label: 'Testing', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    { id: 'other', label: 'Other', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
]

const STATUS_ORDER: RunbookStepStatus[] = ['pending', 'in-progress', 'done', 'failed', 'skipped']

export default function RunbooksPage() {
    const { projects, activeProjectId, addRunbook, updateRunbook, deleteRunbook, addRunbookStep, updateRunbookStep, deleteRunbookStep } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const runbooks = activeProject?.runbooks || []

    const [selectedRunbookId, setSelectedRunbookId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [activeCategory, setActiveCategory] = useState<RunbookCategory | 'all'>('all')
    const [isPromptOpen, setIsPromptOpen] = useState(false)
    const [promptTitle, setPromptTitle] = useState("")
    const [promptLabel, setPromptLabel] = useState("")
    const [promptValue, setPromptValue] = useState("")
    const [promptAction, setPromptAction] = useState<((val: string) => void) | null>(null)

    const filteredRunbooks = useMemo(() => {
        return runbooks.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesCategory = activeCategory === 'all' || r.category === activeCategory
            return matchesSearch && matchesCategory
        })
    }, [runbooks, searchQuery, activeCategory])

    const selectedRunbook = useMemo(() => runbooks.find(r => r.id === selectedRunbookId), [runbooks, selectedRunbookId])

    const handleAddRunbook = () => {
        if (!activeProjectId) return
        setPromptTitle("New Runbook")
        setPromptLabel("Enter runbook name:")
        setPromptValue("")
        setPromptAction(() => (name: string) => {
            if (name.trim()) addRunbook(activeProjectId, name.trim(), 'other').then(r => setSelectedRunbookId(r.id))
        })
        setIsPromptOpen(true)
    }

    const handleAddStep = () => {
        if (!activeProjectId || !selectedRunbookId) return
        setPromptTitle("New Step")
        setPromptLabel("Enter step title:")
        setPromptValue("")
        setPromptAction(() => (title: string) => {
            if (title.trim()) addRunbookStep(activeProjectId, selectedRunbookId, title.trim())
        })
        setIsPromptOpen(true)
    }

    const getStatusIcon = (status: RunbookStepStatus) => {
        switch (status) {
            case 'done': return <CheckCircle2 className="h-4 w-4 text-green-500" />
            case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />
            case 'in-progress': return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
            case 'skipped': return <Play className="h-4 w-4 text-slate-500" />
            default: return <Circle className="h-4 w-4 text-slate-400" />
        }
    }

    return (
        <div className="flex h-full bg-[#0F0F13] text-qa-text overflow-hidden">
            {/* Sidebar: Categories & List */}
            <div className="w-80 flex flex-col border-r border-qa-border bg-[#13131A] shrink-0">
                <div className="p-4 border-b border-qa-border space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-primary" />
                            Runbooks
                        </h2>
                        <Button variant="ghost" size="icon" onClick={handleAddRunbook} className="h-8 w-8 text-primary hover:bg-primary/10">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search runbooks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 bg-[#1A1A24] border-qa-border text-xs focus:ring-primary/50"
                        />
                    </div>
                </div>

                <div className="px-3 pt-4 pb-2">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        <button
                            onClick={() => setActiveCategory('all')}
                            className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                                activeCategory === 'all'
                                    ? "bg-primary/20 text-primary border-primary/30"
                                    : "bg-transparent text-slate-500 border-slate-800 hover:border-slate-700"
                            )}
                        >
                            All
                        </button>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={cn(
                                    "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                                    activeCategory === cat.id
                                        ? cat.color
                                        : "bg-transparent text-slate-500 border-slate-800 hover:border-slate-700"
                                )}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredRunbooks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 opacity-30 mt-10">
                            <BookOpen className="h-8 w-8" />
                            <p className="text-xs">No runbooks found</p>
                        </div>
                    ) : (
                        filteredRunbooks.map(rb => (
                            <div key={rb.id} className="group relative">
                                <button
                                    onClick={() => setSelectedRunbookId(rb.id)}
                                    className={cn(
                                        "w-full flex flex-col gap-1.5 rounded-md px-3 py-2.5 text-xs transition-all text-left border",
                                        selectedRunbookId === rb.id
                                            ? "bg-[#2D2D3F] border-primary/30 text-qa-text"
                                            : "border-transparent text-qa-text-muted hover:bg-[#252535] hover:text-qa-text"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold truncate">{rb.name}</span>
                                        <Badge className={cn("text-[9px] px-1.5 py-0 h-4 border-none uppercase tracking-wider",
                                            CATEGORIES.find(c => c.id === rb.category)?.color || 'bg-slate-500/10 text-slate-400'
                                        )}>
                                            {rb.category}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] opacity-60">
                                        <CheckCircle2 className="h-3 w-3" />
                                        <span>{rb.steps.filter(s => s.status === 'done').length}/{rb.steps.length} Steps</span>
                                    </div>
                                </button>
                                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-white">
                                                <MoreVertical className="h-3.5 w-3.5" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-32 bg-[#1A1A24] border-qa-border text-white">
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteRunbook(activeProjectId!, rb.id); if (selectedRunbookId === rb.id) setSelectedRunbookId(null); }}>
                                                <Trash2 className="mr-2 h-3 w-3 text-red-400" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content: Steps */}
            <div className="flex-1 flex flex-col bg-[#0F0F13] min-w-0">
                {selectedRunbook ? (
                    <>
                        <div className="h-14 flex items-center justify-between px-6 border-b border-qa-border bg-[#13131A]/30 backdrop-blur-sm sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <h1 className="text-lg font-bold tracking-tight">{selectedRunbook.name}</h1>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase tracking-wider bg-[#1A1A24] border-qa-border hover:bg-[#252535]">
                                            {selectedRunbook.category}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="bg-[#1A1A24] border-qa-border text-white">
                                        {CATEGORIES.map(cat => (
                                            <DropdownMenuItem key={cat.id} onClick={() => updateRunbook(activeProjectId!, selectedRunbook.id, { category: cat.id })}>
                                                {cat.label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedRunbook.steps.some(s => s.status !== 'pending') && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            if (!activeProjectId) return
                                            selectedRunbook.steps.forEach(step => {
                                                updateRunbookStep(activeProjectId, selectedRunbook.id, step.id, { status: 'pending' })
                                            })
                                        }}
                                        className="h-8 gap-2 text-qa-text-muted hover:text-qa-text"
                                        title="Reset all steps to Pending"
                                    >
                                        <RefreshCcw className="h-3.5 w-3.5" />
                                        Reset Progress
                                    </Button>
                                )}
                                <Button size="sm" onClick={handleAddStep} className="h-8 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                    <PlusCircle className="h-4 w-4" />
                                    Add Step
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="max-w-3xl mx-auto space-y-8 pb-32">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-xs font-black tracking-[0.2em] text-qa-text-muted uppercase">Procedure Steps</h3>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                                            <span className="flex items-center gap-1"><Circle className="h-2 w-2 text-slate-500" /> Pending</span>
                                            <span className="flex items-center gap-1"><Clock className="h-2 w-2 text-blue-500" /> In Progress</span>
                                            <span className="flex items-center gap-1"><CheckCircle2 className="h-2 w-2 text-green-500" /> Done</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {selectedRunbook.steps.sort((a, b) => a.order - b.order).map((step) => (
                                            <div key={step.id} className="group flex items-start gap-4 p-4 rounded-xl border border-qa-border bg-[#13131A] hover:border-primary/30 transition-all duration-200">
                                                <div className="mt-1 shrink-0">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button className="h-5 w-5 rounded-full flex items-center justify-center hover:scale-110 transition-transform">
                                                                {getStatusIcon(step.status)}
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent className="bg-[#1A1A24] border-qa-border text-white">
                                                            {STATUS_ORDER.map(s => (
                                                                <DropdownMenuItem key={s} onClick={() => updateRunbookStep(activeProjectId!, selectedRunbook.id, step.id, { status: s })}>
                                                                    <div className="flex items-center gap-2 capitalize">
                                                                        {getStatusIcon(s)} {s}
                                                                    </div>
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <input
                                                                value={step.title}
                                                                onChange={(e) => updateRunbookStep(activeProjectId!, selectedRunbook.id, step.id, { title: e.target.value })}
                                                                className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0 text-qa-text"
                                                            />
                                                            <textarea
                                                                placeholder="Add description..."
                                                                value={step.description || ''}
                                                                onChange={(e) => updateRunbookStep(activeProjectId!, selectedRunbook.id, step.id, { description: e.target.value })}
                                                                className="w-full bg-transparent border-none p-0 text-xs text-muted-foreground focus:ring-0 mt-1 resize-none h-16"
                                                            />
                                                        </div>
                                                        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => deleteRunbookStep(activeProjectId!, selectedRunbook.id, step.id)}
                                                                className="h-8 w-8 text-red-500/50 hover:text-red-500 hover:bg-red-500/10"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                            <div className="p-2 cursor-grab active:cursor-grabbing text-slate-700">
                                                                <GripVertical className="h-4 w-4" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {selectedRunbook.steps.length === 0 && (
                                        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-qa-border rounded-2xl opacity-40 text-center space-y-3">
                                            <PlusCircle className="h-8 w-8" />
                                            <div>
                                                <p className="text-sm font-semibold">No steps yet</p>
                                                <p className="text-xs">Add the first procedure step to begin this runbook.</p>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={handleAddStep}>
                                                Create First Step
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-30 p-8 text-center space-y-4">
                        <div className="relative">
                            <BookOpen className="h-20 w-20" />
                            <div className="absolute -top-1 -right-1 h-6 w-6 bg-primary rounded-full animate-pulse" />
                        </div>
                        <div className="max-w-xs">
                            <h2 className="text-xl font-bold text-white mb-2">Select a Runbook</h2>
                            <p className="text-sm">Manage complex multi-step procedures like deployments, maintenance tasks, or repetitive testing flows.</p>
                        </div>
                        {runbooks.length === 0 && (
                            <Button onClick={handleAddRunbook} className="mt-4 gap-2">
                                <Plus className="h-4 w-4" />
                                Create Your First Runbook
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={isPromptOpen} onOpenChange={setIsPromptOpen}>
                <DialogContent className="bg-[#13131A] border-qa-border sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-qa-text">{promptTitle}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <label className="text-[10px] font-bold text-qa-text-muted uppercase tracking-widest px-1">{promptLabel}</label>
                        <Input
                            autoFocus
                            value={promptValue}
                            onChange={(e) => setPromptValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && promptValue.trim()) {
                                    promptAction?.(promptValue)
                                    setIsPromptOpen(false)
                                }
                            }}
                            className="bg-[#1A1A24] border-qa-border text-qa-text"
                        />
                    </div>
                    <DialogFooter className="bg-[#13131A]">
                        <Button variant="ghost" onClick={() => setIsPromptOpen(false)} className="text-qa-text-muted hover:text-qa-text">
                            CANCEL
                        </Button>
                        <Button 
                            onClick={() => {
                                promptAction?.(promptValue)
                                setIsPromptOpen(false)
                            }}
                            disabled={!promptValue.trim()}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                        >
                            CONFIRM
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

