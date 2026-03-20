import { useState } from "react"
/* cspell:ignore IMPEX */
import { useProjectStore, TestDataEntry, TestDataGroup } from "@/store/useProjectStore"
import { toast } from "sonner"
import { DatabaseZap, Plus, Trash2, Search, TerminalSquare, Layers, ShieldCheck, Trash, Edit2, Download, Upload, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { IMPEX_TEMPLATES } from "@/data/impexTemplates"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import FormattedText from "@/components/FormattedText"

type ViewState = 'Groups' | 'ImpEx'

export default function TestDataPage() {
    const {
        projects,
        activeProjectId,
        addTestDataGroup,
        updateTestDataGroup,
        deleteTestDataGroup,
        addTestDataEntry,
        updateTestDataEntry,
        deleteTestDataEntry
    } = useProjectStore()

    const activeProject = projects.find(p => p.id === activeProjectId)
    const [view, setView] = useState<ViewState>('Groups')
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

    // Group Modal State
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
    const [groupForm, setGroupForm] = useState({ name: "", category: "Custom" })

    // Entry Modal State
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false)
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
    const [entryForm, setEntryForm] = useState({
        key: "",
        value: "",
        description: "",
        tags: "",
        environment: "All"
    })

    const groups = activeProject?.testDataGroups || []
    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    const selectedGroup = groups.find(g => g.id === selectedGroupId)

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <DatabaseZap className="h-9 w-9 text-qa-text-muted" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-qa-text uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-qa-text-muted">Select a project to manage test data.</p>
                </div>
            </div>
        )
    }

    const handleOpenGroupModal = (group?: TestDataGroup) => {
        if (group) {
            setEditingGroupId(group.id)
            setGroupForm({ name: group.name, category: group.category })
        } else {
            setEditingGroupId(null)
            setGroupForm({ name: "", category: "Custom" })
        }
        setIsGroupModalOpen(true)
    }

    const handleSaveGroup = async () => {
        if (!activeProjectId || !groupForm.name.trim()) return
        if (editingGroupId) {
            await updateTestDataGroup(activeProjectId, editingGroupId, groupForm)
        } else {
            await addTestDataGroup(activeProjectId, groupForm.name.trim(), groupForm.category)
        }
        setIsGroupModalOpen(false)
    }

    const handleOpenEntryModal = (entry?: TestDataEntry) => {
        if (entry) {
            setEditingEntryId(entry.id)
            setEntryForm({
                key: entry.key,
                value: entry.value,
                description: entry.description || "",
                tags: entry.tags || "",
                environment: entry.environment || "All"
            })
        } else {
            setEditingEntryId(null)
            setEntryForm({
                key: "",
                value: "",
                description: "",
                tags: "",
                environment: "All"
            })
        }
        setIsEntryModalOpen(true)
    }

    const handleSaveEntry = async () => {
        if (!activeProjectId || !selectedGroupId || !entryForm.key.trim()) return
        if (editingEntryId) {
            await updateTestDataEntry(activeProjectId, selectedGroupId, editingEntryId, entryForm)
        } else {
            await addTestDataEntry(activeProjectId, selectedGroupId, entryForm)
        }
        setIsEntryModalOpen(false)
    }

    const handleExport = async () => {
        if (!selectedGroup || !window.electronAPI) return
        const content = JSON.stringify(selectedGroup, null, 2)
        await window.electronAPI.saveFileDialog({
            defaultName: `${selectedGroup.name.replace(/\s+/g, '_')}_TestData.json`,
            content
        })
    }

    const handleImport = async () => {
        if (!activeProjectId || !selectedGroupId || !window.electronAPI) return
        const res = await window.electronAPI.selectFile()
        if (res) {
            const fileData = await window.electronAPI.readJsonFile({ filePath: res })
            if (fileData.success && fileData.data) {
                const group = fileData.data as TestDataGroup
                for (const entry of group.entries) {
                    await addTestDataEntry(activeProjectId, selectedGroupId, entry)
                }
            }
        }
    }

    return (
        <div className="h-full flex animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[280px] flex-none bg-[#13131A] border-r border-qa-border flex flex-col">
                <div className="p-4 border-b border-qa-border space-y-1">
                    <h3 className="text-[10px] font-black text-qa-text-muted uppercase tracking-[0.2em]">{view === 'Groups' ? 'DATA GROUPS' : 'IMPEX TEMPLATES'}</h3>
                    <p className="text-[11px] text-qa-text-muted leading-tight">Reusable test data sets</p>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-qa-text-muted" />
                        <Input
                            placeholder="Search records..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[#0F0F13] border-qa-border text-xs text-qa-text"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {view === 'Groups' ? (
                        filteredGroups.map(group => (
                            <div
                                key={group.id}
                                onClick={() => setSelectedGroupId(group.id)}
                                className={cn(
                                    "p-3 rounded-xl border transition-all cursor-pointer group",
                                    selectedGroupId === group.id ? "bg-[#1A1A24] border-qa-purple/40 shadow-lg shadow-qa-purple/5" : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-qa-text mb-1 truncate">
                                        <FormattedText content={group.name} projectId={activeProjectId || undefined} />
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Edit2 className="h-3.5 w-3.5 text-qa-text-muted hover:text-qa-purple" onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenGroupModal(group)
                                        }} />
                                        <Trash2 className="h-3.5 w-3.5 text-qa-text-muted hover:text-red-500" onClick={(e) => {
                                            e.stopPropagation();
                                            if (activeProjectId) deleteTestDataGroup(activeProjectId, group.id);
                                            if (selectedGroupId === group.id) setSelectedGroupId(null);
                                        }} />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                    <span className="text-qa-purple">{group.category}</span>
                                    <span className="text-qa-text-muted">{group.entries.length} RECORDS</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        [...new Set(IMPEX_TEMPLATES.map(t => t.category))].map(cat => (
                            <div key={cat} className="p-3 rounded-xl border border-transparent hover:bg-[#1A1A24]/50 cursor-pointer text-xs font-bold text-qa-purple uppercase tracking-widest">
                                {cat}
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 bg-[#0F0F13] border-t border-qa-border space-y-2">
                    <Button onClick={() => handleOpenGroupModal()} className={cn("w-full h-10 font-black text-xs gap-2", view === 'Groups' ? "bg-qa-purple text-[#0F0F13]" : "bg-qa-purple/10 text-qa-purple border border-qa-purple/20")}>
                        <Plus className="h-4 w-4" /> NEW DATA GROUP
                    </Button>
                    <Button onClick={() => setView(view === 'Groups' ? 'ImpEx' : 'Groups')} className={cn("w-full h-10 font-black text-xs gap-2", view === 'ImpEx' ? "bg-qa-purple text-[#0F0F13]" : "bg-[#1A1A2E] text-qa-purple border border-qa-purple/20")}>
                        {view === 'Groups' ? 'SAP IMPEX TEMPLATES →' : '← BACK TO DATA GROUPS'}
                    </Button>
                </div>
            </aside>

            {/* Main Panel */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {!selectedGroupId && view === 'Groups' ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-qa-border flex items-center justify-center">
                            <DatabaseZap className="h-10 w-10 text-qa-text-muted" strokeWidth={1.5} />
                        </div>
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.2em] text-qa-text">Select Data Collection</p>
                            <p className="text-xs font-bold text-qa-text-muted mt-2">Store and replicate reusable test environments</p>
                        </div>
                    </div>
                ) : view === 'ImpEx' ? (
                    <div className="h-full flex flex-col p-8 space-y-8 animate-in slide-in-from-right-4 duration-500 overflow-y-auto custom-scrollbar">
                        <header className="flex items-center justify-between border-b border-qa-border pb-6">
                            <div>
                                <h2 className="text-2xl font-black text-qa-purple uppercase tracking-tight">SAP Commerce ImpEx Templates</h2>
                                <p className="text-xs font-bold text-qa-text-muted mt-1 uppercase tracking-widest">Ready-made ImpEx snippets</p>
                            </div>
                            <Button onClick={() => setView('Groups')} variant="outline" className="h-9 border-qa-border text-qa-text-muted font-black text-[10px] uppercase">← BACK TO GROUPS</Button>
                        </header>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {IMPEX_TEMPLATES.map(template => (
                                <div key={template.id} className="group p-6 bg-[#13131A] border border-qa-border rounded-[2rem] hover:border-qa-purple/50 transition-all cursor-pointer relative flex flex-col">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-[#1A1A24] flex items-center justify-center border border-qa-border">
                                            <TerminalSquare className="h-5 w-5 text-qa-purple" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-black text-qa-text truncate">{template.name}</div>
                                            <div className="text-[9px] font-black text-qa-text-muted uppercase tracking-widest">{template.category}</div>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-qa-text-muted mb-4 line-clamp-2">{template.description}</p>
                                    <pre className="text-[10px] font-mono text-qa-text-muted bg-[#0A0A0E] p-3 rounded-xl overflow-hidden truncate flex-1">
                                        {template.script}
                                    </pre>
                                    <Button
                                        onClick={() => {
                                            navigator.clipboard.writeText(template.script)
                                            toast.success('Snippet copied to clipboard')
                                        }}
                                        className="mt-4 w-full h-8 bg-qa-purple/10 text-qa-purple hover:bg-qa-purple/20 border border-qa-purple/20 font-black text-[9px] uppercase tracking-widest gap-2"
                                    >
                                        <Copy className="h-3 w-3" /> COPY SNIPPET
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col animate-in fade-in duration-500">
                        <header className="p-6 bg-[#13131A] border-b border-qa-border flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                                <h2 className="text-2xl font-black text-qa-text tracking-tight">{selectedGroup?.name}</h2>
                                <div className="w-px h-6 bg-qa-border" />
                                <div className="text-[10px] font-black text-qa-purple bg-qa-purple/10 px-2.5 py-1 rounded-full border border-qa-purple/20 uppercase">
                                    {selectedGroup?.category}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleExport} className="h-9 border-qa-border text-qa-text-muted font-black text-[10px] uppercase gap-2">
                                    <Download className="h-3.5 w-3.5" /> EXPORT
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleImport} className="h-9 border-qa-border text-qa-text-muted font-black text-[10px] uppercase gap-2">
                                    <Upload className="h-3.5 w-3.5" /> IMPORT
                                </Button>
                                <div className="w-px h-9 bg-qa-border mx-1" />
                                <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-500/10" onClick={() => {
                                    if (activeProjectId && selectedGroupId) deleteTestDataGroup(activeProjectId, selectedGroupId);
                                    setSelectedGroupId(null);
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </header>

                        <div className="p-4 bg-[#13131A] border-b border-qa-border flex items-center justify-between">
                            <div className="flex gap-4">
                                <div className="text-[10px] font-black text-qa-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Layers className="h-3 w-3 text-qa-purple" /> DATA RECORDS
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => {
                                    const allData = selectedGroup?.entries.map(e => `${e.key}: ${e.value}`).join('\n')
                                    if (allData) { navigator.clipboard.writeText(allData); toast.success('All records copied') }
                                }} className="h-7 text-qa-text-muted text-[10px] font-black uppercase tracking-widest hover:text-qa-text gap-2">
                                    <Copy className="h-3 w-3" /> COPY ALL
                                </Button>
                                <Button size="sm" onClick={() => handleOpenEntryModal()} className="h-7 bg-qa-purple/10 text-qa-purple border border-qa-purple/20 hover:bg-qa-purple/20 text-[10px] font-black uppercase tracking-widest">+ ADD ENTRY</Button>
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-3">
                            {selectedGroup?.entries.map((entry) => (
                                <div key={entry.id} className="group flex gap-4 items-center p-4 bg-[#1A1A24]/40 border border-qa-border rounded-2xl hover:border-qa-purple/30 transition-all">
                                    <div className="flex-none w-1/4">
                                        <div className="text-xs font-black text-qa-purple font-mono truncate">{entry.key}</div>
                                        {entry.environment && (
                                            <div className="text-[9px] font-black text-qa-text-muted uppercase mt-1">ENV: {entry.environment}</div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-qa-text font-medium">{entry.value}</div>
                                        {entry.description && (
                                            <div className="text-[10px] text-qa-text-muted mt-0.5 line-clamp-1">{entry.description}</div>
                                        )}
                                    </div>
                                    <div className="flex-none flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {entry.tags && (
                                            <div className="flex gap-1 mr-2">
                                                {entry.tags.split(',').map(tag => (
                                                    <span key={tag} className="px-1.5 py-0.5 rounded bg-[#1A1A24] border border-qa-border text-[9px] font-black text-qa-text-muted uppercase tracking-tighter">{tag.trim()}</span>
                                                ))}
                                            </div>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-qa-text-muted hover:text-qa-purple" onClick={() => handleOpenEntryModal(entry)}>
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-qa-text-muted hover:text-red-500" onClick={async () => {
                                            if (!activeProjectId || !selectedGroupId) return;
                                            await deleteTestDataEntry(activeProjectId, selectedGroupId, entry.id);
                                        }}>
                                            <Trash className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <footer className="p-4 bg-[#13131A] border-t border-qa-border flex items-center gap-4">
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            <span className="text-[10px] font-bold text-qa-text-muted uppercase tracking-widest">
                                {selectedGroup?.entries.length} RECORDS IN COLLECTION • VERIFIED INTEGRITY
                            </span>
                        </footer>
                    </div>
                )}
            </main>

            {/* Group Modal */}
            <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
                <DialogContent className="bg-[#13131A] border-qa-border sm:max-w-[400px] rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-qa-text font-black uppercase tracking-tight">
                            {editingGroupId ? 'Update Data Group' : 'Create New Data Group'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Group Name</label>
                            <Input
                                autoFocus
                                value={groupForm.name}
                                onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                                className="h-11 bg-[#1A1A24] border-qa-border text-qa-text font-bold rounded-xl"
                                placeholder="e.g. Prod Credentials"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Category</label>
                            <Select value={groupForm.category} onValueChange={(val) => setGroupForm(prev => ({ ...prev, category: val }))}>
                                <SelectTrigger className="h-11 bg-[#1A1A24] border-qa-border text-qa-text font-bold rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1A1A24] border-qa-border text-qa-text">
                                    <SelectItem value="Users">Users</SelectItem>
                                    <SelectItem value="Products">Products</SelectItem>
                                    <SelectItem value="Promotions">Promotions</SelectItem>
                                    <SelectItem value="Credentials">Credentials</SelectItem>
                                    <SelectItem value="Custom">Custom</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="bg-[#13131A]">
                        <Button variant="ghost" onClick={() => setIsGroupModalOpen(false)} className="text-qa-text-muted font-black uppercase text-xs">CANCEL</Button>
                        <Button
                            onClick={handleSaveGroup}
                            disabled={!groupForm.name.trim()}
                            className="bg-qa-purple text-[#0F0F13] font-black uppercase text-xs px-6 rounded-xl"
                        >
                            {editingGroupId ? 'UPDATE GROUP' : 'CREATE GROUP'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Entry Modal */}
            <Dialog open={isEntryModalOpen} onOpenChange={setIsEntryModalOpen}>
                <DialogContent className="bg-[#13131A] border-qa-border sm:max-w-[500px] rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-qa-text font-black uppercase tracking-tight">
                            {editingEntryId ? 'Update Data Entry' : 'Add New Entry'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar px-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Key</label>
                                <Input
                                    autoFocus
                                    value={entryForm.key}
                                    onChange={(e) => setEntryForm(prev => ({ ...prev, key: e.target.value }))}
                                    className="h-10 bg-[#1A1A24] border-qa-border text-qa-purple font-mono rounded-xl"
                                    placeholder="API_KEY"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Environment</label>
                                <Input
                                    value={entryForm.environment}
                                    onChange={(e) => setEntryForm(prev => ({ ...prev, environment: e.target.value }))}
                                    className="h-10 bg-[#1A1A24] border-qa-border text-qa-text rounded-xl"
                                    placeholder="All, Prod, Staging..."
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Value</label>
                            <Input
                                value={entryForm.value}
                                onChange={(e) => setEntryForm(prev => ({ ...prev, value: e.target.value }))}
                                className="h-10 bg-[#1A1A24] border-qa-border text-qa-text rounded-xl"
                                placeholder="Sensitive data or params..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Description</label>
                            <Textarea
                                value={entryForm.description}
                                onChange={(e) => setEntryForm(prev => ({ ...prev, description: e.target.value }))}
                                className="bg-[#1A1A24] border-qa-border text-qa-text rounded-xl min-h-[80px]"
                                placeholder="Explain what this record is used for..."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-qa-text-muted uppercase tracking-widest px-1">Tags (Comma Separated)</label>
                            <Input
                                value={entryForm.tags}
                                onChange={(e) => setEntryForm(prev => ({ ...prev, tags: e.target.value }))}
                                className="h-10 bg-[#1A1A24] border-qa-border text-qa-text rounded-xl"
                                placeholder="api, secure, legacy..."
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-[#13131A]">
                        <Button variant="ghost" onClick={() => setIsEntryModalOpen(false)} className="text-qa-text-muted font-black uppercase text-xs">CANCEL</Button>
                        <Button
                            onClick={handleSaveEntry}
                            disabled={!entryForm.key.trim()}
                            className="bg-qa-purple text-[#0F0F13] font-black uppercase text-xs px-6 rounded-xl"
                        >
                            {editingEntryId ? 'UPDATE RECORD' : 'ADD RECORD'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
