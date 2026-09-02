import { useState, useEffect } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { Plus, Search, Trash2, Loader2, Code2, Server, Key, Copy, Braces, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FullBleedHeader } from "@/components/ui/workspace"
import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import FormattedText from "@/components/FormattedText"
import { OccTemplates, HacTemplates } from "@/lib/apiTemplates"
import { toast } from "sonner"
import { useConfirm } from "@/components/ConfirmDialog"

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type ResponseTab = 'Body' | 'Headers'

export default function ApiPage() {
    const { projects, activeProjectId, addApiRequest, updateApiRequest, deleteApiRequest } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm()
    const api = window.electronAPI

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
    const [selectedEnvId, setSelectedEnvId] = useState<string>("")
    const [varsOpen, setVarsOpen] = useState(false)

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
            const ok = await confirmDialog('Delete this request?', { confirmLabel: 'Delete', destructive: true })
            if (ok) {
                await deleteApiRequest(activeProjectId, selectedReqId)
                handleNew()
            }
        }
    }

    const buildVarMap = async (): Promise<Record<string, string>> => {
        const env = activeProject?.environments.find(e => e.id === selectedEnvId) || activeProject?.environments.find(e => e.isDefault)
        if (!env) return {}
        let token = ''
        let username = ''
        let password = ''
        try {
            token = await api.secureStoreGet(`Env_${env.id}_Token`) || ''
            username = await api.secureStoreGet(`Env_${env.id}_Username`) || ''
            password = await api.secureStoreGet(`Env_${env.id}_Password`) || ''
        } catch { /* non-fatal */ }
        return {
            '{{baseUrl}}': env.baseUrl,
            '{{hacUrl}}': env.hacUrl,
            '{{backOfficeUrl}}': env.backOfficeUrl,
            '{{storefrontUrl}}': env.storefrontUrl,
            '{{occBasePath}}': env.occBasePath,
            '{{solrAdminUrl}}': env.solrAdminUrl,
            '{{token}}': token,
            '{{username}}': username,
            '{{password}}': password,
            '{{envName}}': env.name,
        }
    }

    const applyVars = (text: string, vars: Record<string, string>): string =>
        text.replace(/\{\{[\w]+\}\}/g, match => vars[match] !== undefined ? vars[match] : match)

    const handleSend = async () => {
        if (!url) return
        setIsExecuting(true)
        const startTime = performance.now()
        try {
            const vars = await buildVarMap()
            const resolvedUrl = applyVars(url, vars)
            const resolvedHeaders = applyVars(headers, vars)
            const resolvedBody = applyVars(body, vars)

            let parsedHeaders = {}
            try { parsedHeaders = JSON.parse(resolvedHeaders) } catch { /* ignore invalid JSON */ }

            const res = await fetch(resolvedUrl, {
                method,
                headers: parsedHeaders,
                body: ['GET', 'HEAD'].includes(method) ? undefined : resolvedBody
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

    const loadOccTemplates = async () => {
        if (!activeProjectId) return
        const existingNames = new Set(requests.map(r => r.name))
        for (const tmpl of OccTemplates) {
            if (!existingNames.has(tmpl.name)) {
                await addApiRequest(activeProjectId, {
                    ...tmpl,
                    method: tmpl.method as HttpMethod,
                    headers: tmpl.headers || "",
                    body: tmpl.body || ""
                })
            }
        }
    }

    const loadHacTemplates = async () => {
        if (!activeProjectId) return
        const existingNames = new Set(requests.map(r => r.name))
        for (const tmpl of HacTemplates) {
            if (!existingNames.has(tmpl.name)) {
                await addApiRequest(activeProjectId, {
                    ...tmpl,
                    method: tmpl.method as HttpMethod,
                    headers: tmpl.headers || "",
                    body: tmpl.body || ""
                })
            }
        }
    }

    const handleAutoAuth = async () => {
        if (!activeProject) return
        const api = window.electronAPI

        // Find default or first environment
        const env = activeProject.environments.find(e => e.isDefault) || activeProject.environments[0]
        if (!env) {
            toast.info('No environment configured for this project.')
            return
        }

        try {
            const user = await api.secureStoreGet(`Env_${env.id}_Username`)
            const pass = await api.secureStoreGet(`Env_${env.id}_Password`)

            if (!user && !pass) {
                toast.info(`No credentials found for environment: ${env.name}`)
                return
            }

            const basicToken = btoa(`${user || ""}:${pass || ""}`)
            const authLine = `Authorization: Basic ${basicToken}`

            // Inject or replace Authorization header
            const lines = headers.split('\n').filter(l => l.trim().length > 0)
            const authIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith('authorization:'))

            if (authIdx >= 0) {
                lines[authIdx] = authLine
            } else {
                lines.unshift(authLine)
            }

            setHeaders(lines.join('\n'))
        } catch (error) {
            console.error("Auto Auth failed", error)
        }
    }

    const getMethodColor = (m: string) => {
        switch (m) {
            case 'GET': return 'bg-state-info'
            case 'POST': return 'bg-state-success'
            case 'PUT': return 'bg-state-warning'
            case 'DELETE': return 'bg-state-danger'
            case 'PATCH': return 'bg-qa-accent'
            default: return 'bg-line-strong'
        }
    }

    if (!activeProject) {
        return (
            <div className="h-full flex items-center justify-center bg-app p-10">
                <EmptyState
                    icon={Server}
                    title="No project selected"
                    description="Select a project to use the API playground."
                />
            </div>
        )
    }

    return (
        <>
        <div className="h-full flex flex-col animate-in fade-in duration-500 overflow-hidden bg-app">
            <FullBleedHeader
                icon={Braces}
                title="API playground"
                description="OCC, HAC, Jira, Linear"
                actions={
                    <Button onClick={handleNew} size="sm" className="gap-2">
                        <Plus className="h-3.5 w-3.5" /> New request
                    </Button>
                }
            />

            <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar: Saved Requests */}
            <aside className="w-[280px] flex-none bg-panel border-r border-ui flex flex-col">
                <div className="p-4 border-b border-ui">
                    <p className="app-section-label">Saved requests</p>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-ui" />
                        <Input
                            placeholder="Filter requests…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-app border-ui text-xs"
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
                                    ? "bg-panel-muted border-qa-accent/50"
                                    : "bg-transparent border-transparent hover:bg-surface-alt/50"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded text-primary-foreground min-w-[32px] text-center", getMethodColor(req.method))}>
                                    {req.method}
                                </span>
                                <span className="text-xs font-semibold text-foreground truncate flex-1">{req.name}</span>
                            </div>
                            <div className="text-[11px] text-muted-ui pl-[38px]">
                                {req.category || 'Custom'}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-3 border-t border-ui space-y-2 bg-app">
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={loadOccTemplates} className="text-muted-ui hover:bg-qa-accent/10 hover:text-brand">OCC templates</Button>
                        <Button variant="outline" size="sm" onClick={loadHacTemplates} className="text-muted-ui hover:bg-qa-accent/10 hover:text-brand">HAC templates</Button>
                    </div>
                </div>
            </aside>

            {/* Request Editor */}
            <main className="flex-1 flex flex-col min-w-0 bg-app">
                {/* Editor Header */}
                <div className="p-4 bg-panel border-b border-ui flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                        <Input
                            value={reqName}
                            onChange={e => setReqName(e.target.value)}
                            className="max-w-[300px] h-9 bg-transparent border-none text-lg font-semibold text-foreground focus-visible:ring-0 px-0"
                            placeholder="Request name"
                        />
                        <div className="w-px h-6 bg-elevated" />
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="w-[120px] h-8 bg-panel-muted border-ui text-xs text-muted-ui">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-panel-muted border-ui text-foreground">
                                <SelectItem value="OCC">OCC</SelectItem>
                                <SelectItem value="HAC">HAC</SelectItem>
                                <SelectItem value="Jira">Jira</SelectItem>
                                <SelectItem value="Linear">Linear</SelectItem>
                                <SelectItem value="Custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="Delete request" className="text-state-danger hover:bg-state-danger-soft">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button onClick={handleSave} className="h-9 px-6">
                            Save
                        </Button>
                    </div>
                </div>

                {/* Env + Variables bar */}
                <div className="relative px-4 py-2 bg-app border-b border-ui flex items-center gap-3">
                    <Braces className="h-3 w-3 text-brand shrink-0" />
                    <span className="text-xs font-medium text-muted-ui shrink-0">Env</span>
                    <select
                        value={selectedEnvId}
                        onChange={e => setSelectedEnvId(e.target.value)}
                        className="h-7 rounded-md bg-panel-muted border border-ui px-2 text-xs text-foreground focus:outline-none"
                    >
                        <option value="">Auto (default)</option>
                        {(activeProject?.environments || []).map(env => (
                            <option key={env.id} value={env.id}>{env.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => setVarsOpen(v => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-ui hover:text-brand transition-colors ml-2"
                    >
                        <ChevronDown className={cn("h-3 w-3 transition-transform", varsOpen && "rotate-180")} />
                        Variables
                    </button>
                    {varsOpen && (
                        <div className="absolute top-full left-4 mt-1 z-layer-dropdown bg-panel-muted border border-ui rounded-xl p-3 shadow-xl text-[11px] font-mono text-soft grid grid-cols-2 gap-x-6 gap-y-1 min-w-[380px]">
                            {[
                                ['{{baseUrl}}', 'Environment base URL'],
                                ['{{hacUrl}}', 'HAC URL'],
                                ['{{backOfficeUrl}}', 'BackOffice URL'],
                                ['{{storefrontUrl}}', 'Storefront URL'],
                                ['{{occBasePath}}', 'OCC base path'],
                                ['{{solrAdminUrl}}', 'Solr admin URL'],
                                ['{{token}}', 'Stored auth token'],
                                ['{{username}}', 'Stored username'],
                                ['{{password}}', 'Stored password'],
                                ['{{envName}}', 'Environment name'],
                            ].map(([v, desc]) => (
                                <div key={v} className="flex items-center gap-2">
                                    <span className="text-brand font-semibold">{v}</span>
                                    <span className="text-muted-ui">{desc}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* URL Bar */}
                <div className="p-4 flex gap-2 border-b border-ui">
                    <Select value={method} onValueChange={m => setMethod(m as HttpMethod)}>
                        <SelectTrigger className={cn("w-[100px] h-11 border-ui text-xs font-semibold rounded-r-none", getMethodColor(method) + " text-primary-foreground")}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-panel-muted border-ui text-foreground">
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
                        placeholder="https://... or {{baseUrl}}/api/..."
                        className="h-11 flex-1 bg-panel-muted border-ui border-x-0 rounded-none font-mono text-sm text-brand"
                    />
                    <Button onClick={handleSend} disabled={isExecuting} className="h-11 px-8 rounded-l-none">
                        {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                    </Button>
                </div>

                {/* Headers & Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="app-field-label mb-0 flex items-center gap-2">
                                <Key className="h-3 w-3 text-brand" /> Headers
                            </Label>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAutoAuth}
                                className="h-6 px-2 border-state-success-border text-state-success hover:bg-state-success-soft"
                            >
                                Auto auth
                            </Button>
                        </div>
                        <textarea
                            value={headers}
                            onChange={e => setHeaders(e.target.value)}
                            className="w-full h-24 bg-panel-muted border border-ui rounded-xl p-3 font-mono text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-qa-accent/30"
                            placeholder="Authorization: Bearer ..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="app-field-label mb-0 flex items-center gap-2">
                            <Code2 className="h-3 w-3 text-brand" /> Body (JSON)
                        </Label>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            className="w-full h-40 bg-panel-muted border border-ui rounded-xl p-3 font-mono text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-qa-accent/30"
                            placeholder='{ "key": "value" }'
                        />
                    </div>
                </div>

                {/* Response Bar */}
                <div className="h-10 bg-panel border-y border-ui flex items-center justify-between px-4 overflow-hidden flex-none">
                    <div className="flex items-center gap-6">
                        <span className="app-section-label">Response</span>
                        {responseStatus && (
                            <div className="flex items-center gap-4">
                                <span className={cn("text-xs font-semibold font-mono", responseStatus < 300 ? "text-state-success" : "text-state-danger")}>
                                    {responseStatus}
                                </span>
                                <span className="text-xs text-muted-ui font-mono">{responseTime}ms</span>
                            </div>
                        )}
                        <div className="flex gap-1 ml-4">
                            {(['Body', 'Headers'] as ResponseTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveRespTab(tab)}
                                    className={cn(
                                        "px-3 h-10 text-xs font-semibold border-b-2 transition-all",
                                        activeRespTab === tab ? "border-qa-accent text-brand bg-panel-muted" : "border-transparent text-muted-ui hover:text-foreground"
                                    )}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-brand text-xs gap-2"
                        disabled={!response}
                        onClick={() => {
                            const text = typeof response === 'object' ? JSON.stringify(response, null, 2) : String(response ?? '')
                            navigator.clipboard.writeText(text)
                            toast.success('Response copied to clipboard')
                        }}
                    >
                        <Copy className="h-3 w-3" /> Copy
                    </Button>
                </div>

                {/* Response Content */}
                <div className="h-[250px] bg-app flex-none overflow-hidden relative group">
                    <div className="h-full overflow-y-auto p-4 custom-scrollbar">
                        {activeRespTab === 'Body' && (
                            <div className="font-mono text-xs text-foreground selection:bg-qa-accent/20">
                                {response ? (
                                    typeof response === 'object' ? (
                                        <pre>{JSON.stringify(response, null, 2)}</pre>
                                    ) : (
                                        <FormattedText content={response} projectId={activeProjectId || undefined} />
                                    )
                                ) : (
                                    <span className="font-sans text-muted-ui">Send a request to see the response.</span>
                                )}
                            </div>
                        )}
                        {activeRespTab === 'Headers' && (
                            <div className="space-y-1">
                                {Object.entries(respHeaders).map(([k, v]) => (
                                    <div key={k} className="flex gap-4 border-b border-line/50 py-1">
                                        <span className="text-brand font-medium min-w-[120px] text-xs font-mono">{k}</span>
                                        <span className="text-foreground font-mono text-xs">{v}</span>
                                    </div>
                                ))}
                                {Object.keys(respHeaders).length === 0 && <span className="text-muted-ui text-xs">Send a request to see response headers.</span>}
                            </div>
                        )}
                    </div>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-qa-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </main>
            </div>
        </div>
        {confirmDialogEl}
        </>
    )
}
