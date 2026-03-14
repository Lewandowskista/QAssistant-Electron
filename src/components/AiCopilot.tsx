import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { useUserStore } from "@/store/useUserStore"
import { cn } from "@/lib/utils"
import { getApiKey } from "@/lib/credentials"
import {
    Sparkles,
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
    SlidersHorizontal,
} from "lucide-react"
import FormattedText from "@/components/FormattedText"
import { buildProjectAiContext } from "@/lib/aiUtils"
import { Checkbox } from "@/components/ui/checkbox"
import { SideDrawerHeader } from "@/components/ui/side-drawer-header"
import type { AiContextSelection, AiRole } from "@/types/ai"
import type { Checklist, HandoffPacket, Project, QaEnvironment, Task, TestDataGroup, TestPlan } from "@/types/project"

interface Message {
    id: string
    role: "user" | "assistant"
    content: string
    timestamp: number
    isError?: boolean
}

type ContextSectionKey = "tasks" | "testPlans" | "environments" | "testDataGroups" | "checklists" | "handoffPackets"

const QA_CONTEXT_SECTION_META: Array<{ key: ContextSectionKey; label: string; selectionKey: keyof AiContextSelection }> = [
    { key: "tasks", label: "Tasks", selectionKey: "taskIds" },
    { key: "testPlans", label: "Test Plans", selectionKey: "testPlanIds" },
    { key: "environments", label: "Environments", selectionKey: "environmentIds" },
    { key: "testDataGroups", label: "Test Data", selectionKey: "testDataGroupIds" },
    { key: "checklists", label: "Checklists", selectionKey: "checklistIds" },
]

const DEV_CONTEXT_SECTION_META: Array<{ key: ContextSectionKey; label: string; selectionKey: keyof AiContextSelection }> = [
    { key: "tasks", label: "Tasks", selectionKey: "taskIds" },
    { key: "handoffPackets", label: "Handoffs", selectionKey: "handoffIds" },
    { key: "environments", label: "Environments", selectionKey: "environmentIds" },
]

const ROLE_CONTENT: Record<AiRole, {
    title: string
    introTitle: string
    introBody: string
    placeholder: string
    footer: string
    starterPrompts: string[]
}> = {
    qa: {
        title: "QA Copilot",
        introTitle: "Ask me anything about quality, coverage, and risk",
        introBody: "I only use the QA context you selected above for this chat.",
        placeholder: "Ask about tests, risks, SAP, coverage...",
        footer: "Enter to send | Shift+Enter for new line | Context-aware QA assistant",
        starterPrompts: [
            "What are the riskiest areas in this sprint?",
            "Summarize the current test pass rate and suggest improvements.",
            "Which failed tests should I prioritize for retest?",
            "What SAP ImpEx would help me test product catalog sync?",
        ],
    },
    dev: {
        title: "Dev Copilot",
        introTitle: "Ask me about implementation, handoffs, and release readiness",
        introBody: "I only use the Dev context you selected above for this chat.",
        placeholder: "Ask about implementation scope, handoffs, PR readiness...",
        footer: "Enter to send | Shift+Enter for new line | Context-aware Dev assistant",
        starterPrompts: [
            "Summarize the active QA handoffs and the likely implementation work.",
            "Which linked PRs or handoffs look closest to ready for QA?",
            "What information is missing before development can pick up these tasks?",
            "Which environments or release details should I confirm before merging?",
        ],
    },
}

type ContextSectionItemMap = {
    tasks: Task
    testPlans: TestPlan
    environments: QaEnvironment
    testDataGroups: TestDataGroup
    checklists: Checklist
    handoffPackets: HandoffPacket
}

function getContextItemLabel(item: Task | TestPlan | QaEnvironment | TestDataGroup | Checklist | HandoffPacket): string {
    if ("title" in item) return item.title
    if ("summary" in item) return item.summary
    return item.name
}

function getContextItemSecondaryText(key: ContextSectionKey, item: Task | TestPlan | QaEnvironment | TestDataGroup | Checklist | HandoffPacket): string {
    if (key === "tasks" && "title" in item) return item.sourceIssueId || item.status || "Task"
    if (key === "testPlans" && "testCases" in item) return `${item.testCases.length} cases`
    if (key === "handoffPackets" && "summary" in item) return item.branchName || item.environmentName || item.type
    if ("category" in item) return item.category || ""
    if ("type" in item) return item.type || ""
    return ""
}

