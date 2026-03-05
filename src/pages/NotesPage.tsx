import { useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { Plus, Trash2, Paperclip, ExternalLink, CheckCircle2, StickyNote, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "../components/ui/progress"
import { format } from "date-fns"
import { RichTextEditor } from "@/components/editor/RichTextEditor"

type SidebarTab = 'Notes' | 'Runbooks'

export default function NotesPage() {
    const { projects, activeProjectId, addNote, updateNote, deleteNote, removeAttachmentFromNote, attachFileToNote } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const notes = activeProject?.notes || []
    const api = (window as any).electronAPI
    // Mock runbooks for UI parity as they might not be in store yet
    const [runbooks] = useState<any[]>([
        { id: '1', title: 'v2.4.0 Release Plan', category: 'Deployment', steps: 12, completed: 8, updatedAt: new Date() },
        { id: '2', title: 'Data Migration - STG', category: 'Hotfix', steps: 5, completed: 5, updatedAt: new Date() }
    ])

    const [activeTab, setActiveTab] = useState<SidebarTab>('Notes')
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

    const selectedNote = notes.find(n => n.id === selectedItemId)
    const selectedRunbook = runbooks.find(r => r.id === selectedItemId)

    const handleAddNote = async () => {
        if (!activeProjectId) return
        const newNote = await addNote(activeProjectId, "New Note")
        setSelectedItemId(newNote.id)
    }

    const handleDelete = async (id: string) => {
        if (!activeProjectId) return
        if (confirm("Delete this record?")) {
            if (activeTab === 'Notes') {
                await deleteNote(activeProjectId, id)
            }
            setSelectedItemId(null)
        }
    }

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <StickyNote className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to manage notes.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[280px] flex-none bg-[#13131A] border-r border-[#2A2A3A] flex flex-col">
                <div className="p-2 bg-[#1A1A24]/50 flex gap-1 border-b border-[#2A2A3A]">
                    <Button
                        onClick={() => { setActiveTab('Notes'); setSelectedItemId(null); }}
                        className={cn("flex-1 h-8 text-[10px] font-black uppercase tracking-widest rounded-md transition-all",
                            activeTab === 'Notes' ? "bg-[#A78BFA] text-[#0F0F13]" : "bg-transparent text-[#6B7280] hover:bg-[#1A1A24]")}
                    >
                        Notes
                    </Button>
                    <Button
                        onClick={() => { setActiveTab('Runbooks'); setSelectedItemId(null); }}
                        className={cn("flex-1 h-8 text-[10px] font-black uppercase tracking-widest rounded-md transition-all",
                            activeTab === 'Runbooks' ? "bg-[#A78BFA] text-[#0F0F13]" : "bg-transparent text-[#6B7280] hover:bg-[#1A1A24]")}
                    >
                        Runbooks
                    </Button>
                </div>

                <div className="p-4 border-b border-[#2A2A3A]">
                    <h3 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">
                        {activeTab === 'Notes' ? 'KNOWLEDGE REPOSITORY' : 'OPERATIONAL RUNBOOKS'}
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {activeTab === 'Notes' ? (
                        notes.map(note => (
                            <div
                                key={note.id}
                                onClick={() => setSelectedItemId(note.id)}
                                className={cn(
                                    "p-3 rounded-xl border transition-all cursor-pointer group",
                                    selectedItemId === note.id ? "bg-[#1A1A24] border-[#A78BFA]/40" : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                                )}
                            >
                                <div className="text-xs font-bold text-[#E2E8F0] mb-1 truncate">{note.title || "Untitled Note"}</div>
                                <div className="text-[10px] text-[#6B7280] font-medium">{format(note.updatedAt, "MMM d, HH:mm")}</div>
                            </div>
                        ))
                    ) : (
                        runbooks.map(rb => (
                            <div
                                key={rb.id}
                                onClick={() => setSelectedItemId(rb.id)}
                                className={cn(
                                    "p-3 rounded-xl border transition-all cursor-pointer group",
                                    selectedItemId === rb.id ? "bg-[#1A1A24] border-[#A78BFA]/40" : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                                )}
                            >
                                <div className="text-xs font-bold text-[#E2E8F0] mb-1 truncate">{rb.title}</div>
                                <div className="flex items-center justify-between text-[9px] font-bold">
                                    <span className="text-[#A78BFA] uppercase tracking-tighter">{rb.category}</span>
                                    <span className="text-[#6B7280]">{rb.completed}/{rb.steps} STEPS</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A]">
                    <Button onClick={handleAddNote} className="w-full bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-black text-xs h-10 gap-2">
                        <Plus className="h-4 w-4" /> NEW {activeTab === 'Notes' ? 'NOTE' : 'RUNBOOK'}
                    </Button>
                </div>
            </aside>

            {/* Editor Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {!selectedItemId ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#6B7280] opacity-30">
                        {activeTab === 'Notes' ? <StickyNote className="h-16 w-16 mb-4" /> : <BookOpen className="h-16 w-16 mb-4" />}
                        <p className="text-sm font-bold uppercase tracking-widest">Select a note or runbook</p>
                    </div>
                ) : activeTab === 'Notes' && selectedNote ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <header className="p-6 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                            <Input
                                value={selectedNote.title}
                                onChange={(e) => activeProjectId && updateNote(activeProjectId, selectedNote.id, { title: e.target.value })}
                                className="bg-transparent border-none text-2xl font-black text-[#E2E8F0] focus-visible:ring-0 px-0 h-auto"
                            />
                            <div className="flex gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(selectedNote.id)} className="text-[#EF4444] hover:bg-[#EF4444]/10">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button className="h-9 px-6 bg-[#A78BFA] text-[#0F0F13] font-black text-xs">AUTO-SAVING</Button>
                            </div>
                        </header>
                        <div className="flex-1 flex overflow-hidden">
                            <RichTextEditor
                                content={selectedNote.content}
                                onChange={(content) => activeProjectId && updateNote(activeProjectId, selectedNote.id, { content })}
                            />
                            <aside className="w-64 border-l border-[#2A2A3A] bg-[#13131A]/30 flex flex-col">
                                <div className="p-4 border-b border-[#2A2A3A] flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Attachments</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[#A78BFA]" onClick={async () => {
                                        if (!activeProjectId || !selectedNote) return;
                                        const filePath = await api.selectFile();
                                        if (filePath) {
                                            try {
                                                await attachFileToNote(activeProjectId, selectedNote.id, filePath);
                                            } catch (e: any) {
                                                alert('Attachment failed: ' + e.message);
                                            }
                                        }
                                    }}><Paperclip className="h-3.5 w-3.5" /></Button>
                                </div>
                                <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar">
                                    {selectedNote.attachments.length === 0 ? (
                                        <p className="text-[10px] text-[#6B7280] italic text-center py-8">Digital void...</p>
                                    ) : (
                                        selectedNote.attachments.map(at => (
                                            <div key={at.id} className="p-2 border border-[#2A2A3A] rounded-lg flex items-center justify-between group hover:border-[#A78BFA]/50 transition-all cursor-pointer">
                                                <span className="text-xs text-[#E2E8F0] truncate flex-1" onClick={() => api.openFile(at.path)}>{at.name}</span>
                                                <div className="flex items-center gap-1">
                                                    <ExternalLink className="h-3 w-3 text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => api.openFile(at.path)} />
                                                    <Trash2 className="h-3 w-3 text-[#EF4444] opacity-0 group-hover:opacity-100 transition-opacity" onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!activeProjectId || !selectedNote) return;
                                                        await removeAttachmentFromNote(activeProjectId, selectedNote.id, at.id);
                                                        api.deleteAttachment(at.path);
                                                    }} />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </aside>
                        </div>
                    </div>
                ) : activeTab === 'Runbooks' && selectedRunbook ? (
                    <div className="flex-1 flex flex-col overflow-hidden p-8 space-y-8">
                        <header className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-3xl font-black text-[#E2E8F0]">{selectedRunbook.title}</h2>
                                <span className="px-3 py-1 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    {selectedRunbook.category}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
                                    <span>Deployment Integrity</span>
                                    <span>{Math.round((selectedRunbook.completed / selectedRunbook.steps) * 100)}%</span>
                                </div>
                                <Progress value={(selectedRunbook.completed / selectedRunbook.steps) * 100} className="h-2 bg-[#1A1A24] text-[#A78BFA]" />
                            </div>
                        </header>

                        <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={cn("p-4 rounded-2xl border flex items-center gap-4 transition-all",
                                    i <= selectedRunbook.completed ? "bg-[#1A1A24]/40 border-[#A78BFA]/20" : "bg-transparent border-[#2A2A3A] opacity-50")}>
                                    <div className={cn("h-6 w-6 rounded-full flex items-center justify-center border-2",
                                        i <= selectedRunbook.completed ? "bg-[#A78BFA] border-[#A78BFA]" : "border-[#2A2A3A]")}>
                                        {i <= selectedRunbook.completed && <CheckCircle2 className="h-4 w-4 text-[#0F0F13]" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-[#E2E8F0]">Step {i}: Infrastructure Verification</div>
                                        <div className="text-[10px] text-[#6B7280] font-medium mt-0.5">Automated validation of project endpoints.</div>
                                    </div>
                                    <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                                        {i <= selectedRunbook.completed ? 'VERIFIED' : 'PENDING'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <footer className="pt-4 border-t border-[#2A2A3A] flex justify-between items-center text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">
                            <span>Last Sync: {format(selectedRunbook.updatedAt, "HH:mm:ss")}</span>
                            <div className="flex gap-4">
                                <button className="hover:text-[#A78BFA] transition-colors">Reset Pipeline</button>
                                <button className="text-[#A78BFA] hover:text-[#C4B5FD] transition-colors underline decoration-2 underline-offset-4">Add Log Entry</button>
                            </div>
                        </footer>
                    </div>
                ) : null}
            </main>
        </div>
    )
}
