// cspell:ignore stringifying Renderable
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from "@/lib/utils"

interface FormattedTextProps {
    content: any
    className?: string
    compact?: boolean
    source?: string
    connectionId?: string
    projectId?: string
}

export default function FormattedText({ content, className, compact = false, source, connectionId, projectId }: FormattedTextProps) {
    if (!content) return null

    const proxifyMediaUrl = (url: string) => {
        if (!url || !source || source === 'manual') return url;
        if (!url.startsWith('http')) return url;
        
        const projId = projectId || 'none';
        const connId = connectionId || 'none';
        // Base64Url encoding with Unicode support
        const encodedUrl = btoa(unescape(encodeURIComponent(url)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); 
        return `q-media://${source}/${projId}/${connId}/${encodedUrl}`;
    };

    // Helper to safely handle object content by stringifying it
    const getRenderableContent = (val: any): string => {
        if (typeof val === 'object') {
            try {
                return JSON.stringify(val, null, 2)
            } catch (e) {
                return String(val)
            }
        }
        return String(val)
    }

    const markdown = getRenderableContent(content)

    return (
        <div className={cn("prose prose-sm max-w-none break-words text-[hsl(var(--text-primary))]", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Override default styles to match app theme
                    h1: ({ node, ...props }) => <h1 className={cn("text-xl font-bold text-[#A78BFA] border-b border-[#A78BFA]/20 pb-2", compact ? "mb-2 mt-4" : "mb-4 mt-6")} {...props} />,
                    h2: ({ node, ...props }) => <h2 className={cn("text-lg font-bold text-[#A78BFA] flex items-center gap-2", compact ? "mb-1.5 mt-3" : "mb-3 mt-5")} {...props} />,
                    h3: ({ node, ...props }) => <h3 className={cn("text-base font-bold text-[hsl(var(--text-primary))]", compact ? "mb-1 mt-2" : "mb-2 mt-4")} {...props} />,
                    p: ({ node, ...props }) => <p className={cn("leading-relaxed text-[hsl(var(--text-primary))]", compact ? "mb-1.5 last:mb-0" : "mb-3 last:mb-0")} {...props} />,
                    ul: ({ node, ...props }) => <ul className={cn("list-disc pl-5 text-[hsl(var(--text-primary))]", compact ? "mb-2 space-y-0.5" : "mb-4 space-y-1")} {...props} />,
                    ol: ({ node, ...props }) => <ol className={cn("list-decimal pl-5 text-[hsl(var(--text-primary))]", compact ? "mb-2 space-y-0.5" : "mb-4 space-y-1")} {...props} />,
                    li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                    table: ({ node, ...props }) => (
                        <div className={cn("overflow-x-auto rounded-lg border border-[hsl(var(--border-default))]", compact ? "my-3" : "my-6")}>
                            <table className="w-full border-collapse text-left text-xs" {...props} />
                        </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-[hsl(var(--surface-card-alt))] text-[#A78BFA] font-bold" {...props} />,
                    th: ({ node, ...props }) => <th className="px-4 py-2 border-b border-[hsl(var(--border-default))]" {...props} />,
                    td: ({ node, ...props }) => <td className="px-4 py-2 border-b border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))]" {...props} />,
                    img: ({ node, src, alt, ...props }) => (
                        <img 
                            src={proxifyMediaUrl(src || '')} 
                            alt={alt || ''} 
                            className="my-4 max-w-full rounded-lg border border-[hsl(var(--border-default))]" 
                            onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src !== src) {
                                    img.src = src || '';
                                }
                            }}
                            {...props} 
                        />
                    ),
                    code: ({ node, className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '')
                        return !match ? (
                            <code className="rounded bg-[hsl(var(--surface-card-alt))] px-1.5 py-0.5 font-mono text-[0.9em] text-[#A78BFA]" {...props}>
                                {children}
                            </code>
                        ) : (
                            <pre className={cn("overflow-x-auto rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] p-4 font-mono text-xs text-[hsl(var(--text-primary))] shadow-inner", compact ? "my-2" : "my-4")}>
                                <code className={className} {...props}>
                                    {children}
                                </code>
                            </pre>
                        )
                    },
                    blockquote: ({ node, ...props }) => (
                        <blockquote className={cn("rounded-r border-l-4 border-[#A78BFA]/40 bg-[hsl(var(--surface-card-alt))/0.6] py-2 pl-4 italic text-[hsl(var(--text-secondary))]", compact ? "my-2" : "my-4")} {...props} />
                    ),
                    strong: ({ node, ...props }) => <strong className="font-bold text-[#A78BFA]" {...props} />,
                    a: ({ node, ...props }) => <a className="text-[#3B82F6] hover:underline transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
                }}
            >
                {markdown}
            </ReactMarkdown>
        </div>
    )
}
