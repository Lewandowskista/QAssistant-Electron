import { useState, useEffect } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { ServerCog, Play, RefreshCw, TerminalSquare, CheckCircle2, Zap, Activity, ShieldQuestion, Globe, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
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

    const [activeTab, setActiveTab] = useState<SapTab>('Cronjobs')
    const [selectedEnvId, setSelectedEnvId] = useState<string>("")
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)

    // Sub-states
    const [cronFilter, setCronFilter] = useState("All")

    useEffect(() => {
        if (environments.length > 0 && !selectedEnvId) {
            const defaultEnv = environments.find(e => e.isDefault) || environments[0]
            setSelectedEnvId(defaultEnv.id)
        }
    }, [environments])

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60 bg-[#0F0F13]">
                <ShieldQuestion className="h-16 w-16 mb-4 text-[#6B7280]" />
                <h2 className="text-xl font-black uppercase tracking-widest text-[#E2E8F0]">No Project Selected</h2>
                <p className="text-xs font-bold text-[#6B7280] mt-2">Select a project to access SAP HAC features.</p>
            </div>
        )
    }

    const handleConnect = () => {
        setIsConnecting(true)
        setTimeout(() => {
            setIsConnected(true)
            setIsConnecting(false)
        }, 1200)
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
                                    <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase text-[#A78BFA] gap-2">
                                        <RefreshCw className="h-3 w-3" /> REFRESH COLLECTIONS
                                    </Button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] uppercase text-[#6B7280] font-black tracking-widest border-b border-[#2A2A3A] pb-2">
                                                <th className="pb-3 px-4">STATUS</th>
                                                <th className="pb-3 px-4">JOB IDENTIFIER</th>
                                                <th className="pb-3 px-4">START TIME</th>
                                                <th className="pb-3 px-4 text-right">STATUS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs">
                                            {[
                                                { code: 'full-solr-index-electronics', status: 'RUNNING', color: 'text-[#3B82F6]' },
                                                { code: 'sync-staged-to-online-products', status: 'SUCCESS', color: 'text-[#10B981]' },
                                                { code: 'b2b-order-fulfillment-job', status: 'FAILURE', color: 'text-[#EF4444]' },
                                                { code: 'abandoned-cart-cleanup', status: 'IDLE', color: 'text-[#6B7280]' },
                                            ].map((row, i) => (
                                                <tr key={i} className="border-b border-[#2A2A3A]/50 hover:bg-[#1A1A24]/50 transition-colors group cursor-pointer">
                                                    <td className="py-4 px-4 font-black">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("h-1.5 w-1.5 rounded-full", row.color.replace('text-', 'bg-'))} />
                                                            <span className={cn("text-[10px] tracking-widest font-black", row.color)}>{row.status}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 font-bold text-[#E2E8F0] font-mono group-hover:text-[#A78BFA]">{row.code}</td>
                                                    <td className="py-4 px-4 text-[#6B7280] font-medium">10:42 PM (12m ago)</td>
                                                    <td className="py-4 px-4 text-right">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280] hover:text-[#A78BFA]">
                                                            <Activity className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
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
                                    <Select>
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
                                        className="w-full h-full bg-transparent border-none text-[#A78BFA] font-mono text-sm resize-none focus:outline-none custom-scrollbar"
                                        placeholder="SELECT {p:pk}, {p:code} FROM {Product AS p} WHERE {p:approvalStatus} = 'approved'"
                                        spellCheck={false}
                                    />
                                    <Button className="absolute bottom-6 right-8 h-10 px-8 bg-[#A78BFA] text-[#0F0F13] font-black text-xs gap-2 shadow-2xl shadow-[#A78BFA]/20">
                                        <Play className="h-4 w-4 fill-current text-[#0F0F13]" /> EXECUTE QUERY
                                    </Button>
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center text-[#6B7280] opacity-40">
                                    <TerminalSquare className="h-12 w-12 mb-4" strokeWidth={1} />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">No results yet</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Catalog' && (
                            <div className="flex-1 flex flex-col items-center justify-center text-[#6B7280] opacity-20">
                                <Layers className="h-20 w-20 mb-6" strokeWidth={1} />
                                <h3 className="text-xl font-black uppercase tracking-widest">Catalog Delta Engine</h3>
                                <p className="text-xs font-bold mt-2">Comparing catalog versions...</p>
                            </div>
                        )}

                        {activeTab === 'Impex' && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center gap-4">
                                    <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest whitespace-nowrap">ImpEx Playground</span>
                                    <div className="flex-1" />
                                    <Button variant="ghost" className="h-8 border-[#2A2A3A] text-[10px] font-black text-[#A78BFA] uppercase hover:bg-[#A78BFA]/5 border">Validate Syntax</Button>
                                    <Button className="h-8 bg-[#A78BFA] text-[#0F0F13] font-black text-[10px] uppercase">Import Script</Button>
                                </div>
                                <div className="flex-1 bg-[#0F0F13] p-4">
                                    <textarea
                                        className="w-full h-full bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 text-[#E2E8F0] font-mono text-sm resize-none focus:outline-none selection:bg-[#A78BFA]/20"
                                        placeholder="# ImpEx Script&#10;INSERT_UPDATE Product;code[unique=true];name[lang=en]&#10;;test_p001;High Fidelity Component"
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="h-32 bg-[#0A0A0E] border-t border-[#2A2A3A] p-4 custom-scrollbar overflow-y-auto">
                                    <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest mb-2 border-b border-[#2A2A3A]/30 pb-1">Console Log</div>
                                    <div className="font-mono text-[10px] text-[#A78BFA]/60 leading-relaxed">
                                        Ready for ImpEx import...<br />
                                        Session: Active ({selectedEnvId})
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Ccv2' && (
                            <div className="flex-1 flex flex-col items-center justify-center text-[#6B7280]/30">
                                <Activity className="h-20 w-20 mb-6 animate-pulse" strokeWidth={1} />
                                <h3 className="text-xl font-black uppercase tracking-widest text-[#6B7280]">CCV2 DEPLOYMENT PIPELINE</h3>
                                <p className="text-xs font-bold mt-2 max-w-sm text-center leading-relaxed">Fetch live builds and cluster deployment status directly from the SAP Cloud Portal API.</p>
                                <Button className="mt-8 bg-[#1A1A24] border border-[#2A2A3A] text-[#6B7280] hover:bg-[#2A2A3A] font-black text-[10px] uppercase tracking-widest px-8 h-10">
                                    Authorize Cloud Portal Access
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
