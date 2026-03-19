import { useEffect, useMemo, useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { getApiKey } from "@/lib/credentials"
import { ServerCog, Play, RefreshCw, TerminalSquare, CheckCircle2, Zap, Activity, ShieldQuestion, Globe, Layers, AlertTriangle, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { CronJobEntry, FlexibleSearchResult, ImpExResult } from "@/lib/sapHac"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { SubtabBar } from "@/components/ui/subtab-bar"

type SapTab = "Cronjobs" | "Catalog" | "FlexSearch" | "Impex" | "Ccv2"

type CatalogDiffResult = {
    catalogId: string
    stagedCount: number
    onlineCount: number
    missingStagedToOnline: string[]
    timestamp: string
}

type Ccv2Environment = {
    code: string
    name: string
    status: string
    deploymentStatus: string
}

type Ccv2Deployment = {
    code: string
    environmentCode: string
    buildCode: string
    status: string
    strategy: string
}

type Ccv2Build = Record<string, unknown>

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

const FLEX_TEMPLATES: Record<string, string> = {
    products: "SELECT {p.code}, {p.name[en]} FROM {Product AS p} ORDER BY {p.code}",
    catalogs: "SELECT {cv.catalog}, {cv.version} FROM {CatalogVersion AS cv} WHERE {cv.active} = 0",
    lockedUsers: "SELECT {u.uid}, {u.name} FROM {User AS u} WHERE {u.loginDisabled} = 1",
    promotions: "SELECT {pr.code}, {pr.enabled} FROM {AbstractPromotion AS pr} WHERE {pr.enabled} = 1",
}

const IMPEX_SNIPPETS: Record<string, string> = {
    product: "INSERT_UPDATE Product;code[unique=true];name[lang=en];catalogVersion(catalog(id),version)\n;testProduct001;Test Product 001;testCatalog:Staged",
    customer: "INSERT_UPDATE Customer;uid[unique=true];name;password\n;test@example.com;Test User;12345678",
    removeProduct: "REMOVE Product;code[unique=true]\n;testProduct001",
    stock: "INSERT_UPDATE StockLevel;productCode[unique=true];warehouse(code)[unique=true];available\n;testProduct001;default;100",
}

export default function SapPage() {
    const api = window.electronAPI
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const environments = useMemo(() => activeProject?.environments ?? [], [activeProject?.environments])
    const projectSecretPrefix = activeProject ? `project:${activeProject.id}:` : ""

    const [activeTab, setActiveTab] = useState<SapTab>("Cronjobs")
    const [selectedEnvId, setSelectedEnvId] = useState("")
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)

    const [hacBaseUrl, setHacBaseUrl] = useState("")
    const [hacUser, setHacUser] = useState("")
    const [hacPass, setHacPass] = useState("")

    const [cronJobs, setCronJobs] = useState<CronJobEntry[]>([])
    const [cronFilter, setCronFilter] = useState("All")

    const [flexQuery, setFlexQuery] = useState("")
    const [flexResult, setFlexResult] = useState<FlexibleSearchResult | null>(null)
    const [flexLoading, setFlexLoading] = useState(false)
    const [nlQuery, setNlQuery] = useState("")
    const [nlLoading, setNlLoading] = useState(false)

    const [impExScript, setImpExScript] = useState("")
    const [impExResult, setImpExResult] = useState("")
    const [impExExecuting, setImpExExecuting] = useState(false)
    const [impExEnableCode, setImpExEnableCode] = useState(false)

    const [catalogIds, setCatalogIds] = useState<string[]>([])
    const [selectedCatalog, setSelectedCatalog] = useState("")
    const [catalogDiff, setCatalogDiff] = useState<CatalogDiffResult | null>(null)
    const [catalogDiffLoading, setCatalogDiffLoading] = useState(false)

    const [ccv2Sub, setCcv2Sub] = useState("")
    const [ccv2Token, setCcv2Token] = useState("")
    const [ccv2Envs, setCcv2Envs] = useState<Ccv2Environment[]>([])
    const [selectedCcv2Env, setSelectedCcv2Env] = useState("")
    const [ccv2Deployments, setCcv2Deployments] = useState<Ccv2Deployment[]>([])
    const [ccv2BuildCode, setCcv2BuildCode] = useState("")
    const [ccv2BuildInfo, setCcv2BuildInfo] = useState<Ccv2Build | null>(null)
    const [ccv2Loading, setCcv2Loading] = useState(false)

    const selectedEnv = environments.find(env => env.id === selectedEnvId) || null

    const isProductionEnv = selectedEnv?.type === "production"
    const targetBaseUrl = hacBaseUrl.trim() || selectedEnv?.hacUrl?.trim() || ""

    useEffect(() => {
        if (environments.length > 0 && !selectedEnvId) {
            const defaultEnv = environments.find(e => e.isDefault) || environments[0]
            setSelectedEnvId(defaultEnv.id)
        }
    }, [environments, selectedEnvId])

    useEffect(() => {
        let cancelled = false

        const syncFromEnvironment = async () => {
            setIsConnected(false)
            setCronJobs([])
            setCatalogIds([])
            setSelectedCatalog("")
            setCatalogDiff(null)

            if (!selectedEnv) {
                if (!cancelled) {
                    setHacBaseUrl("")
                    setHacUser("")
                    setHacPass("")
                }
                return
            }

            const [storedUser, storedPass] = await Promise.all([
                api.secureStoreGet(`Env_${selectedEnv.id}_Username`),
                api.secureStoreGet(`Env_${selectedEnv.id}_Password`),
            ])

            if (cancelled) return

            setHacBaseUrl(selectedEnv.hacUrl || selectedEnv.baseUrl || "")
            setHacUser(storedUser || "")
            setHacPass(storedPass || "")
        }

        void syncFromEnvironment()
        return () => {
            cancelled = true
        }
    }, [api, selectedEnv])

    useEffect(() => {
        let cancelled = false

        const loadCcv2Credentials = async () => {
            if (!projectSecretPrefix) {
                setCcv2Sub("")
                setCcv2Token("")
                return
            }

            const [savedSub, savedToken] = await Promise.all([
                api.secureStoreGet(`${projectSecretPrefix}ccv2_subscription_code`),
                api.secureStoreGet(`${projectSecretPrefix}ccv2_api_token`),
            ])

            if (cancelled) return
            setCcv2Sub(savedSub || "")
            setCcv2Token(savedToken || "")
        }

        void loadCcv2Credentials()
        return () => {
            cancelled = true
        }
    }, [api, projectSecretPrefix])

    useEffect(() => {
        if (!isConnected || activeTab !== "Catalog" || catalogIds.length > 0 || !targetBaseUrl) return

        void (async () => {
            const res = await api.sapHacGetCatalogIds(targetBaseUrl)
            if (!res.success) {
                toast.error(`Unable to load catalog IDs: ${res.error || "unknown error"}`)
                return
            }

            const ids = res.data || []
            setCatalogIds(ids)
            if (ids.length > 0 && !selectedCatalog) {
                setSelectedCatalog(ids[0])
            }
        })()
    }, [activeTab, api, catalogIds.length, isConnected, selectedCatalog, targetBaseUrl])

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60 bg-[#0F0F13]">
                <ShieldQuestion className="h-16 w-16 mb-4 text-[#6B7280]" />
                <h2 className="text-xl font-black uppercase tracking-widest text-[#E2E8F0]">No Project Selected</h2>
                <p className="text-xs font-bold text-[#6B7280] mt-2">Select a project to access SAP Commerce features.</p>
            </div>
        )
    }

    const handleConnect = async () => {
        if (!targetBaseUrl || !hacUser.trim() || !hacPass.trim()) {
            toast.error("Enter the HAC URL, username, and password before connecting.")
            return
        }

        setIsConnecting(true)
        try {
            const res = await api.sapHacLogin(targetBaseUrl, hacUser.trim(), hacPass, !!selectedEnv?.ignoreSslErrors)
            if (!res.success) {
                setIsConnected(false)
                toast.error(res.error || "Login failed.")
                return
            }

            setIsConnected(true)
            if (selectedEnv) {
                await api.secureStoreSet(`Env_${selectedEnv.id}_Username`, hacUser.trim())
                await api.secureStoreSet(`Env_${selectedEnv.id}_Password`, hacPass)
            }

            await fetchCronJobs()
            toast.success(`Connected to HAC for ${selectedEnv?.name || "the selected target"}.`)
        } catch (e: unknown) {
            setIsConnected(false)
            toast.error(`Login error: ${getErrorMessage(e)}`)
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDisconnect = () => {
        setIsConnected(false)
        setCronJobs([])
        setCatalogIds([])
        setCatalogDiff(null)
        toast.message("Disconnected from HAC session.")
    }

    const fetchCronJobs = async () => {
        if (!targetBaseUrl) return

        const res = await api.sapHacGetCronJobs(targetBaseUrl)
        if (!res.success) {
            toast.error(`Unable to load cronjobs: ${res.error || "unknown error"}`)
            return
        }

        setCronJobs(res.data || [])
    }

    const generateFlexFromNl = async () => {
        if (!nlQuery.trim()) return
        const apiKey = await getApiKey(api, "gemini_api_key", activeProject?.id)
        if (!apiKey) {
            toast.error("Configure a Gemini API key in Settings to use AI-assisted query generation.")
            return
        }
        setNlLoading(true)
        try {
            const result = await api.aiGenerateFlexSearch({ apiKey, naturalLanguageQuery: nlQuery.trim(), modelName: activeProject?.geminiModel })
            if (result && typeof result === "object" && "__isError" in result) {
                toast.error(`AI error: ${(result as any).message}`)
                return
            }
            const query = typeof result === "string" ? result.trim() : ""
            if (query) {
                setFlexQuery(query)
                setNlQuery("")
                toast.success("FlexSearch query generated — review and execute.")
            } else {
                toast.error("AI returned an empty query. Try rephrasing your request.")
            }
        } catch (e: unknown) {
            toast.error(`Failed to generate query: ${getErrorMessage(e)}`)
        } finally {
            setNlLoading(false)
        }
    }

    const runFlexSearch = async () => {
        if (!targetBaseUrl || !flexQuery.trim()) return

        setFlexLoading(true)
        try {
            const res = await api.sapHacFlexibleSearch(targetBaseUrl, flexQuery.trim(), 500)
            if (!res.success || !res.data) {
                setFlexResult({ Headers: [], Rows: [], Error: res.error || "Query failed" })
                return
            }

            setFlexResult(res.data)
        } catch (e: unknown) {
            setFlexResult({ Headers: [], Rows: [], Error: getErrorMessage(e) })
        } finally {
            setFlexLoading(false)
        }
    }

    const handleValidateImpex = () => {
        if (!impExScript.trim()) {
            setImpExResult("Script is empty.")
            return
        }

        const issues: string[] = []
        const lines = impExScript.split("\n")

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim()
            if (!line || line.startsWith("#")) continue

            if (/^(INSERT|UPDATE|INSERT_UPDATE|REMOVE)\s/i.test(line) && !line.includes(";")) {
                issues.push(`Line ${index + 1}: header is missing a semicolon separator.`)
            }
        }

        if (issues.length === 0) {
            setImpExResult("Validation passed. Basic syntax looks correct.")
            return
        }

        setImpExResult(`Validation found ${issues.length} issue(s):\n${issues.join("\n")}`)
    }

    const runImpEx = async () => {
        if (!targetBaseUrl || !impExScript.trim()) return

        if (isProductionEnv && !window.confirm(`Import ImpEx into production environment "${selectedEnv?.name}"?`)) {
            return
        }

        if (impExEnableCode && !window.confirm("Enable code execution for this ImpEx import? This is high risk.")) {
            return
        }

        setImpExExecuting(true)
        try {
            const res = await api.sapHacImportImpEx(targetBaseUrl, impExScript, impExEnableCode)
            if (!res.success || !res.data) {
                setImpExResult(`Import failed: ${res.error || "unknown error"}`)
                return
            }

            const result: ImpExResult = res.data
            setImpExResult([
                `Target: ${selectedEnv?.name || "Custom target"}`,
                `Timestamp: ${new Date().toISOString()}`,
                `Code execution: ${impExEnableCode ? "enabled" : "disabled"}`,
                "",
                result.Log,
            ].join("\n"))
            toast.success(result.Success ? "ImpEx import completed." : "ImpEx import returned warnings or errors.")
        } catch (e: unknown) {
            setImpExResult(`Import failed: ${getErrorMessage(e)}`)
        } finally {
            setImpExExecuting(false)
        }
    }

    const runCatalogDiff = async () => {
        if (!targetBaseUrl || !selectedCatalog) return

        setCatalogDiffLoading(true)
        setCatalogDiff(null)
        try {
            const res = await api.sapHacGetCatalogSyncDiff(targetBaseUrl, selectedCatalog, 200)
            if (!res.success || !res.data) {
                toast.error(`Unable to compute catalog diff: ${res.error || "unknown error"}`)
                return
            }

            setCatalogDiff(res.data)
            toast.success("Catalog delta computed successfully.")
        } catch (e: unknown) {
            toast.error(`Unable to compute catalog diff: ${getErrorMessage(e)}`)
        } finally {
            setCatalogDiffLoading(false)
        }
    }

    const fetchCcv2Envs = async () => {
        if (!ccv2Sub.trim() || !ccv2Token.trim()) return

        setCcv2Loading(true)
        try {
            const data = await api.ccv2GetEnvironments({ subscriptionCode: ccv2Sub.trim(), apiToken: ccv2Token.trim() })
            setCcv2Envs(Array.isArray(data) ? data : [])
            setSelectedCcv2Env("")
            setCcv2Deployments([])
            setCcv2BuildInfo(null)
            if (projectSecretPrefix) {
                await api.secureStoreSet(`${projectSecretPrefix}ccv2_subscription_code`, ccv2Sub.trim())
                await api.secureStoreSet(`${projectSecretPrefix}ccv2_api_token`, ccv2Token.trim())
            }
        } catch (e: unknown) {
            toast.error(`Unable to load CCv2 environments: ${getErrorMessage(e)}`)
            setCcv2Envs([])
        } finally {
            setCcv2Loading(false)
        }
    }

    const fetchCcv2Deployments = async () => {
        if (!selectedCcv2Env) return

        setCcv2Loading(true)
        try {
            const data = await api.ccv2GetDeployments({
                subscriptionCode: ccv2Sub.trim(),
                apiToken: ccv2Token.trim(),
                environmentCode: selectedCcv2Env,
            })
            setCcv2Deployments(Array.isArray(data) ? data : [])
        } catch (e: unknown) {
            toast.error(`Unable to load deployments: ${getErrorMessage(e)}`)
            setCcv2Deployments([])
        } finally {
            setCcv2Loading(false)
        }
    }

    const fetchCcv2Build = async () => {
        if (!ccv2BuildCode.trim()) return

        setCcv2Loading(true)
        try {
            const data = await api.ccv2GetBuild({
                subscriptionCode: ccv2Sub.trim(),
                apiToken: ccv2Token.trim(),
                buildCode: ccv2BuildCode.trim(),
            })
            setCcv2BuildInfo(data || null)
        } catch (e: unknown) {
            toast.error(`Unable to load build details: ${getErrorMessage(e)}`)
            setCcv2BuildInfo(null)
        } finally {
            setCcv2Loading(false)
        }
    }

    const filteredCronJobs = cronJobs.filter(job => {
        if (cronFilter === "All") return true
        if (cronFilter === "Running") return job.Status === "RUNNING"
        if (cronFilter === "Failed") return job.Status === "FAILURE"
        if (cronFilter === "Critical") return job.Status === "CRITICAL"
        return true
    })

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            <header className="bg-[#13131A] border-b border-[#2A2A3A] p-4 space-y-4 flex-none">
                <SubtabBar
                    value={activeTab}
                    onChange={(value) => setActiveTab(value as SapTab)}
                    items={[
                        { id: "Cronjobs", label: "Cronjobs", icon: Activity },
                        { id: "Catalog", label: "Catalog", icon: Layers },
                        { id: "FlexSearch", label: "FlexSearch", icon: TerminalSquare },
                        { id: "Impex", label: "ImpEx", icon: Zap },
                        { id: "Ccv2", label: "CCV2 Deployments", icon: Globe },
                    ]}
                />

                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                            <Globe className="h-3.5 w-3.5 text-[#A78BFA]" />
                            Environment:
                        </div>
                        <Select value={selectedEnvId} onValueChange={setSelectedEnvId}>
                            <SelectTrigger className="w-[220px] h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0] font-bold">
                                <SelectValue placeholder="Select environment" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                {environments.map(env => (
                                    <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                value={hacBaseUrl}
                                onChange={e => setHacBaseUrl(e.target.value)}
                                placeholder="HAC URL"
                                className="w-[260px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                            />
                            <Input
                                value={hacUser}
                                onChange={e => setHacUser(e.target.value)}
                                placeholder="User"
                                className="w-[140px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                            />
                            <Input
                                type="password"
                                value={hacPass}
                                onChange={e => setHacPass(e.target.value)}
                                placeholder="Password"
                                className="w-[160px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleConnect}
                            disabled={isConnecting || !targetBaseUrl}
                            className={cn(
                                "h-9 px-6 font-black text-[10px] uppercase tracking-widest gap-2 shadow-xl",
                                isConnected
                                    ? "bg-transparent border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/5"
                                    : "bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]"
                            )}
                        >
                            {isConnecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5 fill-current" />}
                            {isConnecting ? "AUTHORIZING..." : isConnected ? "CONNECTED" : "CONNECT"}
                        </Button>
                        {isConnected && (
                            <Button variant="ghost" onClick={handleDisconnect} className="h-9 text-[10px] font-black uppercase tracking-widest text-[#6B7280] hover:text-[#E2E8F0]">
                                Disconnect
                            </Button>
                        )}
                    </div>
                </div>

                {selectedEnv && (
                    <div className={cn(
                        "rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center gap-3",
                        isProductionEnv ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FECACA]" : "border-[#2A2A3A] bg-[#0F0F13] text-[#9CA3AF]"
                    )}>
                        {isProductionEnv ? <AlertTriangle className="h-4 w-4 text-[#F87171]" /> : <Activity className="h-4 w-4 text-[#A78BFA]" />}
                        <span className="font-bold text-[#E2E8F0]">{selectedEnv.name}</span>
                        <span className="uppercase tracking-widest">{selectedEnv.type}</span>
                        <span>HAC: {selectedEnv.hacUrl || "not configured"}</span>
                        <span>SSL bypass: {selectedEnv.ignoreSslErrors ? "enabled" : "disabled"}</span>
                        {isProductionEnv && <span className="font-bold">Production target. Validate before running imports.</span>}
                    </div>
                )}
            </header>

            <main className="flex-1 overflow-hidden">
                {!isConnected ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center relative group">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-700 shadow-2xl shadow-[#A78BFA]/5">
                            <ServerCog className="h-10 w-10 text-[#6B7280]/20" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-xl font-black text-[#E2E8F0] uppercase tracking-widest">Not Connected</h3>
                        <p className="text-sm text-[#6B7280] mt-4 max-w-sm font-medium leading-relaxed">
                            Select an SAP Commerce environment, review the target details, and connect to HAC before running queries or imports.
                        </p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col overflow-hidden">
                        {activeTab === "Cronjobs" && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0F0F13]">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {(["All", "Running", "Failed", "Critical"] as const).map(filter => (
                                            <button
                                                key={filter}
                                                onClick={() => setCronFilter(filter)}
                                                className={cn(
                                                    "h-7 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                                                    cronFilter === filter ? "bg-[#A78BFA] text-[#0F0F13]" : "text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#1A1A24]"
                                                )}
                                            >
                                                {filter}
                                            </button>
                                        ))}
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={fetchCronJobs} className="h-8 text-[10px] font-black uppercase text-[#A78BFA] gap-2">
                                        <RefreshCw className="h-3 w-3" /> Refresh Cronjobs
                                    </Button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] uppercase text-[#6B7280] font-black tracking-widest border-b border-[#2A2A3A]">
                                                <th className="pb-3 px-4">Status</th>
                                                <th className="pb-3 px-4">Job Code</th>
                                                <th className="pb-3 px-4">Last Result</th>
                                                <th className="pb-3 px-4">Next Activation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs">
                                            {filteredCronJobs.map((row, index) => {
                                                let color = "text-[#6B7280]"
                                                if (row.Status === "RUNNING") color = "text-[#3B82F6]"
                                                else if (row.Status === "SUCCESS") color = "text-[#10B981]"
                                                else if (row.Status === "FAILURE") color = "text-[#EF4444]"
                                                else if (row.Status === "CRITICAL") color = "text-[#E11D48]"

                                                return (
                                                    <tr key={index} className="border-b border-[#2A2A3A]/50 hover:bg-[#1A1A24]/50 transition-colors">
                                                        <td className="py-4 px-4 font-black">
                                                            <div className="flex items-center gap-2">
                                                                <div className={cn("h-1.5 w-1.5 rounded-full", color.replace("text-", "bg-"))} />
                                                                <span className={cn("text-[10px] tracking-widest font-black", color)}>{row.Status}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-4 font-bold text-[#E2E8F0] font-mono">{row.Code}</td>
                                                        <td className="py-4 px-4 text-[#6B7280] font-medium">{row.LastResult || "-"}</td>
                                                        <td className="py-4 px-4 text-[#6B7280] font-medium">{row.NextActivationTime || "-"}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === "FlexSearch" && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0F0F13]">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center gap-4">
                                    <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest whitespace-nowrap">FlexSearch Console</span>
                                    <div className="flex-1" />
                                    <Select onValueChange={value => setFlexQuery(FLEX_TEMPLATES[value] || "")}>
                                        <SelectTrigger className="w-[300px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold text-[#6B7280] uppercase">
                                            <SelectValue placeholder="Quick templates..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                            <SelectItem value="products">Fetch Products</SelectItem>
                                            <SelectItem value="catalogs">Invalid Catalog Versions</SelectItem>
                                            <SelectItem value="lockedUsers">Locked Users</SelectItem>
                                            <SelectItem value="promotions">Enabled Promotions</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="px-4 py-3 bg-[#0F0F13] border-b border-[#2A2A3A] flex items-center gap-3">
                                    <Sparkles className="h-3.5 w-3.5 text-[#A78BFA] shrink-0" />
                                    <Input
                                        value={nlQuery}
                                        onChange={e => setNlQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter" && !nlLoading) void generateFlexFromNl() }}
                                        placeholder='Ask AI: "find all products in staged catalog with no price"'
                                        className="flex-1 h-8 bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0] placeholder:text-[#6B7280]/60"
                                    />
                                    <Button
                                        onClick={generateFlexFromNl}
                                        disabled={!nlQuery.trim() || nlLoading}
                                        className="h-8 px-4 bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-black text-[10px] uppercase gap-2 hover:bg-[#A78BFA]/20"
                                        variant="ghost"
                                    >
                                        {nlLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                        {nlLoading ? "Generating..." : "Generate"}
                                    </Button>
                                </div>
                                <div className="h-48 bg-[#0F0F13] border-b border-[#2A2A3A] p-4 relative">
                                    <textarea
                                        value={flexQuery}
                                        onChange={e => setFlexQuery(e.target.value)}
                                        className="w-full h-full bg-transparent border-none text-[#A78BFA] font-mono text-sm resize-none focus:outline-none custom-scrollbar app-region-no-drag"
                                        placeholder="SELECT {p:pk}, {p:code} FROM {Product AS p} WHERE {p:approvalStatus} = 'approved'"
                                        spellCheck={false}
                                    />
                                    <Button
                                        onClick={runFlexSearch}
                                        disabled={!flexQuery.trim() || flexLoading}
                                        className="absolute bottom-6 right-8 h-10 px-8 bg-[#A78BFA] text-[#0F0F13] font-black text-xs gap-2 shadow-2xl shadow-[#A78BFA]/20"
                                    >
                                        <Play className="h-4 w-4 fill-current text-[#0F0F13]" /> Execute Query
                                    </Button>
                                </div>
                                {flexLoading && <div className="p-4 text-xs text-[#A78BFA]">Running query...</div>}
                                {flexResult ? (
                                    flexResult.Error ? (
                                        <div className="p-4 text-red-400">{flexResult.Error}</div>
                                    ) : (
                                        <div className="flex-1 p-4 overflow-auto">
                                            <table className="w-full table-auto text-xs">
                                                <thead>
                                                    <tr className="bg-[#13131A]">
                                                        {flexResult.Headers.map((header, index) => (
                                                            <th key={index} className="px-2 py-1 text-left">{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {flexResult.Rows.map((row, rowIndex) => (
                                                        <tr key={rowIndex} className="hover:bg-[#1A1A24]">
                                                            {row.map((cell, cellIndex) => (
                                                                <td key={cellIndex} className="px-2 py-1">{cell}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-[#6B7280] opacity-40">
                                        <TerminalSquare className="h-12 w-12 mb-4" strokeWidth={1} />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">No results yet</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "Catalog" && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0F0F13]">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center gap-4">
                                    <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest whitespace-nowrap">Catalog Delta Engine</span>
                                    <div className="flex-1" />
                                    {catalogIds.length > 0 ? (
                                        <Select value={selectedCatalog} onValueChange={setSelectedCatalog}>
                                            <SelectTrigger className="w-[250px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold text-[#6B7280]">
                                                <SelectValue placeholder="Select Catalog" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0] text-[10px]">
                                                {catalogIds.map(id => (
                                                    <SelectItem key={id} value={id}>{id}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <span className="text-[10px] text-[#A78BFA] animate-pulse">Loading catalogs...</span>
                                    )}
                                    <Button
                                        onClick={runCatalogDiff}
                                        disabled={!selectedCatalog || catalogDiffLoading}
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase gap-2"
                                    >
                                        {catalogDiffLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                        Compare Staged vs Online
                                    </Button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                    {!catalogDiff && !catalogDiffLoading && (
                                        <div className="h-full flex flex-col items-center justify-center text-[#6B7280] opacity-30">
                                            <Layers className="h-16 w-16 mb-6" strokeWidth={1} />
                                            <h3 className="text-sm font-black uppercase tracking-widest">Select a catalog to compare</h3>
                                        </div>
                                    )}
                                    {catalogDiffLoading && (
                                        <div className="h-full flex flex-col items-center justify-center text-[#A78BFA] gap-4">
                                            <RefreshCw className="h-8 w-8 animate-spin" />
                                            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Running delta queries...</span>
                                        </div>
                                    )}
                                    {catalogDiff && (
                                        <div className="space-y-6 max-w-4xl mx-auto">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-2xl p-6 flex flex-col items-center justify-center gap-2">
                                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Staged Items</span>
                                                    <span className="text-4xl font-black text-[#E2E8F0]">{catalogDiff.stagedCount}</span>
                                                </div>
                                                <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-2xl p-6 flex flex-col items-center justify-center gap-2">
                                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Online Items</span>
                                                    <span className="text-4xl font-black text-[#A78BFA]">{catalogDiff.onlineCount}</span>
                                                </div>
                                            </div>
                                            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden shadow-xl">
                                                <div className="px-6 py-4 border-b border-[#2A2A3A] flex items-center justify-between">
                                                    <span className="text-xs font-bold text-[#E2E8F0] uppercase tracking-widest">Missing in Online ({catalogDiff.missingStagedToOnline?.length || 0})</span>
                                                    <span className="text-[10px] text-[#6B7280]">Top 200 items</span>
                                                </div>
                                                <div className="p-6 bg-[#0F0F13]">
                                                    {catalogDiff.missingStagedToOnline?.length === 0 ? (
                                                        <div className="flex items-center gap-3 text-[#10B981]">
                                                            <CheckCircle2 className="h-5 w-5" />
                                                            <span className="text-xs font-bold uppercase tracking-widest">Catalog is fully synchronized</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {catalogDiff.missingStagedToOnline?.map((code, index) => (
                                                                <span key={index} className="px-2 py-1 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[10px] font-mono text-[#E2E8F0]">
                                                                    {code}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === "Impex" && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center gap-4">
                                    <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest whitespace-nowrap">ImpEx Playground</span>
                                    <div className="flex-1" />
                                    <Select onValueChange={value => setImpExScript(IMPEX_SNIPPETS[value] || "")}>
                                        <SelectTrigger className="w-[220px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold text-[#6B7280] uppercase">
                                            <SelectValue placeholder="Snippet templates..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                            <SelectItem value="product">Insert Product</SelectItem>
                                            <SelectItem value="customer">Insert Customer</SelectItem>
                                            <SelectItem value="removeProduct">Remove Product</SelectItem>
                                            <SelectItem value="stock">Update Stock Level</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-3 py-1.5">
                                        <Checkbox
                                            checked={impExEnableCode}
                                            onCheckedChange={value => setImpExEnableCode(!!value)}
                                            className="h-4 w-4 border-[#2A2A3A] data-[state=checked]:bg-[#EF4444]"
                                        />
                                        <span className="text-[10px] text-[#FCA5A5] uppercase tracking-widest font-bold">Enable Code Exec</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        onClick={handleValidateImpex}
                                        className="h-8 border-[#2A2A3A] text-[10px] font-black text-[#A78BFA] uppercase hover:bg-[#A78BFA]/5 border"
                                    >
                                        Validate Syntax
                                    </Button>
                                    <Button
                                        onClick={runImpEx}
                                        disabled={impExExecuting || !impExScript.trim()}
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                    >
                                        {impExExecuting ? "IMPORTING..." : "Import Script"}
                                    </Button>
                                </div>
                                <div className="px-4 py-3 border-b border-[#2A2A3A] bg-[#0A0A0E] text-[10px] uppercase tracking-widest text-[#9CA3AF] flex flex-wrap gap-3">
                                    <span>Target: {selectedEnv?.name || "Custom target"}</span>
                                    <span>Environment Type: {selectedEnv?.type || "custom"}</span>
                                    <span className={isProductionEnv ? "text-[#FCA5A5]" : ""}>{isProductionEnv ? "Production safeguards enabled" : "Non-production target"}</span>
                                </div>
                                <div className="flex-1 bg-[#0F0F13] p-4">
                                    <textarea
                                        value={impExScript}
                                        onChange={e => setImpExScript(e.target.value)}
                                        className="w-full h-full bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 text-[#E2E8F0] font-mono text-sm resize-none focus:outline-none selection:bg-[#A78BFA]/20 app-region-no-drag"
                                        placeholder="# ImpEx Script&#10;INSERT_UPDATE Product;code[unique=true];name[lang=en]&#10;;test_p001;High Fidelity Component"
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="h-36 bg-[#0A0A0E] border-t border-[#2A2A3A] p-4 custom-scrollbar overflow-y-auto">
                                    <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest mb-2 border-b border-[#2A2A3A]/30 pb-1">Console Log</div>
                                    <div className="font-mono text-[10px] text-[#A78BFA]/60 leading-relaxed whitespace-pre-wrap">
                                        {impExResult || `Ready for ImpEx import.\nTarget environment: ${selectedEnv?.name || selectedEnvId || "custom target"}`}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "Ccv2" && (
                            <div className="flex-1 overflow-auto p-4 bg-[#0F0F13] space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        placeholder="Subscription Code"
                                        value={ccv2Sub}
                                        onChange={e => setCcv2Sub(e.target.value)}
                                        className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                    />
                                    <Input
                                        type="password"
                                        placeholder="API Token"
                                        value={ccv2Token}
                                        onChange={e => setCcv2Token(e.target.value)}
                                        className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                    />
                                    <Button
                                        onClick={fetchCcv2Envs}
                                        disabled={!ccv2Sub.trim() || !ccv2Token.trim() || ccv2Loading}
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                    >
                                        {ccv2Loading ? "Loading..." : "Get Environments"}
                                    </Button>
                                </div>
                                {ccv2Envs.length > 0 && (
                                    <div className="mt-2 overflow-auto max-h-40 border border-[#2A2A3A]">
                                        <table className="w-full text-xs">
                                            <thead className="bg-[#13131A]">
                                                <tr>
                                                    <th className="px-2 py-1 text-left">Code</th>
                                                    <th className="px-2 py-1 text-left">Name</th>
                                                    <th className="px-2 py-1 text-left">Status</th>
                                                    <th className="px-2 py-1 text-left">Deploy Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ccv2Envs.map((env, index) => (
                                                    <tr
                                                        key={index}
                                                        className="hover:bg-[#1A1A24] cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedCcv2Env(env.code)
                                                            setCcv2Deployments([])
                                                        }}
                                                    >
                                                        <td className="px-2 py-1">{env.code}</td>
                                                        <td className="px-2 py-1">{env.name}</td>
                                                        <td className="px-2 py-1">{env.status}</td>
                                                        <td className="px-2 py-1">{env.deploymentStatus}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {selectedCcv2Env && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-[#E2E8F0]">Selected: {selectedCcv2Env}</span>
                                        <Button
                                            onClick={fetchCcv2Deployments}
                                            disabled={ccv2Loading}
                                            className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                        >
                                            Load Deployments
                                        </Button>
                                    </div>
                                )}

                                {ccv2Deployments.length > 0 && (
                                    <div className="mt-2 overflow-auto max-h-40 border border-[#2A2A3A] rounded-lg">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-[#13131A] text-[#6B7280] font-black tracking-widest uppercase">
                                                <tr>
                                                    <th className="px-4 py-2">Code</th>
                                                    <th className="px-4 py-2">Env</th>
                                                    <th className="px-4 py-2">Build</th>
                                                    <th className="px-4 py-2">Status</th>
                                                    <th className="px-4 py-2">Strategy</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-[#E2E8F0] font-medium font-mono">
                                                {ccv2Deployments.map((deployment, index) => (
                                                    <tr key={index} className="hover:bg-[#1A1A24] border-b border-[#2A2A3A] transition-colors">
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{deployment.code}</td>
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{deployment.environmentCode}</td>
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{deployment.buildCode}</td>
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{deployment.status}</td>
                                                        <td className="px-4 py-2">{deployment.strategy}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div className="mt-4 flex items-center gap-2">
                                    <Input
                                        placeholder="Build Code"
                                        value={ccv2BuildCode}
                                        onChange={e => setCcv2BuildCode(e.target.value)}
                                        className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                    />
                                    <Button
                                        onClick={fetchCcv2Build}
                                        disabled={ccv2Loading || !ccv2BuildCode.trim()}
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                    >
                                        Get Build
                                    </Button>
                                </div>

                                {ccv2BuildInfo && (
                                    <pre className="text-xs bg-[#13131A] p-3 rounded-lg overflow-auto">{JSON.stringify(ccv2BuildInfo, null, 2)}</pre>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
