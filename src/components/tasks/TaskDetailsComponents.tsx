// cspell:ignore proxify
import { useMemo } from "react"
import { Task } from "@/store/useProjectStore"
import { Image as ImageIcon, PlayCircle, ExternalLink } from "lucide-react"

export function DetailItem({ icon: Icon, label, value }: { icon?: any, label: string, value: string }) {
    return (
        <div className="flex items-start gap-4 h-10 px-3 bg-[#1A1A24]/40 rounded-lg border border-[#2A2A3A]/30">
            <div className="flex items-center h-full w-24 shrink-0 gap-2">
                {Icon && <Icon className="h-3.5 w-3.5 text-[#6B7280]" />}
                <span className="text-[11px] font-bold text-[#6B7280]">{label}</span>
            </div>
            <div className="flex items-center h-full flex-1">
                <span className="text-[11px] font-bold text-[#E2E8F0] truncate">{value}</span>
            </div>
        </div>
    )
}

export function MediaSection({ task, onImageClick, projectId }: { task: Task, onImageClick: (url: string) => void, projectId?: string }) {
    const proxifyMediaUrl = (url: string, source?: string, connectionId?: string, projectId?: string) => {
        if (!url || !source || source === 'manual') return url;
        if (!url.startsWith('http')) return url; // Already local or proxied
        
        // Jira and Linear often have auth issues in browser. Proxy via main process.
        const projId = projectId || 'none';
        const connId = connectionId || 'none';
        // Base64Url encoding with Unicode support
        const encodedUrl = btoa(unescape(encodeURIComponent(url)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); 
        return `q-media://${source}/${projId}/${connId}/${encodedUrl}`;
    };

    const rawDescription = task.rawDescription || task.description;
    const attachmentUrls = task.attachmentUrls || [];

    const mediaUrls = useMemo(() => {
        const urls: { type: 'image' | 'video', url: string, label?: string }[] = []

        // 1. Add images from attachmentUrls
        attachmentUrls.forEach(url => {
            const lower = url.toLowerCase();
            if (lower.includes('.png') || lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.gif') || lower.includes('.webp') || lower.includes('.bmp') || lower.includes('.svg') || lower.includes('attachment')) {
                 urls.push({ type: 'image', url });
            }
        });

        if (rawDescription) {
            // Match Markdown images: ![alt](url)
            const mdImageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g
            let match
            while ((match = mdImageRegex.exec(rawDescription)) !== null) {
                if (!urls.some(u => u.url === match![1])) {
                    urls.push({ type: 'image', url: match[1] })
                }
            }

            // Match plain image URLs
            const plainImageRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s"'<>]*)?)/gi
            while ((match = plainImageRegex.exec(rawDescription)) !== null) {
                if (!urls.some(u => u.url === match![1])) {
                    urls.push({ type: 'image', url: match[1] })
                }
            }

            // Match Video URLs (YouTube, Loom)
            const videoRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|loom\.com)\/[^\s"'<>)]+)/gi
            while ((match = videoRegex.exec(rawDescription)) !== null) {
                if (!urls.some(u => u.url === match![1])) {
                    urls.push({ type: 'video', url: match[1] })
                }
            }
        }

        return urls
    }, [rawDescription, attachmentUrls])

    if (mediaUrls.length === 0) return null

    return (
        <div className="mt-6 pt-6 border-t border-[#2A2A3A] space-y-3">
            <h4 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                <ImageIcon className="h-3 w-3" /> Attached Media ({mediaUrls.length})
            </h4>
            <div className="grid grid-cols-2 gap-3">
                {mediaUrls.map((item, idx) => (
                    <div
                        key={idx}
                        className="group relative aspect-video bg-[#1A1A24] border border-[#2A2A3A] rounded-lg overflow-hidden cursor-pointer hover:border-[#A78BFA]/50 transition-colors"
                        onClick={() => {
                            if (item.type === 'image') {
                                onImageClick(proxifyMediaUrl(item.url, task.source, task.connectionId, projectId))
                            } else {
                                window.electronAPI.openUrl(item.url)
                            }
                        }}
                    >
                        {item.type === 'image' ? (
                            <img
                                src={proxifyMediaUrl(item.url, task.source, task.connectionId, projectId)}
                                alt="Attachment"
                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                onError={(e) => {
                                    // Fallback to original URL if proxy fails (maybe public S3)
                                    const img = e.currentTarget;
                                    if (img.src !== item.url) {
                                        img.src = item.url;
                                    }
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#1E1E2A]">
                                <PlayCircle className="h-8 w-8 text-[#A78BFA] opacity-60 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[9px] font-bold text-gray-500 uppercase">Video Link</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink className="h-5 w-5 text-white" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
