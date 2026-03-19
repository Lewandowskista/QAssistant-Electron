import { useEffect, useState } from "react"
import { useProjectStore, Attachment } from "@/store/useProjectStore"
import { Trash2, Upload, FileIcon, Search, File, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
                    }
                    return;
                }
            }
            toast.info('No image in clipboard');
        } catch (e: any) {
            console.error('Paste failed', e);
        }
    }

    if (!activeProject) {
        return <div className="h-full flex items-center justify-center text-[#6B7280] bg-[#0F0F13]">Select a project to manage files.</div>
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Top Toolbar */}
            <header className="bg-[#13131A] border-b border-[#2A2A3A] p-4 flex items-center justify-between flex-none">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">FILES</span>
                        <div className="w-1 h-1 rounded-full bg-[#A78BFA] animate-pulse" />
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280] pointer-events-none" />
                        <Input
                            placeholder="Filter artifacts..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0]"
                        />
                    </div>
                    <select value={linkedTaskFilter} onChange={(e) => setLinkedTaskFilter(e.target.value)} className="h-9 rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-3 text-xs text-[#E2E8F0]">
                        <option value="all">All Tasks</option>
                        {(activeProject?.tasks || []).map((task) => (
                            <option key={task.id} value={task.id}>{task.title}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handlePaste} variant="outline" className="h-9 border-[#A78BFA]/20 text-[#A78BFA] font-black text-[10px] uppercase hover:bg-[#A78BFA]/5">
                        PASTE SCREENSHOT
                    </Button>
                    <Button onClick={handleBrowse} className="h-9 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase gap-2 px-6">
                        <Upload className="h-3.5 w-3.5" /> BROWSE FILES
                    </Button>
                </div>
            </header>

            {/* Drop Zone / Content */}
            <main
                className={cn(
                    "flex-1 p-8 transition-all duration-300",
                    isDragging ? "bg-[#A78BFA]/5 border-2 border-dashed border-[#A78BFA]/20 m-4 rounded-[2rem]" : "bg-transparent"
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
                                }
                            }
                        }
                    }
                }}
            >
                {allFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center">
                            <FileIcon className="h-10 w-10 text-[#6B7280]" strokeWidth={1.5} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-[#E2E8F0] uppercase tracking-widest">No artifacts archived</h3>
                            <p className="text-sm text-[#6B7280] mt-2 max-w-sm mx-auto font-medium">Drop files, scripts, or paste screenshots directly into the library.</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filtered.map((file) => (
                            <div
                                key={file.id}
                                className="group bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4 hover:border-[#A78BFA]/50 transition-all cursor-pointer relative overflow-hidden shadow-sm"
                                onContextMenu={(event) => openContextMenu(event, file.id)}
                                onMouseDown={(event) => {
                                    if (event.button !== 2) return
                                    openContextMenu(event, file.id)
                                }}
                                title="Right-click for file actions"
                            >
                                <div className="absolute top-0 left-0 w-full h-1 bg-[#A78BFA]/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex flex-col items-center text-center">
                                    <div
                                        className="w-12 h-12 rounded-xl bg-[#1A1A24] flex items-center justify-center mb-3 text-[#A78BFA] overflow-hidden"
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
                                                <div className="flex h-full w-full items-center justify-center text-[#6B7280]">
                                                    <File className="h-6 w-6" />
                                                </div>
                                            )
                                        ) : (
                                            <File className="h-6 w-6" />
                                        )}
                                    </div>
                                    <div className="text-xs font-bold text-[#E2E8F0] truncate w-full mb-1" onClick={() => api.openFile(file.filePath)}>{file.fileName}</div>
                                    <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest">
                                        {file.fileSizeBytes ? `${(file.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2 justify-center">
                                        {artifactLinks.filter((link) =>
                                            (link.sourceType === 'file' && link.sourceId === file.id && link.targetType === 'task') ||
                                            (link.targetType === 'file' && link.targetId === file.id && link.sourceType === 'task')
                                        ).map((link) => {
                                            const taskId = link.sourceType === 'task' ? link.sourceId : link.targetId
                                            const task = activeProject?.tasks.find((item) => item.id === taskId)
                                            return task ? <span key={link.id} className="px-1.5 py-0.5 rounded bg-[#A78BFA]/10 text-[#A78BFA] text-[9px]">{task.title}</span> : null
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
                        className="absolute min-w-48 rounded-xl border border-[#2A2A3A] bg-[#13131A] p-2 shadow-2xl"
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
                                        className="h-9 rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-2 text-xs text-[#E2E8F0]"
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
                                        className="flex items-center gap-2 rounded-md border border-[#2A2A3A] bg-[#1A1A24] px-3 py-2 text-xs text-[#E2E8F0] hover:border-[#A78BFA]/30 hover:text-[#A78BFA]"
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
                                        className="flex items-center gap-2 rounded-md border border-[#2A2A3A] bg-[#1A1A24] px-3 py-2 text-xs text-[#E2E8F0] hover:border-[#EF4444]/30 hover:text-[#EF4444]"
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
                    <div className="bg-[#A78BFA] text-[#0F0F13] px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl animate-bounce">
                        Release to upload
                    </div>
                </div>
            )}
        </div>
    )
}
