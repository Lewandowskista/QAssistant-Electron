import { useState, useRef, useEffect, useCallback } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { cn } from "@/lib/utils"
import { getApiKey } from "@/lib/credentials"
import {
    Sparkles,
    X,
    Send,
    Loader2,
    Bot,
    User,
    ChevronDown,
    Trash2,
    Copy,
    Check,
    RotateCcw,
    Lightbulb,
} from "lucide-react"
import FormattedText from "@/components/FormattedText"

interface Message {
    id: string
    role: "user" | "assistant"
    content: string
    timestamp: number
    isError?: boolean
}

const STARTER_PROMPTS = [
    "What are the riskiest areas in this sprint?",
    "Summarize the current test pass rate and suggest improvements",
    "Which failed tests should I prioritize for retest?",
    "What SAP ImpEx would help me test product catalog sync?",
]

function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

interface CopyButtonProps {
    text: string
}
function CopyButton({ text }: CopyButtonProps) {
    const [copied, setCopied] = useState(false)
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }
    return (
        <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-[#6B7280] hover:text-[#A78BFA]"
            title="Copy"
        >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        </button>
    )
}

interface AiCopilotProps {
    open: boolean
    onClose: () => void
}

export default function AiCopilot({ open, onClose }: AiCopilotProps) {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find((p) => p.id === activeProjectId)

    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [apiKeyMissing, setApiKeyMissing] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const abortRef = useRef<boolean>(false)

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const getApiKey = useCallback(async (): Promise<string | null> => {
        const api = window.electronAPI as any
        return getApiKey(api, 'gemini_api_key', activeProjectId)
    }, [activeProjectId])

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 150)
            
            // Re-check API key when opening
            getApiKey().then(key => {
                setApiKeyMissing(!key)
            })
        }
    }, [open, getApiKey])

    // Check API key when project changes
    useEffect(() => {
        getApiKey().then(key => {
            setApiKeyMissing(!key)
        })
    }, [activeProjectId, getApiKey])

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: "user",
            content: text.trim(),
            timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, userMsg])
        setInput("")
        setIsLoading(true)
        abortRef.current = false

        try {
            const apiKey = await getApiKey()
            if (!apiKey) {
                setApiKeyMissing(true)
                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: "⚠️ No Gemini API key configured. Please add your API key in **Settings → AI Configuration**.",
                        timestamp: Date.now(),
                        isError: true,
                    },
                ])
                return
            }
            setApiKeyMissing(false)

            const api = window.electronAPI as any
            const result = await api.aiChat({
                apiKey,
                userMessage: text.trim(),
                history: messages.map((m) => ({ role: m.role, content: m.content })),
                project: activeProject || null,
                modelName: activeProject?.geminiModel,
            })

            if (abortRef.current) return

            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: result,
                    timestamp: Date.now(),
                },
            ])
        } catch (err: any) {
            if (!abortRef.current) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: `❌ ${String(err?.message || err)}`,
                        timestamp: Date.now(),
                        isError: true,
                    },
                ])
            }
        } finally {
            setIsLoading(false)
        }
    }, [isLoading, messages, activeProject, getApiKey])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            sendMessage(input)
        }
    }

    const handleCancel = () => {
        abortRef.current = true
        setIsLoading(false)
    }

    const clearChat = () => {
        abortRef.current = true
        setIsLoading(false)
        setMessages([])
    }

    const retryLast = () => {
        const lastUser = [...messages].reverse().find((m) => m.role === "user")
        if (!lastUser) return
        setMessages((prev) => prev.slice(0, -1)) // remove last assistant msg
        sendMessage(lastUser.content)
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-[110] transition-opacity duration-300",
                    open ? "opacity-100 bg-black/60 backdrop-blur-sm" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className={cn(
                    "fixed top-0 right-0 h-full z-[120] flex flex-col app-region-no-drag",
                    "w-[480px] bg-[#0F0F13] border-l border-[#2A2A3A] transition-all duration-300 ease-in-out",
                    open 
                        ? "translate-x-0 opacity-100 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]" 
                        : "translate-x-full opacity-0 invisible pointer-events-none"
                )}
            >
                {/* Header */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-[#2A2A3A] shrink-0 bg-[#13131A]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] flex items-center justify-center shadow-lg shadow-[#A78BFA]/20">
                            <Sparkles className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-[#E2E8F0]">AI Copilot</p>
                            <p className="text-[10px] text-[#6B7280]">
                                {activeProject ? activeProject.name : "No project selected"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {messages.length > 0 && (
                            <button
                                onClick={clearChat}
                                className="p-2 rounded-md hover:bg-[#252535] text-[#6B7280] hover:text-red-400 transition-colors"
                                title="Clear chat"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-md hover:bg-[#252535] text-[#6B7280] hover:text-[#E2E8F0] transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Context pill */}
                {activeProject && (
                    <div className="px-4 py-2 border-b border-[#2A2A3A]/50 bg-[#13131A]/50 flex items-center gap-2 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
                        <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            Context injected:
                        </span>
                        <span className="text-[10px] text-[#A78BFA] font-mono">
                            {activeProject.testPlans?.flatMap((tp: any) => tp.testCases || []).length || 0} cases
                            {" · "}
                            {activeProject.tasks?.length || 0} tasks
                            {" · "}
                            {activeProject.environments?.length || 0} envs
                        </span>
                    </div>
                )}

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 min-h-0">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-8">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#A78BFA]/20 to-[#7C3AED]/20 border border-[#A78BFA]/20 flex items-center justify-center">
                                <Sparkles className="h-7 w-7 text-[#A78BFA]" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-[#E2E8F0]">Ask me anything about your QA</p>
                                <p className="text-xs text-[#6B7280]">
                                    I have full context on your project, tests, tasks, and environments.
                                </p>
                            </div>
                            <div className="w-full space-y-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <Lightbulb className="h-3 w-3 text-[#6B7280]" />
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                                        Suggestions
                                    </span>
                                </div>
                                {STARTER_PROMPTS.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => sendMessage(prompt)}
                                        className="w-full text-left text-xs px-3 py-2.5 rounded-lg border border-[#2A2A3A] bg-[#13131A] text-[#6B7280] hover:border-[#A78BFA]/40 hover:text-[#E2E8F0] hover:bg-[#1A1A24] transition-all"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex gap-2.5 group",
                                msg.role === "user" ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            {/* Avatar */}
                            <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                msg.role === "user"
                                    ? "bg-[#2D2D3F] border border-[#3D3D5F]"
                                    : "bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] shadow-md shadow-[#A78BFA]/20"
                            )}>
                                {msg.role === "user"
                                    ? <User className="h-3.5 w-3.5 text-[#A78BFA]" />
                                    : <Bot className="h-3.5 w-3.5 text-white" />
                                }
                            </div>

                            {/* Bubble */}
                            <div className={cn(
                                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed relative",
                                msg.role === "user"
                                    ? "bg-[#A78BFA]/15 border border-[#A78BFA]/20 text-[#E2E8F0] rounded-tr-md"
                                    : msg.isError
                                        ? "bg-red-900/10 border border-red-500/20 text-red-300 rounded-tl-md"
                                        : "bg-[#13131A] border border-[#2A2A3A] text-[#E2E8F0] rounded-tl-md"
                            )}>
                                {msg.role === "assistant" && !msg.isError ? (
                                    <FormattedText content={msg.content} projectId={activeProjectId || undefined} />
                                ) : (
                                    <span className="whitespace-pre-wrap">{msg.content}</span>
                                )}
                                <div className={cn(
                                    "flex items-center gap-1 mt-1.5",
                                    msg.role === "user" ? "justify-start" : "justify-between"
                                )}>
                                    <span className="text-[9px] text-[#6B7280]">{formatTime(msg.timestamp)}</span>
                                    {msg.role === "assistant" && (
                                        <div className="flex items-center gap-0.5">
                                            <CopyButton text={msg.content} />
                                            {i === messages.length - 1 && msg.isError && (
                                                <button
                                                    onClick={retryLast}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-[#6B7280] hover:text-[#A78BFA]"
                                                    title="Retry"
                                                >
                                                    <RotateCcw className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Loading indicator */}
                    {isLoading && (
                        <div className="flex gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] flex items-center justify-center shrink-0 shadow-md shadow-[#A78BFA]/20">
                                <Bot className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <button
                                    onClick={handleCancel}
                                    className="text-[9px] text-[#6B7280] hover:text-red-400 transition-colors ml-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* API key warning banner */}
                {apiKeyMissing && (
                    <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/20 text-amber-400 text-[11px] flex items-center gap-2">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        Configure a Gemini API key in Settings to use AI Copilot.
                    </div>
                )}

                {/* Input area */}
                <div className="p-3 border-t border-[#2A2A3A] bg-[#13131A] shrink-0">
                    <div className="relative flex items-end gap-2 rounded-xl border border-[#2A2A3A] bg-[#0F0F13] focus-within:border-[#A78BFA]/40 transition-colors p-2 app-region-no-drag">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value)
                                // Auto-resize
                                e.target.style.height = "auto"
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about tests, risks, SAP, coverage..."
                            disabled={isLoading}
                            rows={1}
                            className="flex-1 bg-transparent border-none text-xs text-[#E2E8F0] placeholder:text-[#6B7280]/60 focus:outline-none resize-none leading-relaxed min-h-[20px] max-h-[120px] py-0.5 px-1 custom-scrollbar app-region-no-drag"
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isLoading}
                            className={cn(
                                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
                                input.trim() && !isLoading
                                    ? "bg-[#A78BFA] text-white hover:bg-[#9271e0] shadow-md shadow-[#A78BFA]/20"
                                    : "bg-[#1A1A24] text-[#6B7280] cursor-not-allowed"
                            )}
                        >
                            {isLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Send className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </div>
                    <p className="text-[9px] text-[#6B7280]/50 mt-1.5 text-center">
                        Enter to send · Shift+Enter for new line · Context-aware QA assistant
                    </p>
                </div>
            </div>

            {/* Scroll-to-bottom button (visible when scrolled up) */}
            {messages.length > 3 && (
                <button
                    onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                    className={cn(
                        "fixed bottom-24 right-4 z-[96] w-8 h-8 rounded-full bg-[#A78BFA] text-white flex items-center justify-center shadow-lg transition-all app-region-no-drag",
                        open ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                >
                    <ChevronDown className="h-4 w-4" />
                </button>
            )}
        </>
    )
}
