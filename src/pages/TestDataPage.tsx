import { useState } from "react"
import { useProjectStore, TestDataEntry, TestDataGroup } from "@/store/useProjectStore"
import { toast } from "sonner"
import { DatabaseZap, Plus, Trash2, Search, Layers, ShieldCheck, Trash, Edit2, Download, Upload, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FullBleedHeader } from "@/components/ui/workspace"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { safeInvoke } from "@/lib/safeInvoke"
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
            <div className="h-full flex items-center justify-center bg-app p-6">
                <EmptyState
                    icon={DatabaseZap}
                    title="No project selected"
                    description="Select a project to manage test data."
                />
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
        await safeInvoke(
            () => window.electronAPI.saveFileDialog({
                defaultName: `${selectedGroup.name.replace(/\s+/g, '_')}_TestData.json`,
                content
            }),
            'Failed to save test data file'
        )
    }

    const handleImport = async () => {
        if (!activeProjectId || !selectedGroupId || !window.electronAPI) return
        const filePath = await safeInvoke(
            () => window.electronAPI.selectFile(),
            'Failed to open file picker'
        )
        if (filePath) {
            const fileData = await safeInvoke(
                () => window.electronAPI.readJsonFile({ filePath }),
                'Failed to read JSON file'
            )
            if (fileData?.success && fileData.data) {
                const group = fileData.data as TestDataGroup
                for (const entry of group.entries) {
                    await addTestDataEntry(activeProjectId, selectedGroupId, entry)
                }
            }
        }
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-app overflow-hidden">
            <FullBleedHeader
                icon={DatabaseZap}
                title="Test Data"
                description="Reusable test data sets"
            />
            <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[280px] flex-none bg-panel border-r border-qa-border flex flex-col">
                <div className="p-4 border-b border-qa-border">
                    <h3 className="app-section-label">Data groups</h3>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-qa-text-muted" />
                        <Input
                            placeholder="Search records…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-app border-qa-border text-xs text-qa-text"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredGroups.map(group => (
                            <div
                                key={group.id}
                                onClick={() => setSelectedGroupId(group.id)}
                                className={cn(
                                    "p-3 rounded-xl border transition-all cursor-pointer group",
                                    selectedGroupId === group.id ? "bg-panel-muted border-qa-accent/40 shadow-lg shadow-qa-accent/5" : "bg-transparent border-transparent hover:bg-surface-alt/50"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-qa-text mb-1 truncate">
                                        <FormattedText content={group.name} projectId={activeProjectId || undefined} />
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity">
                                        <button type="button" aria-label={`Edit data group ${group.name}`} className="text-qa-text-muted hover:text-qa-accent" onClick={(e) => {
                                            e.stopPropagation()
                                            handleOpenGroupModal(group)
                                        }}>
                                            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                        <button type="button" aria-label={`Delete data group ${group.name}`} className="text-qa-text-muted hover:text-state-danger" onClick={(e) => {
                                            e.stopPropagation();
                                            if (activeProjectId) deleteTestDataGroup(activeProjectId, group.id);
                                            if (selectedGroupId === group.id) setSelectedGroupId(null);
                                        }}>
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[11px] font-medium">
                                    <span className="text-qa-accent">{group.category}</span>
                                    <span className="text-qa-text-muted">{group.entries.length} records</span>
                                </div>
                            </div>
                    ))}
                </div>

                <div className="p-4 bg-app border-t border-qa-border space-y-2">
                    <Button onClick={() => handleOpenGroupModal()} className="w-full h-10 text-xs gap-2 bg-qa-accent text-primary-foreground">
                        <Plus className="h-4 w-4" /> New data group
                    </Button>
                </div>
            </aside>

            {/* Main Panel */}
            <main className="flex-1 flex flex-col min-w-0 bg-app">
                {!selectedGroupId ? (
                    <div className="h-full flex items-center justify-center p-6">
                        <EmptyState
                            icon={DatabaseZap}
                            title="Select a data collection"
                            description="Store and replicate reusable test environments."
                        />
                    </div>
                ) : (
                    <div className="h-full flex flex-col animate-in fade-in duration-500">
                        <header className="p-6 bg-panel border-b border-qa-border flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                                <h2 className="text-xl font-semibold text-qa-text tracking-tight">{selectedGroup?.name}</h2>
                                <div className="w-px h-6 bg-qa-border" />
                                <div className="text-[11px] font-medium text-qa-accent bg-qa-accent/10 px-2.5 py-1 rounded-full border border-qa-accent/20">
                                    {selectedGroup?.category}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleExport} className="h-9 border-qa-border text-qa-text-muted text-xs gap-2">
                                    <Download className="h-3.5 w-3.5" /> Export
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleImport} className="h-9 border-qa-border text-qa-text-muted text-xs gap-2">
                                    <Upload className="h-3.5 w-3.5" /> Import
                                </Button>
                                <div className="w-px h-9 bg-qa-border mx-1" />
                                <Button variant="ghost" size="icon" className="text-state-danger hover:bg-state-danger-soft" onClick={() => {
                                    if (activeProjectId && selectedGroupId) deleteTestDataGroup(activeProjectId, selectedGroupId);
                                    setSelectedGroupId(null);
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </header>

                        <div className="p-4 bg-panel border-b border-qa-border flex items-center justify-between">
                            <div className="flex gap-4">
                                <div className="app-section-label flex items-center gap-2">
                                    <Layers className="h-3 w-3 text-qa-accent" /> Data records
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => {
                                    const allData = selectedGroup?.entries.map(e => `${e.key}: ${e.value}`).join('\n')
                                    if (allData) { navigator.clipboard.writeText(allData); toast.success('All records copied') }
                                }} className="h-7 text-qa-text-muted text-xs hover:text-qa-text gap-2">
                                    <Copy className="h-3 w-3" /> Copy all
                                </Button>
                                <Button size="sm" onClick={() => handleOpenEntryModal()} className="h-7 bg-qa-accent/10 text-qa-accent border border-qa-accent/20 hover:bg-qa-accent/20 text-xs">Add entry</Button>
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-3">
                            {selectedGroup?.entries.map((entry) => (
                                <div key={entry.id} className="group flex gap-4 items-center p-4 bg-surface-alt/40 border border-qa-border rounded-2xl hover:border-qa-accent/30 transition-all">
                                    <div className="flex-none w-1/4">
                                        <div className="text-xs font-semibold text-qa-accent font-mono truncate">{entry.key}</div>
                                        {entry.environment && (
                                            <div className="text-[11px] text-qa-text-muted mt-1">Env: {entry.environment}</div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm text-qa-text font-medium">{entry.value}</div>
                                        {entry.description && (
                                            <div className="text-[11px] text-qa-text-muted mt-0.5 line-clamp-1">{entry.description}</div>
                                        )}
                                    </div>
                                    <div className="flex-none flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity">
                                        {entry.tags && (
                                            <div className="flex gap-1 mr-2">
                                                {entry.tags.split(',').map(tag => (
                                                    <span key={tag} className="px-1.5 py-0.5 rounded bg-panel-muted border border-qa-border text-[11px] text-qa-text-muted">{tag.trim()}</span>
                                                ))}
                                            </div>
                                        )}
                                        <Button variant="ghost" size="icon" aria-label="Edit record" className="h-8 w-8 text-qa-text-muted hover:text-qa-accent" onClick={() => handleOpenEntryModal(entry)}>
                                            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label="Delete record" className="h-8 w-8 text-qa-text-muted hover:text-state-danger" onClick={async () => {
                                            if (!activeProjectId || !selectedGroupId) return;
                                            await deleteTestDataEntry(activeProjectId, selectedGroupId, entry.id);
                                        }}>
                                            <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <footer className="p-4 bg-panel border-t border-qa-border flex items-center gap-4">
                            <ShieldCheck className="h-4 w-4 text-state-success" />
                            <span className="text-xs text-qa-text-muted">
                                {selectedGroup?.entries.length} records in collection
                            </span>
                        </footer>
                    </div>
                )}
            </main>
            </div>

            {/* Group Modal */}
            <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
                <DialogContent className="bg-panel border-qa-border sm:max-w-[400px] rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-qa-text font-semibold tracking-tight">
                            {editingGroupId ? 'Update data group' : 'Create new data group'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-6">
                        <div className="space-y-2">
                            <label className="app-field-label px-1">Group name</label>
                            <Input
                                autoFocus
                                value={groupForm.name}
                                onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                                className="h-11 bg-panel-muted border-qa-border text-qa-text font-bold rounded-xl"
                                placeholder="e.g. B2B checkout users"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="app-field-label px-1">Category</label>
                            <Select value={groupForm.category} onValueChange={(val) => setGroupForm(prev => ({ ...prev, category: val }))}>
                                <SelectTrigger className="h-11 bg-panel-muted border-qa-border text-qa-text font-bold rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-panel-muted border-qa-border text-qa-text">
                                    <SelectItem value="Users">Users</SelectItem>
                                    <SelectItem value="Products">Products</SelectItem>
                                    <SelectItem value="Promotions">Promotions</SelectItem>
                                    <SelectItem value="Custom">Custom</SelectItem>
                                    {/* category is a free-form string, so a group
                                        created elsewhere can carry a value that is
                                        not offered here. Without this the trigger
                                        renders blank and the user cannot see or
                                        keep the group's current category. */}
                                    {groupForm.category
                                        && !['Users', 'Products', 'Promotions', 'Custom'].includes(groupForm.category)
                                        && <SelectItem value={groupForm.category}>{groupForm.category}</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="bg-panel">
                        <Button variant="ghost" onClick={() => setIsGroupModalOpen(false)} className="text-qa-text-muted text-xs">Cancel</Button>
                        <Button
                            onClick={handleSaveGroup}
                            disabled={!groupForm.name.trim()}
                            className="bg-qa-accent text-primary-foreground text-xs px-6 rounded-xl"
                        >
                            {editingGroupId ? 'Update group' : 'Create group'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Entry Modal */}
            <Dialog open={isEntryModalOpen} onOpenChange={setIsEntryModalOpen}>
                <DialogContent className="bg-panel border-qa-border sm:max-w-[500px] rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-qa-text font-semibold tracking-tight">
                            {editingEntryId ? 'Update data entry' : 'Add new entry'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar px-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="app-field-label px-1">Key</label>
                                <Input
                                    autoFocus
                                    value={entryForm.key}
                                    onChange={(e) => setEntryForm(prev => ({ ...prev, key: e.target.value }))}
                                    className="h-10 bg-panel-muted border-qa-border text-qa-accent font-mono rounded-xl"
                                    placeholder="API_KEY"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="app-field-label px-1">Environment</label>
                                <Input
                                    value={entryForm.environment}
                                    onChange={(e) => setEntryForm(prev => ({ ...prev, environment: e.target.value }))}
                                    className="h-10 bg-panel-muted border-qa-border text-qa-text rounded-xl"
                                    placeholder="All, Prod, Staging…"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="app-field-label px-1">Value</label>
                            <Input
                                value={entryForm.value}
                                onChange={(e) => setEntryForm(prev => ({ ...prev, value: e.target.value }))}
                                className="h-10 bg-panel-muted border-qa-border text-qa-text rounded-xl"
                                placeholder="Value used by the test…"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="app-field-label px-1">Description</label>
                            <Textarea
                                value={entryForm.description}
                                onChange={(e) => setEntryForm(prev => ({ ...prev, description: e.target.value }))}
                                className="bg-panel-muted border-qa-border text-qa-text rounded-xl min-h-[80px]"
                                placeholder="Explain what this record is used for…"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="app-field-label px-1">Tags (comma separated)</label>
                            <Input
                                value={entryForm.tags}
                                onChange={(e) => setEntryForm(prev => ({ ...prev, tags: e.target.value }))}
                                className="h-10 bg-panel-muted border-qa-border text-qa-text rounded-xl"
                                placeholder="api, secure, legacy…"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-panel">
                        <Button variant="ghost" onClick={() => setIsEntryModalOpen(false)} className="text-qa-text-muted text-xs">Cancel</Button>
                        <Button
                            onClick={handleSaveEntry}
                            disabled={!entryForm.key.trim()}
                            className="bg-qa-accent text-primary-foreground text-xs px-6 rounded-xl"
                        >
                            {editingEntryId ? 'Update record' : 'Add record'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
