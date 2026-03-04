import { useState, useEffect } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { Plus, Search, Trash2, Loader2, Code2, Server, Key, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import FormattedText from "@/components/FormattedText"

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type ResponseTab = 'Body' | 'Headers' | 'History' | 'Compare'

export default function ApiPage() {
    const { projects, activeProjectId, addApiRequest, updateApiRequest, deleteApiRequest } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const [searchQuery, setSearchQuery] = useState("")
    const [selectedReqId, setSelectedReqId] = useState<string | null>(null)
    const [activeRespTab, setActiveRespTab] = useState<ResponseTab>('Body')

    // Current Edit State
    const [method, setMethod] = useState<HttpMethod>('GET')
    const [url, setUrl] = useState("")
    const [headers, setHeaders] = useState("{\n  \"Content-Type\": \"application/json\"\n}")
    const [body, setBody] = useState("")
    const [reqName, setReqName] = useState("New Request")
    const [category, setCategory] = useState("Custom")

    const [response, setResponse] = useState<any>(null)
    const [respHeaders, setRespHeaders] = useState<Record<string, string>>({})
    const [isExecuting, setIsExecuting] = useState(false)
    const [responseStatus, setResponseStatus] = useState<number | null>(null)
    const [responseTime, setResponseTime] = useState<number | null>(null)

    const requests = activeProject?.apiRequests || []
    const filtered = requests.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.url.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const selectedReq = requests.find(r => r.id === selectedReqId)

    useEffect(() => {
        if (selectedReq) {
            setReqName(selectedReq.name)
            setMethod(selectedReq.method as HttpMethod)
            setUrl(selectedReq.url)
            setHeaders(selectedReq.headers)
            setBody(selectedReq.body)
            setCategory(selectedReq.category || "Custom")
            setResponse(null)
            setResponseStatus(null)
            setResponseTime(null)
        } else {
            handleNew()
        }
    }, [selectedReqId])

    const handleNew = () => {
        setSelectedReqId(null)
        setReqName("New Request")
        setMethod('GET')
        setUrl("")
        setHeaders("{\n  \"Content-Type\": \"application/json\"\n}")
        setBody("")
        setCategory("Custom")
        setResponse(null)
    }

    const handleSave = async () => {
        if (!activeProjectId) return
        const payload = { name: reqName, method, url, headers, body, category }
        if (selectedReqId) {
            await updateApiRequest(activeProjectId, selectedReqId, payload)
        } else {
            const newId = await addApiRequest(activeProjectId, payload) as string
            setSelectedReqId(newId)
        }
    }

    const handleDelete = async () => {
        if (selectedReqId && activeProjectId) {
            if (confirm("Delete this request?")) {
                await deleteApiRequest(activeProjectId, selectedReqId)
                handleNew()
            }
        }
    }

    const handleSend = async () => {
        if (!url) return
        setIsExecuting(true)
        const startTime = performance.now()
        try {
            let parsedHeaders = {}
            try { parsedHeaders = JSON.parse(headers) } catch (e) { }

            const res = await fetch(url, {
                method,
                headers: parsedHeaders,
                body: ['GET', 'HEAD'].includes(method) ? undefined : body
            })
            const endTime = performance.now()
            setResponseStatus(res.status)
            setResponseTime(Math.round(endTime - startTime))

            const headerMap: Record<string, string> = {}
            res.headers.forEach((v, k) => headerMap[k] = v)
            setRespHeaders(headerMap)

            const text = await res.text()
            try {
                setResponse(JSON.parse(text))
            } catch {
                setResponse(text)
            }
        } catch (error: any) {
            setResponseStatus(0)
            setResponse(error.message)
            setResponseTime(Math.round(performance.now() - startTime))
        } finally {
            setIsExecuting(false)
        }
    }

    const getMethodColor = (m: string) => {
        switch (m) {
            case 'GET': return 'bg-[#3B82F6]'
            case 'POST': return 'bg-[#10B981]'
            case 'PUT': return 'bg-[#F59E0B]'
            case 'DELETE': return 'bg-[#EF4444]'
            case 'PATCH': return 'bg-[#8B5CF6]'
            default: return 'bg-[#6B7280]'
        }
    }

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <Server className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to use the API Playground.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex animate-in fade-in duration-500 overflow-hidden bg-[#0F0F13]">
            {/* Sidebar: Saved Requests */}
            <aside className="w-[280px] flex-none bg-[#13131A] border-r border-[#2A2A3A] flex flex-col">
                <div className="p-4 border-b border-[#2A2A3A] space-y-1">
                    <h3 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">API PLAYGROUND</h3>
                    <p className="text-[11px] text-[#6B7280] leading-tight">OCC, HAC, Jira, Linear</p>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280]" />
                        <Input
                            placeholder="Filter registry..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[#0F0F13] border-[#2A2A3A] text-xs"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filtered.map(req => (
                        <div
                            key={req.id}
                            onClick={() => setSelectedReqId(req.id)}
                            className={cn(
                                "p-2.5 rounded-lg border transition-all cursor-pointer group",
                                selectedReqId === req.id
                                    ? "bg-[#1A1A24] border-[#A78BFA]/50"
                                    : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded text-white min-w-[32px] text-center", getMethodColor(req.method))}>
                                    {req.method}
                                </span>
                                <span className="text-xs font-bold text-[#E2E8E0] truncate flex-1">{req.name}</span>
                            </div>
                            <div className="text-[10px] text-[#6B7280] font-medium uppercase tracking-wider pl-[38px]">
                                {req.category || 'Custom'}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-3 border-t border-[#2A2A3A] space-y-2 bg-[#0F0F13]">
                    <Button onClick={handleNew} className="w-full h-10 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-bold text-xs gap-2">
                        <Plus className="h-3.5 w-3.5" /> NEW REQUEST
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="h-8 border-[#2A2A3A] text-[9px] font-bold text-[#6B7280] uppercase">OCC Templates</Button>
                        <Button variant="outline" className="h-8 border-[#2A2A3A] text-[9px] font-bold text-[#6B7280] uppercase">HAC Templates</Button>
                    </div>
                </div>
            </aside>

            {/* Request Editor */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {/* Editor Header */}
                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                        <Input
                            value={reqName}
                            onChange={e => setReqName(e.target.value)}
                            className="max-w-[300px] h-9 bg-transparent border-none text-lg font-black text-[#E2E8F0] focus-visible:ring-0 px-0"
                            placeholder="Request Name"
                        />
                        <div className="w-px h-6 bg-[#2A2A3A]" />
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="w-[120px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                <SelectItem value="OCC">OCC</SelectItem>
                                <SelectItem value="HAC">HAC</SelectItem>
                                <SelectItem value="Jira">JIRA</SelectItem>
                                <SelectItem value="Linear">LINEAR</SelectItem>
                                <SelectItem value="Custom">CUSTOM</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={handleDelete} className="text-[#EF4444] hover:bg-[#EF4444]/10">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button onClick={handleSave} className="h-9 px-6 bg-[#A78BFA] text-[#0F0F13] font-black text-xs">
                            SAVE
                        </Button>
                    </div>
                </div>

                {/* URL Bar */}
                <div className="p-4 flex gap-2 border-b border-[#2A2A3A]">
                    <Select value={method} onValueChange={m => setMethod(m as HttpMethod)}>
                        <SelectTrigger className={cn("w-[100px] h-11 border-[#2A2A3A] text-xs font-black rounded-r-none", getMethodColor(method) + " text-white")}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="PATCH">PATCH</SelectItem>
                            <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="h-11 flex-1 bg-[#1A1A24] border-[#2A2A3A] border-x-0 rounded-none font-mono text-sm text-[#A78BFA]"
                    />
                    <Button onClick={handleSend} disabled={isExecuting} className="h-11 px-8 bg-[#A78BFA] text-[#0F0F13] font-black rounded-l-none">
                        {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : "SEND"}
                    </Button>
                </div>

                {/* Headers & Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em] flex items-center gap-2">
                                <Key className="h-3 w-3 text-[#A78BFA]" /> HEADERS
                            </Label>
                            <Button variant="outline" className="h-6 border-[#10B981]/20 text-[#10B981] text-[9px] font-bold hover:bg-[#10B981]/10 px-2">AUTO AUTH</Button>
                        </div>
                        <textarea
                            value={headers}
                            onChange={e => setHeaders(e.target.value)}
                            className="w-full h-24 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 font-mono text-xs text-[#E2E8F0] resize-none focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/30"
                            placeholder="Authorization: Bearer ..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em] flex items-center gap-2">
                            <Code2 className="h-3 w-3 text-[#A78BFA]" /> BODY (JSON)
                        </Label>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            className="w-full h-40 bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-3 font-mono text-xs text-[#E2E8F0] resize-none focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/30"
                            placeholder='{ "key": "value" }'
                        />
                    </div>
                </div>

                {/* Response Bar */}
                <div className="h-10 bg-[#13131A] border-y border-[#2A2A3A] flex items-center justify-between px-4 overflow-hidden flex-none">
                    <div className="flex items-center gap-6">
                        <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">RESPONSE</span>
                        {responseStatus && (
                            <div className="flex items-center gap-4">
                                <span className={cn("text-xs font-bold font-mono", responseStatus < 300 ? "text-[#10B981]" : "text-[#EF4444]")}>
                                    {responseStatus}
                                </span>
                                <span className="text-[10px] font-bold text-[#6B7280] font-mono">{responseTime}ms</span>
                            </div>
                        )}
                        <div className="flex gap-1 ml-4">
                            {(['Body', 'Headers', 'History', 'Compare'] as ResponseTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveRespTab(tab)}
                                    className={cn(
                                        "px-3 h-10 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all",
                                        activeRespTab === tab ? "border-[#A78BFA] text-[#A78BFA] bg-[#1A1A24]" : "border-transparent text-[#6B7280] hover:text-[#E2E8F0]"
                                    )}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[#A78BFA] text-[10px] font-bold gap-2">
                        <Copy className="h-3 w-3" /> COPY
                    </Button>
                </div>

                {/* Response Content */}
                <div className="h-[250px] bg-[#0F0F13] flex-none overflow-hidden relative group">
                    <div className="h-full overflow-y-auto p-4 custom-scrollbar">
                        {activeRespTab === 'Body' && (
                            <div className="font-mono text-xs text-[#E2E8F0] selection:bg-[#A78BFA]/20">
                                {response ? (
                                    typeof response === 'object' ? (
                                        <pre>{JSON.stringify(response, null, 2)}</pre>
                                    ) : (
                                        <FormattedText content={response} />
                                    )
                                ) : (
                                    <span className="opacity-40">// Awaiting payload dispatch...</span>
                                )}
                            </div>
                        )}
                        {activeRespTab === 'Headers' && (
                            <div className="space-y-1">
                                {Object.entries(respHeaders).map(([k, v]) => (
                                    <div key={k} className="flex gap-4 border-b border-[#2A2A3A]/50 py-1">
                                        <span className="text-[#A78BFA] font-bold min-w-[120px] text-[10px] uppercase font-mono">{k}</span>
                                        <span className="text-[#E2E8F0] font-mono text-xs">{v}</span>
                                    </div>
                                ))}
                                {Object.keys(respHeaders).length === 0 && <span className="text-[#6B7280] text-xs font-mono italic">// No headers available</span>}
                            </div>
                        )}
                    </div>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#A78BFA]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </main>
        </div>
    )
}
