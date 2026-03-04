import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from "@/lib/utils"

interface FormattedTextProps {
    content: any
    className?: string
}

export default function FormattedText({ content, className }: FormattedTextProps) {
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
                    p: ({ node, ...props }) => <p className="leading-relaxed mb-3 last:mb-0" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-3" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-3" {...props} />,
                    li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                    code: ({ node, className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '')
                        return !match ? (
                            <code className="bg-[#1A1A24] px-1.5 py-0.5 rounded text-[0.9em] font-mono text-[#A78BFA]" {...props}>
                                {children}
                            </code>
                        ) : (
                            <pre className="bg-[#0F0F13] p-3 rounded-lg border border-[#2A2A3A] overflow-x-auto my-3 font-mono text-xs">
                                <code className={className} {...props}>
                                    {children}
                                </code>
                            </pre>
                        )
                    },
                    blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-[#A78BFA]/30 pl-4 italic my-3 text-[#9CA3AF]" {...props} />
                    ),
                    strong: ({ node, ...props }) => <strong className="font-bold text-[#A78BFA]" {...props} />,
                    a: ({ node, ...props }) => <a className="text-[#3B82F6] hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
                }}
            >
                {markdown}
            </ReactMarkdown>
        </div>
    )
}