function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function buildFullSelection(role: AiRole, project: Project | undefined): AiContextSelection {
    return {
        taskIds: (project?.tasks || []).map((item) => item.id),
        testPlanIds: role === "qa" ? (project?.testPlans || []).map((item) => item.id) : [],
        environmentIds: (project?.environments || []).map((item) => item.id),
        testDataGroupIds: role === "qa" ? (project?.testDataGroups || []).map((item) => item.id) : [],
        checklistIds: role === "qa" ? (project?.checklists || []).map((item) => item.id) : [],
        handoffIds: role === "dev" ? (project?.handoffPackets || []).map((item) => item.id) : [],
        includeSapCommerce: role === "qa",
    }
}

function getSelectedIds(selection: AiContextSelection, key: keyof AiContextSelection): string[] {
    const value = selection[key]
    return Array.isArray(value) ? value : []
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
    const activeRole = useUserStore((state) => state.activeRole)
    const activeProject = projects.find((p) => p.id === activeProjectId)

    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [apiKeyMissing, setApiKeyMissing] = useState(false)
    const [contextOpen, setContextOpen] = useState(false)
    const [contextSelection, setContextSelection] = useState<AiContextSelection>(() => buildFullSelection("qa", undefined))

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const abortRef = useRef<boolean>(false)

    useEffect(() => {
        setContextSelection(buildFullSelection(activeRole, activeProject))
        setContextOpen(false)
    }, [activeProjectId, activeProject, activeRole])

    const roleContent = ROLE_CONTENT[activeRole]
    const contextSectionMeta = activeRole === "dev" ? DEV_CONTEXT_SECTION_META : QA_CONTEXT_SECTION_META

    const filteredProjectContext = useMemo(
        () => buildProjectAiContext(activeProject, activeRole, contextSelection),
        [activeProject, activeRole, contextSelection]
    )

    const contextSummary = useMemo(() => {
        if (!filteredProjectContext) return "No context selected"
        if (filteredProjectContext.role === "dev") {
            return `${filteredProjectContext.tasks.length} tasks | ${filteredProjectContext.handoffs.length} handoffs | ${filteredProjectContext.environments.length} envs`
        }
        const caseCount = filteredProjectContext.testPlans.reduce((sum, plan) => sum + (plan.testCaseCount || 0), 0)
        return `${caseCount} cases | ${filteredProjectContext.tasks.length} tasks | ${filteredProjectContext.environments.length} envs`
    }, [filteredProjectContext])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const fetchApiKey = useCallback(async (): Promise<string | null> => {
        const api = window.electronAPI
        return getApiKey(api, "gemini_api_key", activeProjectId)
    }, [activeProjectId])

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 150)
            fetchApiKey().then((key) => {
                setApiKeyMissing(!key)
            })
        }
    }, [open, fetchApiKey])

    useEffect(() => {
        fetchApiKey().then((key) => {
            setApiKeyMissing(!key)
        })
    }, [activeProjectId, fetchApiKey])

    const toggleContextItem = useCallback((selectionKey: keyof AiContextSelection, itemId: string) => {
        setContextSelection((current) => {
            const next = new Set(getSelectedIds(current, selectionKey))
            if (next.has(itemId)) {
                next.delete(itemId)
            } else {
                next.add(itemId)
            }
            return { ...current, [selectionKey]: Array.from(next) }
        })
    }, [])

    const toggleAllContextItems = useCallback((selectionKey: keyof AiContextSelection, itemIds: string[]) => {
        setContextSelection((current) => {
            const currentIds = new Set(getSelectedIds(current, selectionKey))
            const allSelected = itemIds.length > 0 && itemIds.every((id) => currentIds.has(id))
            return { ...current, [selectionKey]: allSelected ? [] : itemIds }
        })
    }, [])

    const resetContextSelection = useCallback(() => {
        setContextSelection(buildFullSelection(activeRole, activeProject))
    }, [activeProject, activeRole])

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

        const timeoutId = setTimeout(() => {
            abortRef.current = true
            setIsLoading(false)
            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: "Request timed out. Please try again.",
                    timestamp: Date.now(),
                    isError: true,
                },
            ])
        }, 60000)

        try {
            const apiKey = await fetchApiKey()
            if (!apiKey) {
                setApiKeyMissing(true)
                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: "No Gemini API key configured. Add it in Settings -> AI Configuration.",
                        timestamp: Date.now(),
                        isError: true,
                    },
                ])
                return
            }
            setApiKeyMissing(false)

            const result = await window.electronAPI.aiChat({
                apiKey,
                userMessage: text.trim(),
                history: messages.map((m) => ({ role: m.role, content: m.content })),
                role: activeRole,
                project: filteredProjectContext,
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
        } catch (err: unknown) {
            if (!abortRef.current) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                        timestamp: Date.now(),
                        isError: true,
                    },
                ])
            }
        } finally {
            clearTimeout(timeoutId)
            setIsLoading(false)
        }
    }, [isLoading, messages, filteredProjectContext, activeProject, fetchApiKey, activeRole])

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
        setMessages((prev) => prev.slice(0, -1))
        sendMessage(lastUser.content)
    }

    return (
        <>
            <div
                className={cn(
                    "fixed inset-0 z-[110] transition-opacity duration-300",
                    open ? "opacity-100 bg-black/60 backdrop-blur-sm" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            <div
                className={cn(
                    "fixed top-0 right-0 h-full z-[120] flex flex-col app-region-no-drag",
                    "w-[480px] border-l transition-all duration-300 ease-in-out",
                    open
                        ? "translate-x-0 opacity-100 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
                        : "translate-x-full opacity-0 invisible pointer-events-none"
                )}
                style={{ background: "hsl(var(--surface-overlay))", borderColor: "hsl(var(--border-default))" }}
            >
                <SideDrawerHeader
                    icon={Sparkles}
                    title={roleContent.title}
                    subtitle={activeProject ? activeProject.name : "No project selected"}
                    onClose={onClose}
                    actions={
                    <div className="flex items-center gap-1">
                        {activeProject && (
                            <button
                                onClick={() => setContextOpen((current) => !current)}
                                className={cn(
                                    "p-2 rounded-md transition-colors",
                                    contextOpen
                                        ? "bg-[#252535] text-[#A78BFA]"
                                        : "hover:bg-[#252535] text-[#6B7280] hover:text-[#E2E8F0]"
                                )}
                                title="Select AI context"
                            >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                            </button>
                        )}
                        {messages.length > 0 && (
                            <button
                                onClick={clearChat}
                                className="p-2 rounded-md hover:bg-[#252535] text-[#6B7280] hover:text-red-400 transition-colors"
                                title="Clear chat"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    }
                />

                {activeProject && (
                    <div className="px-4 py-2 border-b border-[#2A2A3A]/50 bg-[hsl(var(--surface-header)/0.5)] flex items-center gap-2 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-semibold text-muted-ui uppercase tracking-wider">
                            Context selected:
                        </span>
                        <span className="text-[10px] text-primary font-mono">
                            {contextSummary}
                        </span>
                    </div>
                )}

                {activeProject && contextOpen && (
                    <div className="border-b border-[#2A2A3A]/50 bg-[hsl(var(--surface-header)/0.62)] px-4 py-3 space-y-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Manual Context</p>
                                <p className="text-[10px] text-muted-ui">Choose exactly what the copilot can use for this chat.</p>
                            </div>
                            <button
                                onClick={resetContextSelection}
                                className="text-[10px] font-semibold uppercase tracking-wider text-muted-ui transition-colors hover:text-foreground"
                            >
                                Reset
                            </button>
                        </div>

                        <div className="grid gap-2 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                            {contextSectionMeta.map(({ key, label, selectionKey }) => {
                                const items = (activeProject[key] || []) as ContextSectionItemMap[typeof key][]
                                const itemIds = items.map((item) => item.id)
                                const selectedIds = getSelectedIds(contextSelection, selectionKey)
                                const allSelected = itemIds.length > 0 && itemIds.every((id) => selectedIds.includes(id))

                                return (
                                    <div key={key} className="rounded-xl border border-[#2A2A3A] bg-[hsl(var(--surface-card))] p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-[11px] font-semibold text-[#E2E8F0]">{label}</p>
                                                <p className="text-[10px] text-[#6B7280]">{selectedIds.length}/{items.length} selected</p>
                                            </div>
                                            <button
                                                onClick={() => toggleAllContextItems(selectionKey, itemIds)}
                                                className="text-[10px] font-semibold uppercase tracking-wider text-muted-ui transition-colors hover:text-primary"
                                            >
                                                {allSelected ? "Clear" : "All"}
                                            </button>
                                        </div>

                                        {items.length === 0 ? (
                                            <p className="text-[10px] text-[#6B7280]">No {label.toLowerCase()} available.</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {items.map((item) => {
                                                    const isChecked = selectedIds.includes(item.id)
                                                    const secondaryText = getContextItemSecondaryText(key, item)

                                                    return (
                                                        <label
                                                            key={item.id}
                                                        className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[hsl(var(--surface-elevated))]"
                                                        >
                                                            <Checkbox
                                                                checked={isChecked}
                                                                onCheckedChange={() => toggleContextItem(selectionKey, item.id)}
                                                                className="mt-0.5 border-[#3A3A52] data-[state=checked]:bg-[#A78BFA] data-[state=checked]:text-[#0F0F13]"
                                                            />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[11px] text-[#E2E8F0]">{getContextItemLabel(item)}</span>
                                                                {secondaryText ? (
                                                                    <span className="block truncate text-[10px] text-[#6B7280]">{secondaryText}</span>
                                                                ) : null}
                                                            </span>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {activeRole === "qa" && (
                                <div className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-3">
                                    <label className="flex cursor-pointer items-start gap-2">
                                        <Checkbox
                                            checked={contextSelection.includeSapCommerce !== false}
                                            onCheckedChange={(checked) => setContextSelection((current) => ({ ...current, includeSapCommerce: checked === true }))}
                                            className="mt-0.5 border-[#3A3A52] data-[state=checked]:bg-[#A78BFA] data-[state=checked]:text-[#0F0F13]"
                                        />
                                        <span>
                                            <span className="block text-[11px] font-semibold text-[#E2E8F0]">SAP Commerce context</span>
                                            <span className="block text-[10px] text-[#6B7280]">Include the SAP guidance block and selected SAP-capable environments.</span>
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 min-h-0">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-8">
                            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--accent-primary-soft))] border border-[hsl(var(--accent-primary)/0.18)] flex items-center justify-center">
                                <Sparkles className="h-7 w-7 text-primary" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-[#E2E8F0]">{roleContent.introTitle}</p>
                                <p className="text-xs text-[#6B7280]">
                                    {roleContent.introBody}
                                </p>
                            </div>
                            <div className="w-full space-y-2">
                                <div className="flex items-center gap-2 mb-3">
                                    <Lightbulb className="h-3 w-3 text-[#6B7280]" />
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                                        Suggestions
                                    </span>
                                </div>
                                {roleContent.starterPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => sendMessage(prompt)}
                                        disabled={apiKeyMissing}
                                        className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-[#2A2A3A] bg-[hsl(var(--surface-card))] text-muted-ui hover:border-[hsl(var(--accent-primary)/0.32)] hover:text-foreground hover:bg-[hsl(var(--surface-elevated))] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#2A2A3A] disabled:hover:text-muted-ui disabled:hover:bg-[hsl(var(--surface-card))]"
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
                            <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                msg.role === "user"
                                    ? "bg-[hsl(var(--surface-elevated))] border border-[hsl(var(--border-strong))]"
                                    : "bg-[linear-gradient(135deg,hsl(var(--accent-primary)),hsl(var(--accent-primary-strong)))] shadow-md shadow-[hsl(var(--accent-primary)/0.18)]"
                            )}>
                                {msg.role === "user"
                                    ? <User className="h-3.5 w-3.5 text-[#A78BFA]" />
                                    : <Bot className="h-3.5 w-3.5 text-white" />
                                }
                            </div>

                            <div className={cn(
                                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed relative",
                                msg.role === "user"
                                    ? "bg-[hsl(var(--accent-primary-soft))] border border-[hsl(var(--accent-primary)/0.18)] text-[#E2E8F0] rounded-tr-md"
                                    : msg.isError
                                        ? "bg-red-900/10 border border-red-500/20 text-red-300 rounded-tl-md"
                                        : "bg-[hsl(var(--surface-card))] border border-[#2A2A3A] text-[#E2E8F0] rounded-tl-md"
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

                    {isLoading && (
                        <div className="flex gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[linear-gradient(135deg,hsl(var(--accent-primary)),hsl(var(--accent-primary-strong)))] flex items-center justify-center shrink-0 shadow-md shadow-[hsl(var(--accent-primary)/0.18)]">
                                <Bot className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="bg-[hsl(var(--surface-card))] border border-[#2A2A3A] rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-2">
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

                {apiKeyMissing && (
                    <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/20 text-amber-400 text-[11px] flex items-center gap-2">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        Configure a Gemini API key in Settings to use AI Copilot.
                    </div>
                )}

                    <div className="p-3 border-t border-[#2A2A3A] bg-[hsl(var(--surface-header)/0.8)] shrink-0">
                    <div className="relative flex items-end gap-2 rounded-2xl border border-[#2A2A3A] bg-[hsl(var(--surface-app))] focus-within:border-[hsl(var(--accent-primary)/0.4)] transition-colors p-2 app-region-no-drag">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value)
                                e.target.style.height = "auto"
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={roleContent.placeholder}
                            disabled={isLoading || apiKeyMissing}
                            rows={1}
                            className="flex-1 bg-transparent border-none text-xs text-[#E2E8F0] placeholder:text-[#6B7280]/60 focus:outline-none resize-none leading-relaxed min-h-[20px] max-h-[120px] py-0.5 px-1 custom-scrollbar app-region-no-drag"
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isLoading || apiKeyMissing}
                            className={cn(
                                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
                                input.trim() && !isLoading
                                    ? "bg-primary text-white hover:bg-primary/90 shadow-md shadow-[hsl(var(--accent-primary)/0.18)]"
                                    : "bg-[hsl(var(--surface-card-alt))] text-muted-ui cursor-not-allowed"
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
                        {roleContent.footer}
                    </p>
                </div>
            </div>

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
