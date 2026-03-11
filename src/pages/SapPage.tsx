import { useState, useEffect } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { ServerCog, Play, RefreshCw, TerminalSquare, CheckCircle2, Zap, Activity, ShieldQuestion, Globe, Layers } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

// types for SAP HAC
import { CronJobEntry, FlexibleSearchResult } from "@/lib/sapHac"
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

type SapTab = 'Cronjobs' | 'Catalog' | 'FlexSearch' | 'Impex' | 'Ccv2'

export default function SapPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const environments = activeProject?.environments || []

    // electron API bridge
    const api = (window as any).electronAPI

    const [activeTab, setActiveTab] = useState<SapTab>('Cronjobs')
    const [selectedEnvId, setSelectedEnvId] = useState<string>("")
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)

    // SAP HAC credentials/url
    const [hacBaseUrl, setHacBaseUrl] = useState<string>('')
    const [hacUser, setHacUser] = useState<string>('')
    const [hacPass, setHacPass] = useState<string>('')

    // Cronjob data
    const [cronJobs, setCronJobs] = useState<CronJobEntry[]>([])

    // Sub-states
    const [cronFilter, setCronFilter] = useState("All")

    // FlexSearch state
    const [flexQuery, setFlexQuery] = useState<string>('')
    const [flexResult, setFlexResult] = useState<FlexibleSearchResult | null>(null)
    const [flexLoading, setFlexLoading] = useState(false)

    // ImpEx state
    const [impExScript, setImpExScript] = useState<string>('')
    const [impExResult, setImpExResult] = useState<string>('')
    const [impExExecuting, setImpExExecuting] = useState(false)
    const [impExEnableCode, setImpExEnableCode] = useState(false)

    // Catalog state
    const [catalogIds, setCatalogIds] = useState<string[]>([])
    const [selectedCatalog, setSelectedCatalog] = useState<string>('')
    const [catalogDiff, setCatalogDiff] = useState<any>(null)
    const [catalogDiffLoading, setCatalogDiffLoading] = useState(false)

    // CCv2 state
    const [ccv2Sub, setCcv2Sub] = useState<string>('')
    const [ccv2Token, setCcv2Token] = useState<string>('')
    const [ccv2Envs, setCcv2Envs] = useState<any[]>([])
    const [selectedCcv2Env, setSelectedCcv2Env] = useState<string>('')
    const [ccv2Deployments, setCcv2Deployments] = useState<any[]>([])
    const [ccv2BuildCode, setCcv2BuildCode] = useState<string>('')
    const [ccv2BuildInfo, setCcv2BuildInfo] = useState<any | null>(null)

    useEffect(() => {
        if (environments.length > 0 && !selectedEnvId) {
            const defaultEnv = environments.find(e => e.isDefault) || environments[0]
            setSelectedEnvId(defaultEnv.id)
        }
    }, [environments])

    // load saved HAC credentials for a base URL
    useEffect(() => {
        if (!hacBaseUrl) return;
        (async () => {
            try {
                const stored = await api.secureStoreGet(`sapHac:${hacBaseUrl}`);
                if (stored) {
                    const obj = JSON.parse(stored);
                    if (obj.user) setHacUser(obj.user);
                    if (obj.pass) setHacPass(obj.pass);
                }
            } catch { }
        })();
    }, [hacBaseUrl])

    // load saved CCv2 token when subscription changes
    useEffect(() => {
        if (!ccv2Sub) {
            setCcv2Token('');
            return;
        }
        (async () => {
            try {
                const saved = await api.secureStoreGet(`ccv2:${ccv2Sub}`);
                if (saved) {
                    setCcv2Token(saved);
                }
            } catch { }
        })();
    }, [ccv2Sub])

    useEffect(() => {
        if (isConnected) {
            fetchCronJobs();
        }
    }, [isConnected])

    useEffect(() => {
        if (isConnected && activeTab === 'Catalog' && catalogIds.length === 0) {
            (async () => {
                const res = await api.sapHacGetCatalogIds(hacBaseUrl)
                if (res.success && res.data) {
                    setCatalogIds(res.data)
                    if (res.data.length > 0 && !selectedCatalog) setSelectedCatalog(res.data[0])
                }
            })()
        }
    }, [isConnected, activeTab, hacBaseUrl, catalogIds.length, selectedCatalog])

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60 bg-[#0F0F13]">
                <ShieldQuestion className="h-16 w-16 mb-4 text-[#6B7280]" />
                <h2 className="text-xl font-black uppercase tracking-widest text-[#E2E8F0]">No Project Selected</h2>
                <p className="text-xs font-bold text-[#6B7280] mt-2">Select a project to access SAP HAC features.</p>
            </div>
        )
    }

    const handleConnect = async () => {
        if (!hacBaseUrl || !hacUser || !hacPass) {
            toast.error('Please enter HAC URL, username and password.');
            return;
        }
        setIsConnecting(true);
        try {
            const res = await api.sapHacLogin(hacBaseUrl, hacUser, hacPass, false);
            if (res.success) {
                setIsConnected(true);
                // save credentials locally for convenience
                try {
                    await api.secureStoreSet(`sapHac:${hacBaseUrl}`, JSON.stringify({ user: hacUser, pass: hacPass }));
                } catch { }
                await fetchCronJobs();
                toast.success('Successfully connected to HAC.');
            } else {
                toast.error('Login failed: ' + (res.error || 'unknown'));
            }
        } catch (e: any) {
            toast.error('Login error: ' + e.message);
        } finally {
            setIsConnecting(false);
        }
    }

    const fetchCronJobs = async () => {
        if (!hacBaseUrl) return;
        try {
            const r = await api.sapHacGetCronJobs(hacBaseUrl);
            if (r.success && r.data) {
                setCronJobs(r.data as CronJobEntry[]);
            } else {
                console.error('Cronjobs fetch failed', r.error);
            }
        } catch (e) {
            console.error('error fetching cronjobs', e);
        }
    }

    const runFlexSearch = async () => {
        if (!hacBaseUrl) return;
        setFlexLoading(true);
        try {
            const r = await api.sapHacFlexibleSearch(hacBaseUrl, flexQuery, 500);
            if (r.success && r.result) {
                setFlexResult(r.result as FlexibleSearchResult);
            } else {
                setFlexResult({ Headers: [], Rows: [], Error: r.error || 'unknown' });
            }
        } catch (e: any) {
            setFlexResult({ Headers: [], Rows: [], Error: e.message || String(e) });
        } finally {
            setFlexLoading(false);
        }
    }

    const runImpEx = async () => {
        if (!hacBaseUrl) return;
        setImpExExecuting(true);
        try {
            const r = await api.sapHacImportImpEx(hacBaseUrl, impExScript, impExEnableCode);
            if (r.success && r.result) {
                setImpExResult(JSON.stringify(r.result, null, 2));
            } else {
                setImpExResult('Error: ' + (r.error || 'unknown'));
            }
        } catch (e: any) {
            setImpExResult('Error: ' + (e.message || String(e)));
        } finally {
            setImpExExecuting(false);
        }
    }

    const handleValidateImpex = () => {
        if (!impExScript.trim()) {
            setImpExResult("Script is empty");
            return;
        }

        const issues: string[] = [];
        const lines = impExScript.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;

            // Basic check for ImpEx headers
            const headerMatch = line.match(/^(INSERT|UPDATE|INSERT_UPDATE|REMOVE)\s/i);
            if (headerMatch) {
                if (!line.includes(';')) {
                    issues.push(`Line ${i + 1}: Missing semicolon separator in header`);
                }
            }
        }

        if (issues.length === 0) {
            setImpExResult("✓ Basic syntax looks valid");
        } else {
            setImpExResult(`⚠ ${issues.length} issue(s):\n${issues.join('\n')}`);
        }
    }

    const runCatalogDiff = async () => {
        if (!hacBaseUrl || !selectedCatalog) return
        setCatalogDiffLoading(true)
        setCatalogDiff(null)
        try {
            const res = await api.sapHacGetCatalogSyncDiff(hacBaseUrl, selectedCatalog, 200)
            if (res.success && res.data) {
                setCatalogDiff(res.data)
                toast.success('Catalog delta computed successfully.');
            } else {
                toast.error('Diff failed: ' + res.error)
            }
        } catch (e: any) {
            toast.error('Error: ' + e.message)
        } finally {
            setCatalogDiffLoading(false)
        }
    }

    const fetchCcv2Envs = async () => {
        try {
            const r = await api.ccv2GetEnvironments({ subscriptionCode: ccv2Sub, apiToken: ccv2Token });
            if (r.success && Array.isArray(r)) {
                setCcv2Envs(r as any[]);
                // save token for this subscription
                try {
                    await api.secureStoreSet(`ccv2:${ccv2Sub}`, ccv2Token);
                } catch { }
            } else {
                setCcv2Envs([]);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const fetchCcv2Deployments = async () => {
        if (!selectedCcv2Env) return;
        try {
            const r = await api.ccv2GetDeployments({ subscriptionCode: ccv2Sub, apiToken: ccv2Token, environmentCode: selectedCcv2Env });
            if (r.success && Array.isArray(r)) {
                setCcv2Deployments(r as any[]);
            } else {
                setCcv2Deployments([]);
            }
        } catch (e) {
            console.error(e);
        }
    }

    const fetchCcv2Build = async () => {
        if (!ccv2BuildCode) return;
        try {
            const r = await api.ccv2GetBuild({ subscriptionCode: ccv2Sub, apiToken: ccv2Token, buildCode: ccv2BuildCode });
            if (r.success && r.result) {
                setCcv2BuildInfo(r.result);
            } else {
                setCcv2BuildInfo(null);
            }
        } catch (e) {
            console.error(e);
        }
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Toolbar Header */}
            <header className="bg-[#13131A] border-b border-[#2A2A3A] p-4 space-y-4 flex-none">
                <div className="flex items-center gap-2">
                    {(['Cronjobs', 'Catalog', 'FlexSearch', 'Impex', 'Ccv2'] as SapTab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "h-9 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border",
                                activeTab === tab
                                    ? "bg-[#A78BFA]/10 border-[#A78BFA]/30 text-[#A78BFA]"
                                    : "bg-transparent border-transparent text-[#6B7280] hover:bg-[#1A1A24]"
                            )}
                        >
                            {tab === 'Ccv2' ? 'CCV2 Deployments' : tab}
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                            <Globe className="h-3.5 w-3.5 text-[#A78BFA]" />
                            Environment:
                        </div>
                        <Select value={selectedEnvId} onValueChange={setSelectedEnvId}>
                            <SelectTrigger className="w-[200px] h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0] font-bold">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                {environments.map(env => (
                                    <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* HAC credentials inputs */}
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="HAC URL"
                                value={hacBaseUrl}
                                onChange={e => setHacBaseUrl(e.target.value)}
                                className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] px-2 text-xs app-region-no-drag"
                            />
                            <input
                                type="text"
                                placeholder="User"
                                value={hacUser}
                                onChange={e => setHacUser(e.target.value)}
                                className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] px-2 text-xs app-region-no-drag"
                            />
                            <input
                                type="password"
                                placeholder="Pass"
                                value={hacPass}
                                onChange={e => setHacPass(e.target.value)}
                                className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] px-2 text-xs app-region-no-drag"
                            />
                        </div>
                        <Button
                            onClick={handleConnect}
                            disabled={isConnected || isConnecting}
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
                            <span className="text-[10px] font-bold text-[#10B981] uppercase tracking-widest flex items-center gap-2">
                                <Activity className="h-3 w-3 animate-pulse" /> Connected
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <main className="flex-1 overflow-hidden">
                {!isConnected ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center relative group">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-700 shadow-2xl shadow-[#A78BFA]/5">
                            <ServerCog className="h-10 w-10 text-[#6B7280]/20" strokeWidth={1.5} />
                        </div>
                        <h3 className="text-xl font-black text-[#E2E8F0] uppercase tracking-widest">Not Connected</h3>
                        <p className="text-sm text-[#6B7280] mt-4 max-w-sm font-medium leading-relaxed">
                            Connect to the target environment's Administration Console to monitor background jobs, inspect catalog states, and execute direct database queries.
                        </p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col overflow-hidden">
                        {activeTab === 'Cronjobs' && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0F0F13]">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {(['All', 'Running', 'Failed', 'Critical'] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setCronFilter(f)}
                                                className={cn(
                                                    "h-7 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                                                    cronFilter === f ? "bg-[#A78BFA] text-[#0F0F13]" : "text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#1A1A24]"
                                                )}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={fetchCronJobs} className="h-8 text-[10px] font-black uppercase text-[#A78BFA] gap-2">
                                        <RefreshCw className="h-3 w-3" /> REFRESH COLLECTIONS
                                    </Button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] uppercase text-[#6B7280] font-black tracking-widest border-b border-[#2A2A3A] pb-2">
                                                <th className="pb-3 px-4">STATUS</th>
                                                <th className="pb-3 px-4">JOB CODE</th>
                                                <th className="pb-3 px-4">LAST RESULT</th>
                                                <th className="pb-3 px-4">NEXT ACTIVATION</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs">
                                            {cronJobs
                                                .filter(job => {
                                                    if (cronFilter === 'All') return true;
                                                    if (cronFilter === 'Running') return job.Status === 'RUNNING';
                                                    if (cronFilter === 'Failed') return job.Status === 'FAILURE';
                                                    if (cronFilter === 'Critical') return job.Status === 'CRITICAL';
                                                    return true;
                                                })
                                                .map((row, i) => {
                                                    let color = 'text-[#6B7280]';
                                                    if (row.Status === 'RUNNING') color = 'text-[#3B82F6]';
                                                    else if (row.Status === 'SUCCESS') color = 'text-[#10B981]';
                                                    else if (row.Status === 'FAILURE') color = 'text-[#EF4444]';
                                                    else if (row.Status === 'CRITICAL') color = 'text-[#E11D48]';
                                                    return (
                                                        <tr key={i} className="border-b border-[#2A2A3A]/50 hover:bg-[#1A1A24]/50 transition-colors group cursor-pointer">
                                                            <td className="py-4 px-4 font-black">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={cn("h-1.5 w-1.5 rounded-full", color.replace('text-', 'bg-'))} />
                                                                    <span className={cn("text-[10px] tracking-widest font-black", color)}>{row.Status}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-4 px-4 font-bold text-[#E2E8F0] font-mono group-hover:text-[#A78BFA]">{row.Code}</td>
                                                            <td className="py-4 px-4 text-[#6B7280] font-medium">{row.LastResult || '-'}</td>
                                                            <td className="py-4 px-4 text-[#6B7280] font-medium">{row.NextActivationTime || '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'FlexSearch' && (
                            <div className="flex-1 flex flex-col overflow-hidden bg-[#0F0F13]">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center gap-4">
                                    <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest whitespace-nowrap">FlexSearch Console</span>
                                    <div className="flex-1" />
                                    <Select onValueChange={(val) => {
                                        const queries: Record<string, string> = {
                                            "1": "SELECT {p.code}, {p.name[en]} FROM {Product AS p} ORDER BY {p.code} LIMIT 50",
                                            "2": "SELECT {cv.catalog}, {cv.version} FROM {CatalogVersion AS cv} WHERE {cv.active} = 0",
                                            "3": "SELECT {u.uid}, {u.name} FROM {User AS u} WHERE {u.loginDisabled} = 1",
                                            "4": "SELECT {pr.code}, {pr.enabled} FROM {AbstractPromotion AS pr} WHERE {pr.enabled} = 1"
                                        };
                                        if (queries[val]) setFlexQuery(queries[val]);
                                    }}>
                                        <SelectTrigger className="w-[300px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold text-[#6B7280] uppercase">
                                            <SelectValue placeholder="QUICK TEMPLATES..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                            <SelectItem value="1">Fetch All Products (Top 50)</SelectItem>
                                            <SelectItem value="2">Invalid Catalog Versions</SelectItem>
                                            <SelectItem value="3">Locked User Accounts</SelectItem>
                                            <SelectItem value="4">Active Promotions Strategy</SelectItem>
                                        </SelectContent>
                                    </Select>
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
                                        disabled={!flexQuery || flexLoading}
                                        className="absolute bottom-6 right-8 h-10 px-8 bg-[#A78BFA] text-[#0F0F13] font-black text-xs gap-2 shadow-2xl shadow-[#A78BFA]/20"
                                    >
                                        <Play className="h-4 w-4 fill-current text-[#0F0F13]" /> EXECUTE QUERY
                                    </Button>
                                </div>
                                {flexLoading && (
                                    <div className="p-4 text-xs text-[#A78BFA]">Running query...</div>
                                )}
                                {flexResult && (
                                    flexResult.Error ? (
                                        <div className="p-4 text-red-400">{flexResult.Error}</div>
                                    ) : (
                                        <div className="flex-1 p-4 overflow-auto">
                                            <table className="w-full table-auto text-xs">
                                                <thead>
                                                    <tr className="bg-[#13131A]">
                                                        {flexResult.Headers.map((h, idx) => (
                                                            <th key={idx} className="px-2 py-1">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {flexResult.Rows.map((row, i) => (
                                                        <tr key={i} className="hover:bg-[#1A1A24]">
                                                            {row.map((c, j) => (
                                                                <td key={j} className="px-2 py-1">{c}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                )}
                                {!flexResult && !flexLoading && (
                                    <div className="flex-1 flex flex-col items-center justify-center text-[#6B7280] opacity-40">
                                        <TerminalSquare className="h-12 w-12 mb-4" strokeWidth={1} />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">No results yet</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'Catalog' && (
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
                                            <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Running Delta Queries...</span>
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
                                                            {catalogDiff.missingStagedToOnline?.map((code: string, i: number) => (
                                                                <span key={i} className="px-2 py-1 bg-[#1A1A24] border border-[#2A2A3A] rounded text-[10px] font-mono text-[#E2E8F0]">
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

                        {activeTab === 'Impex' && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center gap-4">
                                    <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest whitespace-nowrap">ImpEx Playground</span>
                                    <div className="flex-1" />
                                    <Select onValueChange={(val) => {
                                        const snippets: Record<string, string> = {
                                            "1": "INSERT_UPDATE Product;code[unique=true];name[lang=en];catalogVersion(catalog(id),version)\n;testProduct001;Test Product 001;testCatalog:Staged",
                                            "2": "INSERT_UPDATE Customer;uid[unique=true];name;password\n;test@example.com;Test User;12345678",
                                            "3": "REMOVE Product;code[unique=true]\n;testProduct001",
                                            "4": "INSERT_UPDATE StockLevel;productCode[unique=true];warehouse(code)[unique=true];available\n;testProduct001;default;100"
                                        };
                                        if (snippets[val]) setImpExScript(snippets[val]);
                                    }}>
                                        <SelectTrigger className="w-[200px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold text-[#6B7280] uppercase">
                                            <SelectValue placeholder="SNIPPET TEMPLATES..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                            <SelectItem value="1">Insert Product</SelectItem>
                                            <SelectItem value="2">Insert Customer</SelectItem>
                                            <SelectItem value="3">Remove Product</SelectItem>
                                            <SelectItem value="4">Update Stock Level</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            checked={impExEnableCode}
                                            onCheckedChange={val => setImpExEnableCode(!!val)}
                                            className="h-4 w-4 border-[#2A2A3A] data-[state=checked]:bg-[#A78BFA]"
                                        />
                                        <span className="text-[10px] text-[#6B7280]">Enable Code Exec</span>
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
                                        disabled={impExExecuting || !impExScript}
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                    >
                                        {impExExecuting ? 'IMPORTING...' : 'Import Script'}
                                    </Button>
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
                                <div className="h-32 bg-[#0A0A0E] border-t border-[#2A2A3A] p-4 custom-scrollbar overflow-y-auto">
                                    <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest mb-2 border-b border-[#2A2A3A]/30 pb-1">Console Log</div>
                                    <div className="font-mono text-[10px] text-[#A78BFA]/60 leading-relaxed">
                                        {impExResult || `Ready for ImpEx import...\nSession: Active (${selectedEnvId})`}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Ccv2' && (
                            <div className="flex-1 overflow-auto p-4 bg-[#0F0F13] space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        placeholder="Subscription Code"
                                        value={ccv2Sub}
                                        onChange={e => setCcv2Sub(e.target.value)}
                                        className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                    />
                                    <Input
                                        placeholder="API Token"
                                        value={ccv2Token}
                                        onChange={e => setCcv2Token(e.target.value)}
                                        className="h-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                    />
                                    <Button
                                        onClick={fetchCcv2Envs}
                                        disabled={!ccv2Sub || !ccv2Token}
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                    >
                                        Get Environments
                                    </Button>
                                </div>
                                {ccv2Envs.length > 0 && (
                                    <div className="mt-2 overflow-auto max-h-40 border border-[#2A2A3A]">
                                        <table className="w-full text-xs">
                                            <thead className="bg-[#13131A]"><tr>
                                                <th className="px-2 py-1">Code</th>
                                                <th className="px-2 py-1">Name</th>
                                                <th className="px-2 py-1">Status</th>
                                                <th className="px-2 py-1">DeployStatus</th>
                                            </tr></thead>
                                            <tbody>
                                                {ccv2Envs.map((env, i) => (
                                                    <tr
                                                        key={i}
                                                        className="hover:bg-[#1A1A24] cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedCcv2Env(env.code);
                                                            setCcv2Deployments([]);
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
                                            className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                        >
                                            Load Deployments
                                        </Button>
                                    </div>
                                )}
                                {ccv2Deployments.length > 0 && (
                                    <div className="mt-2 overflow-auto max-h-40 border border-[#2A2A3A] rounded-lg">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-[#13131A] text-[#6B7280] font-black tracking-widest uppercase"><tr>
                                                <th className="px-4 py-2">Code</th>
                                                <th className="px-4 py-2">Env</th>
                                                <th className="px-4 py-2">Build</th>
                                                <th className="px-4 py-2">Status</th>
                                                <th className="px-4 py-2">Strategy</th>
                                            </tr></thead>
                                            <tbody className="text-[#E2E8F0] font-medium font-mono">
                                                {ccv2Deployments.map((d, i) => (
                                                    <tr key={i} className="hover:bg-[#1A1A24] border-b border-[#2A2A3A] transition-colors">
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{d.code}</td>
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{d.environmentCode}</td>
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{d.buildCode}</td>
                                                        <td className="px-4 py-2 border-r border-[#2A2A3A]">{d.status}</td>
                                                        <td className="px-4 py-2">{d.strategy}</td>
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
                                        className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase"
                                    >
                                        Get Build
                                    </Button>
                                </div>
                                {ccv2BuildInfo && (
                                    <pre className="text-xs bg-[#13131A] p-2 rounded">{JSON.stringify(ccv2BuildInfo, null, 2)}</pre>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
