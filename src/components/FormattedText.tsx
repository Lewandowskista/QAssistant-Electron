// cspell:ignore stringifying Renderable
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from "@/lib/utils"

interface FormattedTextProps {
    content: any
    className?: string
    compact?: boolean
}

export default function FormattedText({ content, className, compact = false }: FormattedTextProps) {
    if (!content) return null

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
        <div className={cn("prose prose-invert prose-sm max-w-none break-words", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Override default styles to match app theme
                    h1: ({ node, ...props }) => <h1 className={cn("text-xl font-bold text-[#A78BFA] border-b border-[#A78BFA]/20 pb-2", compact ? "mb-2 mt-4" : "mb-4 mt-6")} {...props} />,
                    h2: ({ node, ...props }) => <h2 className={cn("text-lg font-bold text-[#A78BFA] flex items-center gap-2", compact ? "mb-1.5 mt-3" : "mb-3 mt-5")} {...props} />,
                    h3: ({ node, ...props }) => <h3 className={cn("text-base font-bold text-[#E2E8F0]", compact ? "mb-1 mt-2" : "mb-2 mt-4")} {...props} />,
                    p: ({ node, ...props }) => <p className={cn("leading-relaxed text-[#E2E8F0]/90", compact ? "mb-1.5 last:mb-0" : "mb-3 last:mb-0")} {...props} />,
                    ul: ({ node, ...props }) => <ul className={cn("list-disc pl-5 text-[#E2E8F0]/90", compact ? "mb-2 space-y-0.5" : "mb-4 space-y-1")} {...props} />,
                    ol: ({ node, ...props }) => <ol className={cn("list-decimal pl-5 text-[#E2E8F0]/90", compact ? "mb-2 space-y-0.5" : "mb-4 space-y-1")} {...props} />,
                    li: ({ node, ...props }) => <li className="mb-0.5" {...props} />,
                    table: ({ node, ...props }) => (
                        <div className={cn("overflow-x-auto rounded-lg border border-[#2A2A3A]", compact ? "my-3" : "my-6")}>
                            <table className="w-full border-collapse text-left text-xs" {...props} />
                        </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-[#1A1A24] text-[#A78BFA] font-bold" {...props} />,
                    th: ({ node, ...props }) => <th className="px-4 py-2 border-b border-[#2A2A3A]" {...props} />,
                    td: ({ node, ...props }) => <td className="px-4 py-2 border-b border-[#2A2A3A] text-[#E2E8F0]/80" {...props} />,
                    code: ({ node, className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '')
                        return !match ? (
                            <code className="bg-[#1A1A24] px-1.5 py-0.5 rounded text-[0.9em] font-mono text-[#A78BFA]" {...props}>
                                {children}
                            </code>
                        ) : (
                            <pre className={cn("bg-[#0F0F13] p-4 rounded-lg border border-[#2A2A3A] overflow-x-auto font-mono text-xs shadow-inner", compact ? "my-2" : "my-4")}>
                                <code className={className} {...props}>
                                    {children}
                                </code>
                            </pre>
                        )
                    },
                    blockquote: ({ node, ...props }) => (
                        <blockquote className={cn("border-l-4 border-[#A78BFA]/40 pl-4 italic text-[#9CA3AF] bg-[#1A1A24]/30 py-2 rounded-r", compact ? "my-2" : "my-4")} {...props} />
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
