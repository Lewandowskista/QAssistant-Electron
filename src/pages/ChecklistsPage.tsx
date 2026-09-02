import { useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { useConfirm } from "@/components/ConfirmDialog"
import { ListChecks, Plus, Search, Trash2, RefreshCcw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "../components/ui/progress"
import { FullBleedHeader } from "@/components/ui/workspace"
import { cn } from "@/lib/utils"
import FormattedText from "@/components/FormattedText"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export default function ChecklistsPage() {
    const { projects, activeProjectId, addChecklist, deleteChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem, updateChecklist } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null)
    const [newItemText, setNewItemText] = useState("")
    const { confirm: confirmReset, dialog: confirmResetDialog } = useConfirm()

    if (!activeProjectId || !activeProject) {
        return (
            <div className="h-full flex items-center justify-center bg-app p-6">
                <EmptyState
                    icon={ListChecks}
                    title="No project selected"
                    description="Select a project to see its checklists."
                    className="w-full max-w-md"
                />
            </div>
        )
    }

    const checklists = activeProject.checklists || []
    const filtered = checklists.filter((cl: any) => cl.name.toLowerCase().includes(searchQuery.toLowerCase()))
    const selectedChecklist = checklists.find(cl => cl.id === selectedChecklistId)

    const handleCreate = async () => {
        const res = await addChecklist(activeProjectId!, "New Checklist", "QA")
        setSelectedChecklistId(res.id)
    }

    const handleAddItem = async () => {
        if (!selectedChecklistId || !newItemText.trim()) return
        await addChecklistItem(activeProjectId!, selectedChecklistId!, newItemText)
        setNewItemText("")
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-app overflow-hidden">
            <FullBleedHeader
                icon={ListChecks}
                title="Checklists"
                description="Verification steps and release sign-off"
                actions={
                    <Button onClick={handleCreate} className="gap-2">
                        <Plus className="h-4 w-4" /> New checklist
                    </Button>
                }
            />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-[300px] flex-none bg-panel border-r border-qa-border flex flex-col">
                    <div className="p-4 border-b border-qa-border">
                        <h2 className="app-section-label">All checklists</h2>
                    </div>

                    <div className="p-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-qa-text-muted" />
                            <Input
                                placeholder="Search checklists…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="h-9 pl-9 bg-app border-qa-border text-xs text-qa-text"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {filtered.map(cl => {
                            const checkedCount = cl.items.filter(i => i.isChecked).length
                            const pct = cl.items.length === 0 ? 0 : Math.round((checkedCount / cl.items.length) * 100)
                            return (
                                <div
                                    key={cl.id}
                                    onClick={() => setSelectedChecklistId(cl.id)}
                                    className={cn(
                                        "p-3 rounded-xl border transition-all cursor-pointer group",
                                        selectedChecklistId === cl.id ? "bg-panel-muted border-qa-accent/40 shadow-lg shadow-qa-accent/5" : "bg-transparent border-transparent hover:bg-surface-alt/50"
                                    )}
                                >
                                    <div className="text-xs font-semibold text-qa-text mb-1 truncate">{cl.name}</div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-qa-accent">{cl.category}</span>
                                        <span className={cn(pct === 100 ? "text-state-success" : "text-qa-text-muted")}>{pct}% complete</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </aside>

                {/* Main Panel */}
                <main className="flex-1 flex flex-col min-w-0 bg-app">
                    {!selectedChecklist ? (
                        <div className="h-full flex items-center justify-center p-6">
                            <EmptyState
                                icon={ListChecks}
                                title="No checklist selected"
                                description="Choose a checklist from the list, or create a new one."
                                className="w-full max-w-md"
                                actions={
                                    <Button onClick={handleCreate} className="gap-2">
                                        <Plus className="h-4 w-4" /> New checklist
                                    </Button>
                                }
                            />
                        </div>
                    ) : (
                        <div className="h-full flex flex-col animate-in fade-in duration-500">
                            <header className="p-6 bg-panel border-b border-qa-border flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <Input
                                        value={selectedChecklist!.name}
                                        onChange={(e) => updateChecklist(activeProjectId!, selectedChecklist!.id, { name: e.target.value })}
                                        className="max-w-[400px] h-9 bg-transparent border-none text-2xl font-semibold text-qa-text focus-visible:ring-0 px-0 min-w-0"
                                    />
                                    <div className="w-px h-6 bg-qa-border shrink-0" />
                                    <Select value={selectedChecklist!.category} onValueChange={(val) => updateChecklist(activeProjectId!, selectedChecklist!.id, { category: val })}>
                                        <SelectTrigger className="w-[160px] h-8 bg-panel-muted border-qa-border text-xs text-qa-accent shrink-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-panel-muted border-qa-border text-qa-text">
                                            <SelectItem value="Pre-Deployment">Pre-Deployment</SelectItem>
                                            <SelectItem value="Release Sign-off">Release Sign-off</SelectItem>
                                            <SelectItem value="SAP Commerce">SAP Commerce</SelectItem>
                                            <SelectItem value="Smoke Test">Smoke Test</SelectItem>
                                            <SelectItem value="QA">QA Verification</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button variant="ghost" size="icon" onClick={() => deleteChecklist(activeProjectId!, selectedChecklist!.id)} aria-label="Delete checklist" className="text-state-danger hover:bg-state-danger-soft">
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                </div>
                            </header>

                            <div className="p-4 bg-panel border-b border-qa-border flex items-center justify-between">
                                <div className="flex-1 max-w-xl pr-12">
                                    <div className="flex justify-between mb-1.5">
                                        <span className="app-field-label mb-0">Progress</span>
                                        <span className="text-[11px] text-qa-text-muted">{Math.round((selectedChecklist!.items.filter((i: any) => i.isChecked).length / (selectedChecklist!.items.length || 1)) * 100)}%</span>
                                    </div>
                                    <Progress value={(selectedChecklist!.items.filter((i: any) => i.isChecked).length / (selectedChecklist!.items.length || 1)) * 100} role="progressbar" aria-valuenow={Math.round((selectedChecklist!.items.filter((i: any) => i.isChecked).length / (selectedChecklist!.items.length || 1)) * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 bg-panel-muted text-qa-accent" />
                                </div>
                                <Button onClick={handleAddItem} variant="outline" className="h-8 gap-2 text-xs">
                                    <Plus className="h-3.5 w-3.5" /> Add item
                                </Button>
                            </div>

                            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-2">
                                {selectedChecklist!.items.map(item => (
                                    <div key={item.id} className={cn("p-4 rounded-2xl border flex items-center gap-4 transition-all group",
                                        item.isChecked ? "bg-surface-alt/40 border-state-success-border" : "bg-transparent border-qa-border")}>
                                        <Checkbox
                                            checked={item.isChecked}
                                            onCheckedChange={() => toggleChecklistItem(activeProjectId!, selectedChecklist!.id, item.id)}
                                            className={cn("h-6 w-6 rounded-lg", item.isChecked && "bg-emerald-500 border-state-success text-primary-foreground")}
                                        />
                                        <div className={cn("flex-1 text-sm font-medium transition-all", item.isChecked ? "text-qa-text-muted line-through" : "text-qa-text")}>
                                            <FormattedText content={item.text} projectId={activeProjectId || undefined} />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deleteChecklistItem(activeProjectId!, selectedChecklist!.id, item.id)}
                                            aria-label="Delete checklist item"
                                            className="h-8 w-8 text-qa-text-muted opacity-0 group-hover:opacity-100 hover:text-state-danger transition-all"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </Button>
                                    </div>
                                ))}
                                <div className="pt-4">
                                    <Input
                                        value={newItemText}
                                        onChange={e => setNewItemText(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                                        placeholder="Add a checklist item…"
                                        className="h-12 bg-surface-alt/50 border-dashed border-qa-border text-sm text-qa-text px-6 rounded-2xl"
                                    />
                                </div>
                            </div>

                            <footer className="p-4 bg-panel border-t border-qa-border flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <ShieldCheck className="h-4 w-4 text-state-success" />
                                    <span className="text-xs text-qa-text-muted">Changes are saved automatically</span>
                                </div>
                                <Button variant="ghost" className="h-8 text-xs text-qa-accent gap-2" onClick={async () => {
                                    const ok = await confirmReset('Reset all items?', { description: 'All checkmarks will be cleared. This cannot be undone.', confirmLabel: 'Reset all' })
                                    if (ok) updateChecklist(activeProjectId!, selectedChecklist!.id, { items: selectedChecklist!.items.map(i => ({ ...i, isChecked: false })) })
                                }}>
                                    <RefreshCcw className="h-3 w-3" /> Reset all
                                </Button>
                            </footer>
                        </div>
                    )}
                </main>
            </div>
            {confirmResetDialog}
        </div>
    )
}
