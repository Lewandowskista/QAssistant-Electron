import { useEffect, useState } from "react"
import { useProjectStore, Attachment } from "@/store/useProjectStore"
import { Trash2, Upload, FileIcon, Search, File, ExternalLink, ClipboardPaste } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { ActionToolbar, CompactPageHeader, InlineStatusSummary, PageScaffold } from "@/components/ui/workspace"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i

function isImageAttachment(file: Attachment) {
    return file.mimeType?.startsWith("image/") || IMAGE_EXTENSIONS.test(file.fileName)
}

export default function FilesPage() {
    const { projects, activeProjectId, addProjectFile, deleteProjectFile, linkArtifact } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const api = window.electronAPI
    const [searchQuery, setSearchQuery] = useState("")
    const [linkedTaskFilter, setLinkedTaskFilter] = useState("all")
    const [isDragging, setIsDragging] = useState(false)
    const [contextMenu, setContextMenu] = useState<{ fileId: string; x: number; y: number } | null>(null)
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

    // Combine project files and note attachments
    const allFiles: Attachment[] = []
    activeProject?.files.forEach(f => allFiles.push(f))
    activeProject?.notes.forEach(n => allFiles.push(...n.attachments))

    const artifactLinks = activeProject?.artifactLinks || []
    const filtered = allFiles.filter(f => {
        const matchesSearch = f.fileName.toLowerCase().includes(searchQuery.toLowerCase())
        if (!matchesSearch) return false
        if (linkedTaskFilter === 'all') return true
        return artifactLinks.some((link) =>
            ((link.sourceType === 'task' && link.sourceId === linkedTaskFilter && link.targetType === 'file' && link.targetId === f.id) ||
            (link.targetType === 'task' && link.targetId === linkedTaskFilter && link.sourceType === 'file' && link.sourceId === f.id))
        )
    })

    const openContextMenu = (event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, fileId: string) => {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
            fileId,
            x: event.clientX,
            y: event.clientY
        })
    }

    useEffect(() => {
        let cancelled = false

        const loadPreviews = async () => {
            if (!api) return

            const imageFiles = filtered.filter(isImageAttachment)
            const missingFiles = imageFiles.filter((file) => !previewUrls[file.id])
            if (missingFiles.length === 0) return

            const entries = await Promise.all(
                missingFiles.map(async (file) => {
                    const result = await api.readAttachmentPreview(file.filePath)
                    return result.success && result.dataUrl ? [file.id, result.dataUrl] as const : null
                })
            )

            if (cancelled) return

            const nextEntries = entries.filter((entry): entry is readonly [string, string] => entry !== null)
            if (nextEntries.length === 0) return

            setPreviewUrls((current) => {
                const next = { ...current }
                for (const [fileId, dataUrl] of nextEntries) {
                    next[fileId] = dataUrl
                }
                return next
            })
        }

        void loadPreviews()

        return () => {
            cancelled = true
        }
    }, [api, filtered, previewUrls])

    const handleBrowse = async () => {
        if (!window.electronAPI || !activeProjectId) return
        const sourcePath = await window.electronAPI.selectFile()
        if (sourcePath) {
            const res = await window.electronAPI.copyToAttachments(sourcePath)
            if (res.success && res.attachment) {
                const newFile: Attachment = {
                    id: crypto.randomUUID(),
                    fileName: res.attachment.fileName,
                    filePath: res.attachment.filePath,
                    mimeType: res.attachment.mimeType,
                    fileSizeBytes: res.attachment.fileSizeBytes
                }
                await addProjectFile(activeProjectId, newFile)
            } else {
                toast.error(res.error || 'Failed to copy file')
            }
        }
    }

    const handlePaste = async () => {
        if (!window.electronAPI || !activeProjectId) return
        try {
            const clipboard = await navigator.clipboard.read();
            for (const item of clipboard) {
                if (item.types.includes('image/png')) {
                    const blob = await item.getType('image/png');
                    const arrayBuffer = await blob.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    const fileName = `screenshot-${Date.now()}.png`;
                    const res = await window.electronAPI.saveBytesAttachment(bytes, fileName);
                    if (res.success && res.attachment) {
                        const newFile: Attachment = {
                            id: crypto.randomUUID(),
                            fileName: res.attachment.fileName,
                            filePath: res.attachment.filePath,
                            mimeType: res.attachment.mimeType,
                            fileSizeBytes: res.attachment.fileSizeBytes
                        }
                        await addProjectFile(activeProjectId, newFile);
                    } else if (!res.success) {
                        toast.error(res.error || 'Failed to save screenshot')
                    }
                    return;
                }
            }
            toast.info('No image in clipboard');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            toast.error(`Paste failed: ${msg}`)
        }
    }

    if (!activeProject) {
        return <div className="h-full flex items-center justify-center text-muted-ui bg-app">Select a project to manage files.</div>
    }

    return (
        <PageScaffold>
            <CompactPageHeader
                eyebrow="Project Library"
                title="Files"
                description="Screenshots, logs, and artifacts attached to this project's work."
                summary={
                    <InlineStatusSummary
                        items={[
                            `${allFiles.length} ${allFiles.length === 1 ? "file" : "files"}`,
                            "Drop files anywhere or paste a screenshot",
                        ]}
                    />
                }
                actions={
                    <>
                        <Button onClick={handlePaste} variant="outline" className="gap-2">
                            <ClipboardPaste className="h-4 w-4" /> Paste screenshot
                        </Button>
                        <Button onClick={handleBrowse} className="gap-2">
                            <Upload className="h-4 w-4" /> Browse files
                        </Button>
                    </>
                }
            />

            <ActionToolbar>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-ui pointer-events-none" />
                    <Input
                        placeholder="Filter files…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-9 pl-9 bg-panel-muted border-ui text-sm text-foreground"
                    />
                </div>
                <select value={linkedTaskFilter} onChange={(e) => setLinkedTaskFilter(e.target.value)} className="h-9 rounded-md bg-panel-muted border border-ui px-3 text-sm text-foreground">
                    <option value="all">All tasks</option>
                    {(activeProject?.tasks || []).map((task) => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                </select>
            </ActionToolbar>

            {/* Drop Zone / Content */}
            <main
                className={cn(
                    "flex-1 transition-all duration-300",
                    isDragging && "bg-qa-accent/5 border-2 border-dashed border-qa-accent/20 rounded-2xl p-4"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!window.electronAPI || !activeProjectId) return;
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        for (const file of e.dataTransfer.files) {
                            // Assuming electronAPI can handle web File objects via path if it's available
                            // Note: Web File object in Electron usually exposes the `path` property.
                            const webFile = file as any;
                            if (webFile.path) {
                                const res = await window.electronAPI.copyToAttachments(webFile.path);
                                if (res.success && res.attachment) {
                                    const newFile: Attachment = {
                                        id: crypto.randomUUID(),
                                        fileName: res.attachment.fileName,
                                        filePath: res.attachment.filePath,
                                        mimeType: res.attachment.mimeType,
                                        fileSizeBytes: res.attachment.fileSizeBytes
                                    }
                                    await addProjectFile(activeProjectId, newFile)
                                } else if (!res.success) {
                                    toast.error(res.error || `Failed to attach ${webFile.path}`)
                                }
                            }
                        }
                    }
                }}
            >
                {allFiles.length === 0 ? (
                    <EmptyState
                        icon={FileIcon}
                        title="No files yet"
                        description="Drop files anywhere on this page, paste a screenshot, or browse to attach evidence to your project."
                        actions={
                            <Button onClick={handleBrowse} className="gap-2">
                                <Upload className="h-4 w-4" /> Browse files
                            </Button>
                        }
                    />
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filtered.map((file) => (
                            <div
                                key={file.id}
                                className="group bg-panel border border-ui rounded-2xl p-4 hover:border-qa-accent/50 transition-all cursor-pointer relative overflow-hidden shadow-sm"
                                onContextMenu={(event) => openContextMenu(event, file.id)}
                                onMouseDown={(event) => {
                                    if (event.button !== 2) return
                                    openContextMenu(event, file.id)
                                }}
                                title="Right-click for file actions"
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-qa-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex flex-col items-center text-center">
                                    <div
                                        className="w-12 h-12 rounded-xl bg-panel-muted flex items-center justify-center mb-3 text-brand overflow-hidden"
                                    >
                                        {isImageAttachment(file) ? (
                                            previewUrls[file.id] ? (
                                                <img
                                                    src={previewUrls[file.id]}
                                                    alt={file.fileName}
                                                    className="h-full w-full rounded-xl object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-muted-ui">
                                                    <File className="h-6 w-6" />
                                                </div>
                                            )
                                        ) : (
                                            <File className="h-6 w-6" />
                                        )}
                                    </div>
                                    <div className="text-xs font-bold text-foreground truncate w-full mb-1" onClick={() => api.openFile(file.filePath)}>{file.fileName}</div>
                                    <div className="text-[11px] font-medium text-muted-ui">
                                        {file.fileSizeBytes ? `${(file.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2 justify-center">
                                        {artifactLinks.filter((link) =>
                                            (link.sourceType === 'file' && link.sourceId === file.id && link.targetType === 'task') ||
                                            (link.targetType === 'file' && link.targetId === file.id && link.sourceType === 'task')
                                        ).map((link) => {
                                            const taskId = link.sourceType === 'task' ? link.sourceId : link.targetId
                                            const task = activeProject?.tasks.find((item) => item.id === taskId)
                                            return task ? <span key={link.id} className="px-1.5 py-0.5 rounded bg-qa-accent/10 text-brand text-[11px]">{task.title}</span> : null
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {contextMenu && (
                <div className="fixed inset-0 z-50" onMouseDown={() => setContextMenu(null)}>
                    <div
                        className="absolute min-w-48 rounded-xl border border-ui bg-panel p-2 shadow-2xl"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.preventDefault()}
                    >
                        {(() => {
                            const file = filtered.find((item) => item.id === contextMenu.fileId)
                            if (!file) return null

                            return (
                                <div className="flex flex-col gap-2">
                                    <select
                                        defaultValue=""
                                        onChange={async (event) => {
                                            const taskId = event.target.value
                                            if (!activeProjectId || !taskId) return
                                            await linkArtifact(activeProjectId, { sourceType: 'task', sourceId: taskId, targetType: 'file', targetId: file.id, label: 'documents' })
                                            toast.success('File linked to task.')
                                            setContextMenu(null)
                                        }}
                                        className="h-9 rounded-md bg-panel-muted border border-ui px-2 text-xs text-foreground"
                                    >
                                        <option value="">Link to task</option>
                                        {(activeProject?.tasks || []).map((task) => (
                                            <option key={task.id} value={task.id}>{task.title}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => {
                                            api.openFile(file.filePath)
                                            setContextMenu(null)
                                        }}
                                        className="flex items-center gap-2 rounded-md border border-ui bg-panel-muted px-3 py-2 text-xs text-foreground hover:border-qa-accent/30 hover:text-brand"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Open file
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!activeProjectId) return
                                            const linkedHandoffs = (activeProject?.handoffPackets || []).filter((packet) => packet.linkedFileIds.includes(file.id))
                                            if (linkedHandoffs.length > 0) {
                                                toast.error('This file is linked to an active handoff. Remove the handoff link first.')
                                                return
                                            }
                                            await deleteProjectFile(activeProjectId, file.id)
                                            api.deleteAttachment(file.filePath)
                                            setContextMenu(null)
                                        }}
                                        className="flex items-center gap-2 rounded-md border border-ui bg-panel-muted px-3 py-2 text-xs text-foreground hover:border-state-danger-border hover:text-[hsl(var(--state-danger))]"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Delete file
                                    </button>
                                </div>
                            )
                        })()}
                    </div>
                </div>
            )}

            {/* Upload Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
                    <div className="bg-primary text-primary-foreground px-10 py-5 rounded-2xl font-semibold text-sm shadow-2xl">
                        Release to upload
                    </div>
                </div>
            )}
        </PageScaffold>
    )
}
