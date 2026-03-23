import { lazy, Suspense, useState, useEffect, useRef } from "react"
import { NOTE_TITLE_DEBOUNCE_MS, NOTE_CONTENT_DEBOUNCE_MS } from "@/lib/constants"
import { useProjectStore } from "@/store/useProjectStore"
import { Plus, Trash2, Paperclip, ExternalLink, StickyNote, Code, PanelRightClose, PanelRightOpen, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { format } from "date-fns"
import { toast } from "sonner"
import { useConfirm } from "@/components/ConfirmDialog"

const RichTextEditor = lazy(() => import("@/components/editor/RichTextEditor").then((module) => ({ default: module.RichTextEditor })))

export default function NotesPage() {
    const { projects, activeProjectId, addNote, updateNote, deleteNote, removeAttachmentFromNote, attachFileToNote, linkArtifact } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const notes = activeProject?.notes || []
    const api = window.electronAPI
    const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm()

    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [linkedTaskFilter, setLinkedTaskFilter] = useState<string>("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [sourceMode, setSourceMode] = useState(false)
    const [attachmentsOpen, setAttachmentsOpen] = useState(false)

    const selectedNote = notes.find(n => n.id === selectedItemId)
    const artifactLinks = activeProject?.artifactLinks || []
    const filteredNotes = notes.filter((note) => {
        if (linkedTaskFilter !== 'all') {
            const linked = artifactLinks.some((link) =>
                ((link.sourceType === 'task' && link.sourceId === linkedTaskFilter && link.targetType === 'note' && link.targetId === note.id) ||
                (link.targetType === 'task' && link.targetId === linkedTaskFilter && link.sourceType === 'note' && link.sourceId === note.id))
            )
            if (!linked) return false
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            const titleMatch = note.title.toLowerCase().includes(q)
            const contentMatch = note.content.toLowerCase().includes(q)
            if (!titleMatch && !contentMatch) return false
        }
        return true
    })

    // Local editor state to avoid persisting on every keystroke.
    const [titleState, setTitleState] = useState<string>(selectedNote?.title || '')
    const [contentState, setContentState] = useState<string>(selectedNote?.content || '')
    const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Track which note ID the pending debounce timers belong to, so a timer
    // scheduled for note A can never fire and overwrite note B's data.
    const timerNoteIdRef = useRef<string | null>(null)

    // Initialize local state whenever a different note is selected.
    // Clear pending debounce timers first so a stale write from the previously
    // selected note can never fire after the selection has already changed.
    useEffect(() => {
        if (titleTimer.current) { clearTimeout(titleTimer.current); titleTimer.current = null }
        if (contentTimer.current) { clearTimeout(contentTimer.current); contentTimer.current = null }
        timerNoteIdRef.current = selectedItemId
        setTitleState(selectedNote?.title || '')
        setContentState(selectedNote?.content || '')
        setSourceMode(false)
    }, [selectedItemId])

    // Debounced save for title
    useEffect(() => {
        if (!selectedItemId || !activeProjectId) return
        if (titleTimer.current) clearTimeout(titleTimer.current)
        const noteId = selectedItemId
        titleTimer.current = setTimeout(() => {
            if (timerNoteIdRef.current !== noteId) return
            updateNote(activeProjectId!, noteId, { title: titleState })
        }, NOTE_TITLE_DEBOUNCE_MS)
        return () => { if (titleTimer.current) clearTimeout(titleTimer.current) }
    }, [titleState, selectedItemId, activeProjectId])

    // Debounced save for content
    useEffect(() => {
        if (!selectedItemId || !activeProjectId) return
        if (contentTimer.current) clearTimeout(contentTimer.current)
        const noteId = selectedItemId
        contentTimer.current = setTimeout(() => {
            if (timerNoteIdRef.current !== noteId) return
            updateNote(activeProjectId!, noteId, { content: contentState })
        }, NOTE_CONTENT_DEBOUNCE_MS)
        return () => { if (contentTimer.current) clearTimeout(contentTimer.current) }
    }, [contentState, selectedItemId, activeProjectId])

    const handleAddNote = async () => {
        if (!activeProjectId) return
        const newNote = await addNote(activeProjectId, "New Note")
        setSelectedItemId(newNote.id)
    }

    const handleDelete = async (id: string) => {
        if (!activeProjectId) return
        const ok = await confirmDialog('Delete this record?', { description: 'This action cannot be undone.', confirmLabel: 'Delete', destructive: true })
        if (ok) {
            await deleteNote(activeProjectId, id)
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
                <div className="p-4 border-b border-[#2A2A3A]">
                    <h3 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">
                        KNOWLEDGE REPOSITORY
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    <div className="px-2 mb-2 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#6B7280] pointer-events-none" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search notes..."
                                className="h-8 pl-7 text-[11px] bg-[#0F0F13] border-[#2A2A3A] text-[#E2E8F0] placeholder:text-[#6B7280]"
                            />
                        </div>
                        <select value={linkedTaskFilter} onChange={(e) => setLinkedTaskFilter(e.target.value)} className="w-full h-8 rounded-md bg-[#0F0F13] border border-[#2A2A3A] px-2 text-[11px] text-[#E2E8F0]">
                            <option value="all">All Notes</option>
                            {(activeProject?.tasks || []).map((task) => (
                                <option key={task.id} value={task.id}>{task.title}</option>
                            ))}
                        </select>
                    </div>
                    {filteredNotes.map(note => (
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
                            <div className="flex flex-wrap gap-1 mt-2">
                                {artifactLinks.filter((link) =>
                                    (link.sourceType === 'note' && link.sourceId === note.id && link.targetType === 'task') ||
                                    (link.targetType === 'note' && link.targetId === note.id && link.sourceType === 'task')
                                ).map((link) => {
                                    const taskId = link.sourceType === 'task' ? link.sourceId : link.targetId
                                    const task = activeProject?.tasks.find((item) => item.id === taskId)
                                    return task ? <span key={link.id} className="px-1.5 py-0.5 rounded bg-[#A78BFA]/10 text-[#A78BFA] text-[9px]">{task.title}</span> : null
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A]">
                    <Button onClick={handleAddNote} className="w-full bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-black text-xs h-10 gap-2">
                        <Plus className="h-4 w-4" /> NEW NOTE
                    </Button>
                </div>
            </aside>

            {/* Editor Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {!selectedItemId ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#6B7280] opacity-30">
                        <StickyNote className="h-16 w-16 mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">Select a note</p>
                    </div>
                ) : selectedNote ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <header className="p-6 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between gap-4">
                                    <Input
                                        value={titleState}
                                        onChange={(e) => setTitleState(e.target.value)}
                                        onBlur={() => {
                                            if (!activeProjectId || !selectedNote) return
                                            // flush immediate save on blur
                                            updateNote(activeProjectId, selectedNote.id, { title: titleState })
                                        }}
                                        className="bg-transparent border-none text-2xl font-black text-[#E2E8F0] focus-visible:ring-0 px-0 h-auto min-w-0 flex-1"
                                    />
                            <div className="flex gap-2 shrink-0">
                                <select
                                    onChange={async (event) => {
                                        const taskId = event.target.value
                                        if (!activeProjectId || !selectedNote || !taskId) return
                                        await linkArtifact(activeProjectId, { sourceType: 'task', sourceId: taskId, targetType: 'note', targetId: selectedNote.id, label: 'documents' })
                                        toast.success('Note linked to task.')
                                        event.currentTarget.value = ''
                                    }}
                                    className="h-9 rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-2 text-[10px] text-[#E2E8F0]"
                                >
                                    <option value="">Link to task...</option>
                                    {(activeProject?.tasks || []).map((task) => (
                                        <option key={task.id} value={task.id}>{task.title}</option>
                                    ))}
                                </select>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSourceMode(s => !s)}
                                    className={cn("h-9 w-9", sourceMode ? "text-[#A78BFA] bg-[#A78BFA]/10" : "text-[#6B7280] hover:text-[#A78BFA]")}
                                    title={sourceMode ? "Switch to Visual Editor" : "Switch to HTML Source"}
                                    aria-label={sourceMode ? "Switch to Visual Editor" : "Switch to HTML Source"}
                                >
                                    <Code className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setAttachmentsOpen(v => !v)}
                                    className={cn("h-9 w-9", attachmentsOpen ? "text-[#A78BFA] bg-[#A78BFA]/10" : "text-[#6B7280] hover:text-[#A78BFA]")}
                                    title={attachmentsOpen ? "Hide Attachments" : "Show Attachments"}
                                    aria-label={attachmentsOpen ? "Hide Attachments" : "Show Attachments"}
                                >
                                    {attachmentsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(selectedNote.id)} className="text-[#EF4444] hover:bg-[#EF4444]/10" aria-label="Delete note">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button className="h-9 px-6 bg-[#A78BFA] text-[#0F0F13] font-black text-xs">AUTO-SAVING</Button>
                            </div>
                        </header>
                        <div className="flex-1 flex overflow-hidden">
                            {sourceMode ? (
                                <textarea
                                    value={contentState}
                                    onChange={e => setContentState(e.target.value)}
                                    className="flex-1 bg-[#0F0F13] text-[#E2E8F0] font-mono text-sm p-8 resize-none focus:outline-none custom-scrollbar border-none"
                                    spellCheck={false}
                                />
                            ) : (
                                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-[#6B7280]">Loading editor...</div>}>
                                    <RichTextEditor
                                        content={contentState}
                                        onChange={(content) => setContentState(content)}
                                    />
                                </Suspense>
                            )}
                            <aside className={cn(
                                "border-l border-[#2A2A3A] bg-[#13131A]/30 flex flex-col transition-all duration-300 overflow-hidden",
                                attachmentsOpen ? "w-64 shrink-0" : "w-0 border-l-0"
                            )}>
                                <div className="p-4 border-b border-[#2A2A3A] flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Attachments</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[#A78BFA]" onClick={async () => {
                                        if (!activeProjectId || !selectedNote) return;
                                        const filePath = await api.selectFile();
                                        if (filePath) {
                                            try {
                                                await attachFileToNote(activeProjectId, selectedNote.id, filePath);
                                            } catch (e: any) {
                                                toast.error('Attachment failed: ' + e.message);
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
                                                <span className="text-xs text-[#E2E8F0] truncate flex-1" onClick={() => api.openFile(at.filePath)}>{at.fileName}</span>
                                                <div className="flex items-center gap-1">
                                                    <ExternalLink className="h-3 w-3 text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => api.openFile(at.filePath)} />
                                                    <Trash2 className="h-3 w-3 text-[#EF4444] opacity-0 group-hover:opacity-100 transition-opacity" onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!activeProjectId || !selectedNote) return;
                                                        const linkedHandoffs = (activeProject?.handoffPackets || []).filter((packet) => packet.linkedNoteIds.includes(selectedNote.id))
                                                        if (linkedHandoffs.length > 0) {
                                                            toast.error('This attachment is linked to an active handoff. Remove the handoff link first.')
                                                            return
                                                        }
                                                        await removeAttachmentFromNote(activeProjectId, selectedNote.id, at.id);
                                                        api.deleteAttachment(at.filePath);
                                                    }} />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </aside>
                        </div>
                    </div>
                ) : null}
            </main>
            {confirmDialogEl}
        </div>
    )
}
