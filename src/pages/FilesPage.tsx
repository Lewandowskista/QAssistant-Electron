import { useState } from "react"
import { useProjectStore, Attachment } from "@/store/useProjectStore"
import { Trash2, Upload, FileIcon, Search, File, LucideImage, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function FilesPage() {
    const { projects, activeProjectId, addProjectFile, deleteProjectFile } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const api = (window as any).electronAPI
    const [searchQuery, setSearchQuery] = useState("")
    const [isDragging, setIsDragging] = useState(false)

    // Combine project files and note attachments
    const allFiles: Attachment[] = []
    activeProject?.files.forEach(f => allFiles.push(f))
    activeProject?.notes.forEach(n => allFiles.push(...n.attachments))

    const filtered = allFiles.filter(f => f.fileName.toLowerCase().includes(searchQuery.toLowerCase()))

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
                            <div key={file.id} className="group bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4 hover:border-[#A78BFA]/50 transition-all cursor-pointer relative overflow-hidden shadow-sm">
                                <div className="absolute top-0 left-0 w-full h-1 bg-[#A78BFA]/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 rounded-xl bg-[#1A1A24] flex items-center justify-center mb-3 text-[#A78BFA]">
                                        {file.fileName.match(/\.(jpg|jpeg|png|gif)$/i) ? <LucideImage className="h-6 w-6" /> : <File className="h-6 w-6" />}
                                    </div>
                                    <div className="text-xs font-bold text-[#E2E8F0] truncate w-full mb-1" onClick={() => api.openFile(file.filePath)}>{file.fileName}</div>
                                    <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest">
                                        {file.fileSizeBytes ? `${(file.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                                    </div>
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                    <button onClick={() => api.openFile(file.filePath)} className="p-1.5 rounded-lg bg-[#1A1A24] text-[#6B7280] hover:text-[#A78BFA] border border-[#2A2A3A] hover:border-[#A78BFA]/30">
                                        <ExternalLink className="h-3 w-3" />
                                    </button>
                                    <button onClick={async () => {
                                        if (!activeProjectId) return;
                                        await deleteProjectFile(activeProjectId, file.id);
                                        api.deleteAttachment(file.filePath);
                                    }} className="p-1.5 rounded-lg bg-[#1A1A24] text-[#6B7280] hover:text-[#EF4444] border border-[#2A2A3A] hover:border-[#EF4444]/30">
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

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
