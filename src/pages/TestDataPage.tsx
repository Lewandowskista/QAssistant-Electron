import { useState } from "react"
/* cspell:ignore IMPEX */
import { useProjectStore } from "@/store/useProjectStore"
import { DatabaseZap, Plus, Trash2, Search, TerminalSquare, Layers, ShieldCheck, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import FormattedText from "@/components/FormattedText"

type ViewState = 'Groups' | 'ImpEx'

export default function TestDataPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const [view, setView] = useState<ViewState>('Groups')
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

    // Mock data groups for parity
    const [groups] = useState([
        { id: '1', name: 'Standard Customers', category: 'Users', entries: 15 },
        { id: '2', name: 'Electronics Storefront Prods', category: 'Products', entries: 42 },
        { id: '3', name: 'Promotion Vouchers - EU', category: 'Promotions', entries: 8 }
    ])

    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    const selectedGroup = groups.find(g => g.id === selectedGroupId)

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <DatabaseZap className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to manage test data.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[280px] flex-none bg-[#13131A] border-r border-[#2A2A3A] flex flex-col">
                <div className="p-4 border-b border-[#2A2A3A] space-y-1">
                    <h3 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">{view === 'Groups' ? 'DATA GROUPS' : 'IMPEX TEMPLATES'}</h3>
                    {/* cspell:ignore IMPEX */}
                    <p className="text-[11px] text-[#6B7280] leading-tight">Reusable test data sets</p>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280]" />
                        <Input
                            placeholder="Search records..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[#0F0F13] border-[#2A2A3A] text-xs text-[#E2E8F0]"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {view === 'Groups' ? (
                        filteredGroups.map(group => (
                            <div
                                key={group.id}
                                onClick={() => setSelectedGroupId(group.id)}
                                className={cn(
                                    "p-3 rounded-xl border transition-all cursor-pointer group",
                                    selectedGroupId === group.id ? "bg-[#1A1A24] border-[#A78BFA]/40 shadow-lg shadow-[#A78BFA]/5" : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                                )}
                            >
                                <div className="text-xs font-bold text-[#E2E8F0] mb-1 truncate">
                                    <FormattedText content={group.name} />
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                    <span className="text-[#A78BFA]">{group.category}</span>
                                    <span className="text-[#6B7280]">{group.entries} RECORDS</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        ['Product Templates', 'Customer Bundles', 'Pricing Logic', 'Stock Levels'].map(t => (
                            <div key={t} className="p-3 rounded-xl border border-transparent hover:bg-[#1A1A24]/50 cursor-pointer text-xs font-bold text-[#A78BFA] uppercase tracking-widest">
                                {t}
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A] space-y-2">
                    <Button onClick={() => setView('Groups')} className={cn("w-full h-10 font-black text-xs gap-2", view === 'Groups' ? "bg-[#A78BFA] text-[#0F0F13]" : "bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20")}>
                        <Plus className="h-4 w-4" /> NEW DATA GROUP
                    </Button>
                    <Button onClick={() => setView('ImpEx')} className={cn("w-full h-10 font-black text-xs gap-2", view === 'ImpEx' ? "bg-[#A78BFA] text-[#0F0F13]" : "bg-[#1A1A2E] text-[#A78BFA] border border-[#A78BFA]/20")}>
                        SAP IMPEX TEMPLATES →
                    </Button>
                </div>
            </aside>

            {/* Main Panel */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {!selectedGroupId && view === 'Groups' ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center">
                            <DatabaseZap className="h-10 w-10 text-[#6B7280]" strokeWidth={1.5} />
                        </div>
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#E2E8F0]">Select Data Collection</p>
                            <p className="text-xs font-bold text-[#6B7280] mt-2">Store and replicate reusable test environments</p>
                        </div>
                    </div>
                ) : view === 'ImpEx' ? (
                    <div className="h-full flex flex-col p-8 space-y-8 animate-in slide-in-from-right-4 duration-500">
                        <header className="flex items-center justify-between border-b border-[#2A2A3A] pb-6">
                            <div>
                                <h2 className="text-2xl font-black text-[#A78BFA] uppercase tracking-tight">SAP Commerce ImpEx Templates</h2>
                                <p className="text-xs font-bold text-[#6B7280] mt-1 uppercase tracking-widest">Ready-made ImpEx snippets</p>
                            </div>
                            <Button onClick={() => setView('Groups')} variant="outline" className="h-9 border-[#2A2A3A] text-[#6B7280] font-black text-[10px] uppercase">← BACK TO GROUPS</Button>
                        </header>

                        <div className="grid grid-cols-2 gap-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="group p-6 bg-[#13131A] border border-[#2A2A3A] rounded-[2rem] hover:border-[#A78BFA]/50 transition-all cursor-pointer relative">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-[#1A1A24] flex items-center justify-center border border-[#2A2A3A]">
                                            <TerminalSquare className="h-5 w-5 text-[#A78BFA]" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-[#E2E8F0]">Batch Product Update</div>
                                            <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest">Catalog Version Delta</div>
                                        </div>
                                    </div>
                                    <pre className="text-[10px] font-mono text-[#6B7280] bg-[#0A0A0E] p-3 rounded-xl overflow-hidden truncate">
                                        INSERT_UPDATE Product;code[unique=true];approvalStatus(code)&#10;;test_p00{i};approved
                                    </pre>
                                    <Button className="mt-4 w-full h-8 bg-[#A78BFA]/10 text-[#A78BFA] hover:bg-[#A78BFA]/20 border border-[#A78BFA]/20 font-black text-[9px] uppercase tracking-widest">COPY SNIPPET</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col animate-in fade-in duration-500">
                        <header className="p-6 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                                <Input
                                    value={selectedGroup?.name}
                                    className="max-w-[300px] h-9 bg-transparent border-none text-2xl font-black text-[#E2E8F0] focus-visible:ring-0 px-0"
                                />
                                <div className="w-px h-6 bg-[#2A2A3A]" />
                                <Select value={selectedGroup?.category}>
                                    <SelectTrigger className="w-[140px] h-8 bg-[#1A1A24] border-[#2A2A3A] text-[10px] font-bold uppercase text-[#A78BFA]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                        <SelectItem value="Users">Users</SelectItem>
                                        <SelectItem value="Products">Products</SelectItem>
                                        <SelectItem value="Promotions">Promotions</SelectItem>
                                        <SelectItem value="Credentials">Credentials</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="icon" className="text-[#EF4444] hover:bg-[#EF4444]/10">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button className="h-9 px-6 bg-[#A78BFA] text-[#0F0F13] font-black text-xs">SAVE COLLECTION</Button>
                            </div>
                        </header>

                        <div className="p-4 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex gap-4">
                                <div className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Layers className="h-3 w-3 text-[#A78BFA]" /> DATA RECORDS
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="h-7 text-[#6B7280] text-[10px] font-black uppercase tracking-widest hover:text-[#E2E8F0]">COPY ALL</Button>
                                <Button size="sm" className="h-7 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 text-[10px] font-black uppercase tracking-widest">+ ADD ENTRY</Button>
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                                    <Input placeholder="Key" className="h-10 bg-[#1A1A24] border-[#2A2A3A] text-xs font-mono text-[#A78BFA] uppercase tracking-wider" defaultValue={`PARAM_${i}`} />
                                    <Input placeholder="Value" className="h-10 flex-1 bg-[#1A1A24] border-[#2A2A3A] text-xs font-mono text-[#E2E8F0]" defaultValue={`SECURE_TOKEN_00${i}`} />
                                    <Button variant="ghost" size="icon" className="h-10 w-10 text-[#6B7280] hover:text-[#EF4444] transition-colors">
                                        <Trash className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <footer className="p-4 bg-[#13131A] border-t border-[#2A2A3A] flex items-center gap-4">
                            <ShieldCheck className="h-4 w-4 text-[#10B981]" />
                            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Auto-saved • 5 records archived</span>
                        </footer>
                    </div>
                )}
            </main>
        </div>
    )
}
