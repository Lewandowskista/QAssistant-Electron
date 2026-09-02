import { useEffect, useMemo, useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { aiGenerateFlexSearch } from "@/lib/aiClient"
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
import { EmptyState } from "@/components/ui/empty-state"
import { FullBleedHeader } from "@/components/ui/workspace"
import { useConfirm } from "@/components/ConfirmDialog"

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
type CredentialStorageStatus = Awaited<ReturnType<typeof window.electronAPI.getCredentialStorageStatus>>

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
    const { confirm, dialog: confirmDialog } = useConfirm()

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
    const [credentialStatus, setCredentialStatus] = useState<CredentialStorageStatus | null>(null)

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
        api.getCredentialStorageStatus?.().then(setCredentialStatus).catch(() => {})
    }, [api])

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
            <div className="h-full flex items-center justify-center bg-app p-6">
                <EmptyState
                    icon={ShieldQuestion}
                    title="No project selected"
                    description="Select a project to access SAP Commerce features."
                />
            </div>
        )
    }

    const handleConnect = async () => {
        if (!targetBaseUrl || !hacUser.trim() || !hacPass.trim()) {
            toast.error("Enter the HAC URL, username, and password before connecting.")
            return
        }

        const status = await api.getCredentialStorageStatus?.()
        setCredentialStatus(status ?? null)
        if (status?.canPersistSecrets === false) {
            toast.error("HAC credentials cannot be stored until insecure plaintext storage is explicitly allowed in Settings.")
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
        setNlLoading(true)
        try {
            const result = await aiGenerateFlexSearch({ naturalLanguageQuery: nlQuery.trim() })
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

        if (isProductionEnv && !(await confirm(`Import ImpEx into production environment "${selectedEnv?.name}"?`, {
            description: "This will run the ImpEx script against a production target. Make sure you have validated the script.",
            confirmLabel: "Import to Production",
            destructive: true,
        }))) {
            return
        }

        if (impExEnableCode && !(await confirm("Enable code execution for this ImpEx import?", {
            description: "Code execution allows arbitrary Groovy/BeanShell to run on the server. This is high risk.",
            confirmLabel: "Enable & Import",
            destructive: true,
        }))) {
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

        const status = await api.getCredentialStorageStatus?.()
        setCredentialStatus(status ?? null)
        if (status?.canPersistSecrets === false) {
            toast.error("CCV2 credentials cannot be stored until insecure plaintext storage is explicitly allowed in Settings.")
            return
        }

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
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-app overflow-hidden">
            <FullBleedHeader
                icon={ServerCog}
                title="SAP HAC"
                description="SAP Commerce administration, queries, and imports"
            />
            <div className="bg-panel border-b border-ui p-4 space-y-4 flex-none">
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

                {credentialStatus?.canPersistSecrets === false && (
                    <div className="rounded-xl border border-state-warning/40 bg-state-warning-soft px-4 py-3 flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-state-warning mt-0.5 shrink-0" />
                        <p className="text-xs text-state-warning leading-relaxed">
                            SAP and CCV2 credentials cannot be stored on this device until insecure plaintext storage is explicitly allowed in Settings.
                        </p>
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="app-section-label flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-brand" />
                            Environment
                        </div>
                        <Select value={selectedEnvId} onValueChange={setSelectedEnvId}>
                            <SelectTrigger className="w-[220px] h-9 bg-panel-muted border-ui text-xs text-foreground">
                                <SelectValue placeholder="Select environment" />
                            </SelectTrigger>
                            <SelectContent className="bg-panel-muted border-ui text-foreground">
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
                                className="w-[260px] h-8 bg-panel-muted border-ui text-foreground text-xs"
                            />
                            <Input
                                value={hacUser}
                                onChange={e => setHacUser(e.target.value)}
                                placeholder="User"
                                className="w-[140px] h-8 bg-panel-muted border-ui text-foreground text-xs"
                            />
                            <Input
                                type="password"
                                value={hacPass}
                                onChange={e => setHacPass(e.target.value)}
                                placeholder="Password"
                                className="w-[160px] h-8 bg-panel-muted border-ui text-foreground text-xs"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleConnect}
                            disabled={isConnecting || !targetBaseUrl}
                            className={cn(
                                "h-9 px-6 text-xs gap-2",
                                isConnected
                                    ? "bg-transparent border border-state-success-border text-state-success hover:bg-state-success-soft"
                                    : "bg-primary text-primary-foreground hover:bg-[hsl(var(--accent-primary-strong))]"
                            )}
                        >
                            {isConnecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5 fill-current" />}
                            {isConnecting ? "Authorizing…" : isConnected ? "Connected" : "Connect"}
                        </Button>
                        {isConnected && (
                            <Button variant="ghost" onClick={handleDisconnect} className="h-9 text-xs text-muted-ui hover:text-foreground">
                                Disconnect
                            </Button>
                        )}
                    </div>
                </div>

                {selectedEnv && (
                    <div className={cn(
                        "rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center gap-3",
                        isProductionEnv ? "border-state-danger-border bg-state-danger-soft text-state-danger" : "border-ui bg-app text-soft"
                    )}>
                        {isProductionEnv ? <AlertTriangle className="h-4 w-4 text-state-danger" /> : <Activity className="h-4 w-4 text-brand" />}
                        <span className="font-semibold text-foreground">{selectedEnv.name}</span>
                        <span>{selectedEnv.type}</span>
                        <span>HAC: {selectedEnv.hacUrl || "not configured"}</span>
                        <span>SSL bypass: {selectedEnv.ignoreSslErrors ? "enabled" : "disabled"}</span>
                        {isProductionEnv && <span className="font-semibold">Production target. Validate before running imports.</span>}
                    </div>
                )}
            </div>

            <main className="flex-1 overflow-hidden">
                {!isConnected ? (
                    <div className="h-full flex items-center justify-center p-6">
                        <EmptyState
                            icon={ServerCog}
                            title="Not connected"
                            description="Select an SAP Commerce environment, review the target details, and connect to HAC before running queries or imports."
                        />
                    </div>
                ) : (
                    <div className="h-full flex flex-col overflow-hidden">
                        {activeTab === "Cronjobs" && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-app">
                                <div className="p-4 bg-panel border-b border-ui flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {(["All", "Running", "Failed", "Critical"] as const).map(filter => (
                                            <button
                                                key={filter}
                                                onClick={() => setCronFilter(filter)}
                                                className={cn(
                                                    "h-7 px-3 rounded-md text-xs font-medium transition-all",
                                                    cronFilter === filter ? "bg-primary text-primary-foreground" : "text-muted-ui hover:text-foreground hover:bg-elevated"
                                                )}
                                            >
                                                {filter}
                                            </button>
                                        ))}
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={fetchCronJobs} className="h-8 text-xs text-brand gap-2">
                                        <RefreshCw className="h-3 w-3" /> Refresh cronjobs
                                    </Button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                    <table className="app-table">
                                        <thead>
                                            <tr>
                                                <th>Status</th>
                                                <th>Job code</th>
                                                <th>Last result</th>
                                                <th>Next activation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCronJobs.map((row) => {
                                                let color = "text-muted-ui"
                                                if (row.Status === "RUNNING") color = "text-state-info"
                                                else if (row.Status === "SUCCESS") color = "text-state-success"
                                                else if (row.Status === "FAILURE") color = "text-state-danger"
                                                else if (row.Status === "CRITICAL") color = "text-state-danger"

                                                return (
                                                    <tr key={row.Code}>
                                                        <td>
                                                            <div className="flex items-center gap-2">
                                                                <div className={cn("h-1.5 w-1.5 rounded-full", color.replace("text-", "bg-"))} />
                                                                <span className={cn("text-xs font-semibold", color)}>{row.Status}</span>
                                                            </div>
                                                        </td>
                                                        <td className="font-mono text-foreground">{row.Code}</td>
                                                        <td>{row.LastResult || "-"}</td>
                                                        <td>{row.NextActivationTime || "-"}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === "FlexSearch" && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-app">
                                <div className="p-4 bg-panel border-b border-ui flex items-center gap-4">
                                    <span className="app-section-label whitespace-nowrap">FlexSearch console</span>
                                    <div className="flex-1" />
                                    <Select onValueChange={value => setFlexQuery(FLEX_TEMPLATES[value] || "")}>
                                        <SelectTrigger className="w-[300px] h-8 bg-panel-muted border-ui text-xs text-muted-ui">
                                            <SelectValue placeholder="Quick templates…" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-panel-muted border-ui text-foreground">
                                            <SelectItem value="products">Fetch Products</SelectItem>
                                            <SelectItem value="catalogs">Invalid Catalog Versions</SelectItem>
                                            <SelectItem value="lockedUsers">Locked Users</SelectItem>
                                            <SelectItem value="promotions">Enabled Promotions</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="px-4 py-3 bg-app border-b border-ui flex items-center gap-3">
                                    <Sparkles className="h-3.5 w-3.5 text-brand shrink-0" />
                                    <Input
                                        value={nlQuery}
                                        onChange={e => setNlQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter" && !nlLoading) void generateFlexFromNl() }}
                                        placeholder='Ask AI: "find all products in staged catalog with no price"'
                                        className="flex-1 h-8 bg-panel-muted border-ui text-xs text-foreground placeholder:text-text-muted/60"
                                    />
                                    <Button
                                        onClick={generateFlexFromNl}
                                        disabled={!nlQuery.trim() || nlLoading}
                                        className="h-8 px-4 bg-qa-accent/10 border border-qa-accent/30 text-brand text-xs gap-2 hover:bg-qa-accent/20"
                                        variant="ghost"
                                    >
                                        {nlLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                        {nlLoading ? "Generating…" : "Generate"}
                                    </Button>
                                </div>
                                <div className="h-48 bg-app border-b border-ui p-4 relative">
                                    <textarea
                                        value={flexQuery}
                                        onChange={e => setFlexQuery(e.target.value)}
                                        className="w-full h-full bg-transparent border-none text-brand font-mono text-sm resize-none focus:outline-none custom-scrollbar app-region-no-drag"
                                        placeholder="SELECT {p:pk}, {p:code} FROM {Product AS p} WHERE {p:approvalStatus} = 'approved'"
                                        spellCheck={false}
                                    />
                                    <Button
                                        onClick={runFlexSearch}
                                        disabled={!flexQuery.trim() || flexLoading}
                                        className="absolute bottom-6 right-8 h-10 px-8 bg-primary text-primary-foreground text-xs gap-2 shadow-2xl shadow-qa-accent/20"
                                    >
                                        <Play className="h-4 w-4 fill-current text-primary-foreground" /> Execute query
                                    </Button>
                                </div>
                                {flexLoading && <div className="p-4 text-xs text-brand">Running query…</div>}
                                {flexResult ? (
                                    flexResult.Error ? (
                                        <div className="p-4 text-state-danger">{flexResult.Error}</div>
                                    ) : (
                                        <div className="flex-1 p-4 overflow-auto">
                                            <table className="app-table table-auto">
                                                <thead>
                                                    <tr>
                                                        {flexResult.Headers.map((header) => (
                                                            <th key={header}>{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {flexResult.Rows.map((row, rowIndex) => (
                                                        <tr key={rowIndex}>
                                                            {row.map((cell, cellIndex) => (
                                                                <td key={cellIndex}>{cell}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex items-center justify-center p-6">
                                        <EmptyState
                                            icon={TerminalSquare}
                                            title="No results yet"
                                            description="Run a FlexSearch query or generate one with AI to see results here."
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "Catalog" && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-app">
                                <div className="p-4 bg-panel border-b border-ui flex items-center gap-4">
                                    <span className="app-section-label whitespace-nowrap">Catalog delta</span>
                                    <div className="flex-1" />
                                    {catalogIds.length > 0 ? (
                                        <Select value={selectedCatalog} onValueChange={setSelectedCatalog}>
                                            <SelectTrigger className="w-[250px] h-8 bg-panel-muted border-ui text-xs text-muted-ui">
                                                <SelectValue placeholder="Select catalog" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-panel-muted border-ui text-foreground text-[11px]">
                                                {catalogIds.map(id => (
                                                    <SelectItem key={id} value={id}>{id}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <span className="text-[11px] text-brand animate-pulse">Loading catalogs…</span>
                                    )}
                                    <Button
                                        onClick={runCatalogDiff}
                                        disabled={!selectedCatalog || catalogDiffLoading}
                                        className="h-8 bg-primary text-primary-foreground text-xs gap-2"
                                    >
                                        {catalogDiffLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                        Compare staged vs online
                                    </Button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                    {!catalogDiff && !catalogDiffLoading && (
                                        <div className="h-full flex items-center justify-center p-6">
                                            <EmptyState
                                                icon={Layers}
                                                title="Select a catalog to compare"
                                                description="Choose a catalog and run the comparison to see the staged versus online differences."
                                            />
                                        </div>
                                    )}
                                    {catalogDiffLoading && (
                                        <div className="h-full flex flex-col items-center justify-center text-brand gap-4">
                                            <RefreshCw className="h-8 w-8 animate-spin" />
                                            <span className="text-xs animate-pulse">Running delta queries…</span>
                                        </div>
                                    )}
                                    {catalogDiff && (
                                        <div className="space-y-6 max-w-4xl mx-auto">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-panel-muted border border-ui rounded-2xl p-6 flex flex-col items-center justify-center gap-2">
                                                    <span className="app-section-label">Staged items</span>
                                                    <span className="text-4xl font-semibold text-foreground">{catalogDiff.stagedCount}</span>
                                                </div>
                                                <div className="bg-panel-muted border border-ui rounded-2xl p-6 flex flex-col items-center justify-center gap-2">
                                                    <span className="app-section-label">Online items</span>
                                                    <span className="text-4xl font-semibold text-brand">{catalogDiff.onlineCount}</span>
                                                </div>
                                            </div>
                                            <div className="bg-panel border border-ui rounded-2xl overflow-hidden shadow-xl">
                                                <div className="px-6 py-4 border-b border-ui flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-foreground">Missing in online ({catalogDiff.missingStagedToOnline?.length || 0})</span>
                                                    <span className="text-[11px] text-muted-ui">Top 200 items</span>
                                                </div>
                                                <div className="p-6 bg-app">
                                                    {catalogDiff.missingStagedToOnline?.length === 0 ? (
                                                        <div className="flex items-center gap-3 text-state-success">
                                                            <CheckCircle2 className="h-5 w-5" />
                                                            <span className="text-xs font-medium">Catalog is fully synchronized</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {catalogDiff.missingStagedToOnline?.map((code) => (
                                                                <span key={code} className="px-2 py-1 bg-panel-muted border border-ui rounded text-[11px] font-mono text-foreground">
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
                                <div className="p-4 bg-panel border-b border-ui flex items-center gap-4">
                                    <span className="app-section-label whitespace-nowrap">ImpEx playground</span>
                                    <div className="flex-1" />
                                    <Select onValueChange={value => setImpExScript(IMPEX_SNIPPETS[value] || "")}>
                                        <SelectTrigger className="w-[220px] h-8 bg-panel-muted border-ui text-xs text-muted-ui">
                                            <SelectValue placeholder="Snippet templates…" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-panel-muted border-ui text-foreground">
                                            <SelectItem value="product">Insert Product</SelectItem>
                                            <SelectItem value="customer">Insert Customer</SelectItem>
                                            <SelectItem value="removeProduct">Remove Product</SelectItem>
                                            <SelectItem value="stock">Update Stock Level</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2 rounded-lg border border-state-danger-border bg-state-danger-soft px-3 py-1.5">
                                        <Checkbox
                                            checked={impExEnableCode}
                                            onCheckedChange={value => setImpExEnableCode(!!value)}
                                            className="h-4 w-4 border-ui data-[state=checked]:bg-state-danger"
                                        />
                                        <span className="text-xs font-medium text-state-danger">Enable code execution</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        onClick={handleValidateImpex}
                                        className="h-8 border-ui text-xs text-brand hover:bg-qa-accent/5 border"
                                    >
                                        Validate syntax
                                    </Button>
                                    <Button
                                        onClick={runImpEx}
                                        disabled={impExExecuting || !impExScript.trim()}
                                        className="h-8 bg-primary text-primary-foreground text-xs"
                                    >
                                        {impExExecuting ? "Importing…" : "Import script"}
                                    </Button>
                                </div>
                                <div className="px-4 py-3 border-b border-ui bg-app text-xs text-soft flex flex-wrap gap-3">
                                    <span>Target: {selectedEnv?.name || "Custom target"}</span>
                                    <span>Environment type: {selectedEnv?.type || "custom"}</span>
                                    <span className={isProductionEnv ? "text-state-danger" : ""}>{isProductionEnv ? "Production safeguards enabled" : "Non-production target"}</span>
                                </div>
                                <div className="flex-1 bg-app p-4">
                                    <textarea
                                        value={impExScript}
                                        onChange={e => setImpExScript(e.target.value)}
                                        className="w-full h-full bg-panel border border-ui rounded-2xl p-6 text-foreground font-mono text-sm resize-none focus:outline-none selection:bg-qa-accent/20 app-region-no-drag"
                                        placeholder="# ImpEx Script&#10;INSERT_UPDATE Product;code[unique=true];name[lang=en]&#10;;test_p001;High Fidelity Component"
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="h-36 bg-app border-t border-ui p-4 custom-scrollbar overflow-y-auto">
                                    <div className="app-section-label mb-2 border-b border-line/30 pb-1">Console log</div>
                                    <div className="font-mono text-[11px] text-qa-accent/60 leading-relaxed whitespace-pre-wrap">
                                        {impExResult || `Ready for ImpEx import.\nTarget environment: ${selectedEnv?.name || selectedEnvId || "custom target"}`}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "Ccv2" && (
                            <div className="flex-1 overflow-auto p-4 bg-app space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        placeholder="Subscription code"
                                        value={ccv2Sub}
                                        onChange={e => setCcv2Sub(e.target.value)}
                                        className="h-8 bg-panel-muted border border-ui text-foreground text-xs"
                                    />
                                    <Input
                                        type="password"
                                        placeholder="API token"
                                        value={ccv2Token}
                                        onChange={e => setCcv2Token(e.target.value)}
                                        className="h-8 bg-panel-muted border border-ui text-foreground text-xs"
                                    />
                                    <Button
                                        onClick={fetchCcv2Envs}
                                        disabled={!ccv2Sub.trim() || !ccv2Token.trim() || ccv2Loading}
                                        className="h-8 bg-primary text-primary-foreground text-xs"
                                    >
                                        {ccv2Loading ? "Loading…" : "Get environments"}
                                    </Button>
                                </div>
                                {ccv2Envs.length > 0 && (
                                    <div className="mt-2 overflow-auto max-h-40">
                                        <table className="app-table">
                                            <thead>
                                                <tr>
                                                    <th>Code</th>
                                                    <th>Name</th>
                                                    <th>Status</th>
                                                    <th>Deploy status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ccv2Envs.map((env) => (
                                                    <tr
                                                        key={env.code}
                                                        className="cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedCcv2Env(env.code)
                                                            setCcv2Deployments([])
                                                        }}
                                                    >
                                                        <td>{env.code}</td>
                                                        <td>{env.name}</td>
                                                        <td>{env.status}</td>
                                                        <td>{env.deploymentStatus}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {selectedCcv2Env && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-foreground">Selected: {selectedCcv2Env}</span>
                                        <Button
                                            onClick={fetchCcv2Deployments}
                                            disabled={ccv2Loading}
                                            className="h-8 bg-primary text-primary-foreground text-xs"
                                        >
                                            Load deployments
                                        </Button>
                                    </div>
                                )}

                                {ccv2Deployments.length > 0 && (
                                    <div className="mt-2 overflow-auto max-h-40">
                                        <table className="app-table">
                                            <thead>
                                                <tr>
                                                    <th>Code</th>
                                                    <th>Env</th>
                                                    <th>Build</th>
                                                    <th>Status</th>
                                                    <th>Strategy</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono">
                                                {ccv2Deployments.map((deployment) => (
                                                    <tr key={deployment.code}>
                                                        <td>{deployment.code}</td>
                                                        <td>{deployment.environmentCode}</td>
                                                        <td>{deployment.buildCode}</td>
                                                        <td>{deployment.status}</td>
                                                        <td>{deployment.strategy}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div className="mt-4 flex items-center gap-2">
                                    <Input
                                        placeholder="Build code"
                                        value={ccv2BuildCode}
                                        onChange={e => setCcv2BuildCode(e.target.value)}
                                        className="h-8 bg-panel-muted border border-ui text-foreground text-xs"
                                    />
                                    <Button
                                        onClick={fetchCcv2Build}
                                        disabled={ccv2Loading || !ccv2BuildCode.trim()}
                                        className="h-8 bg-primary text-primary-foreground text-xs"
                                    >
                                        Get build
                                    </Button>
                                </div>

                                {ccv2BuildInfo && (
                                    <pre className="text-xs bg-panel p-3 rounded-lg overflow-auto">{JSON.stringify(ccv2BuildInfo, null, 2)}</pre>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>
            {confirmDialog}
        </div>
    )
}
