import { useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { ListChecks, Plus, Search, Trash2, Save, RefreshCcw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "../components/ui/progress"
import { cn } from "@/lib/utils"
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

    if (!activeProjectId || !activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <ListChecks className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to manage checklists.</p>
                </div>
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
        <div className="h-full flex animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[300px] flex-none bg-[#13131A] border-r border-[#2A2A3A] flex flex-col">
                <div className="p-4 border-b border-[#2A2A3A] space-y-1">
                    <h3 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">CHECKLISTS</h3>
                    <p className="text-[11px] text-[#6B7280] leading-tight">QA verification & release gates</p>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280]" />
                        <Input
                            placeholder="Filter registry..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[#0F0F13] border-[#2A2A3A] text-xs text-[#E2E8F0]"
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
                                    selectedChecklistId === cl.id ? "bg-[#1A1A24] border-[#A78BFA]/40 shadow-lg shadow-[#A78BFA]/5" : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                                )}
                            >
                                <div className="text-xs font-bold text-[#E2E8F0] mb-1 truncate">{cl.name}</div>
                                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                    <span className="text-[#A78BFA]">{cl.category}</span>
                                    <span className={cn(pct === 100 ? "text-[#10B981]" : "text-[#6B7280]")}>{pct}% COMPLETE</span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A] space-y-2">
                    <Button onClick={handleCreate} className="w-full h-10 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-black text-xs gap-2">
                        <Plus className="h-4 w-4" /> NEW CHECKLIST
                    </Button>
                </div>
            </aside>

            {/* Main Panel */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {!selectedChecklist ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center">
                            <ListChecks className="h-10 w-10 text-[#6B7280]" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-[#E2E8F0]">Select a checklist</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col animate-in fade-in duration-500">
                        <header className="p-6 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                                <Input
                                    value={selectedChecklist!.name}
                                    onChange={(e) => updateChecklist(activeProjectId!, selectedChecklist!.id, { name: e.target.value })}
                                    className="max-w-[400px] h-9 bg-transparent border-none text-2xl font-black text-[#E2E8F0] focus-visible:ring-0 px-0"
                                />
                                <div className="w-px h-6 bg-[#2A2A3A]" />
                                <Select value={selectedChecklist!.category} onValueChange={(val) => updateChecklist(activeProjectId!, selectedChecklist!.id, { category: val })}>
                                    <SelectTrigger className="w-[160px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold uppercase text-[#A78BFA]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                        <SelectItem value="Pre-Deployment">Pre-Deployment</SelectItem>
                                        <SelectItem value="Release Sign-off">Release Sign-off</SelectItem>
                                        <SelectItem value="SAP Commerce">SAP Commerce</SelectItem>
                                        <SelectItem value="Smoke Test">Smoke Test</SelectItem>
                                        <SelectItem value="QA">QA Verification</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="icon" onClick={() => deleteChecklist(activeProjectId!, selectedChecklist!.id)} className="text-[#EF4444] hover:bg-[#EF4444]/10">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button className="h-9 px-6 bg-[#A78BFA] text-[#0F0F13] font-black text-xs gap-2">
                                    <Save className="h-3.5 w-3.5" /> SAVE
                                </Button>
                            </div>
                        </header>

                        <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex-1 max-w-xl pr-12">
                                <div className="flex justify-between text-[10px] font-black text-[#6B7280] uppercase tracking-widest mb-1.5">
                                    <span>Sign-off Integrity Index</span>
                                    <span>{Math.round((selectedChecklist!.items.filter((i: any) => i.isChecked).length / (selectedChecklist!.items.length || 1)) * 100)}%</span>
                                </div>
                                <Progress value={(selectedChecklist!.items.filter((i: any) => i.isChecked).length / (selectedChecklist!.items.length || 1)) * 100} className="h-1.5 bg-[#1A1A24] text-[#A78BFA]" />
                            </div>
                            <Button onClick={handleAddItem} className="h-8 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-black text-[10px] uppercase gap-2">
                                <Plus className="h-3.5 w-3.5" /> ADD REQUIREMENT
                            </Button>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-2">
                            {selectedChecklist!.items.map(item => (
                                <div key={item.id} className={cn("p-4 rounded-2xl border flex items-center gap-4 transition-all group",
                                    item.isChecked ? "bg-[#1A1A24]/40 border-[#10B981]/20" : "bg-transparent border-[#2A2A3A]")}>
                                    <Checkbox
                                        checked={item.isChecked}
                                        onCheckedChange={() => toggleChecklistItem(activeProjectId!, selectedChecklist!.id, item.id)}
                                        className={cn("h-6 w-6 rounded-lg", item.isChecked && "bg-[#10B981] border-[#10B981] text-[#0F0F13]")}
                                    />
                                    <div className={cn("flex-1 text-sm font-bold transition-all", item.isChecked ? "text-[#6B7280] line-through" : "text-[#E2E8F0]")}>
                                        {item.text}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteChecklistItem(activeProjectId!, selectedChecklist!.id, item.id)}
                                        className="h-8 w-8 text-[#6B7280] opacity-0 group-hover:opacity-100 hover:text-[#EF4444] transition-all"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <div className="pt-4">
                                <Input
                                    value={newItemText}
                                    onChange={e => setNewItemText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                                    placeholder="Enter new verification point..."
                                    className="h-12 bg-[#1A1A24]/50 border-dashed border-[#2A2A3A] text-sm text-[#E2E8F0] px-6 rounded-2xl"
                                />
                            </div>
                        </div>

                        <footer className="p-4 bg-[#13131A] border-t border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <ShieldCheck className="h-4 w-4 text-[#10B981]" />
                                <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest">Checklist verified</span>
                            </div>
                            <Button variant="ghost" className="h-8 text-[10px] font-black text-[#A78BFA] uppercase tracking-widest gap-2">
                                <RefreshCcw className="h-3 w-3" /> RESET ALL
                            </Button>
                        </footer>
                    </div>
                )}
            </main>
        </div>
    )
}
