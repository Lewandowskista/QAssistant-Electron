import { useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { Globe, Plus, Trash2, ExternalLink, Search, Globe2, Compass, Shield, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export default function LinksPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const links = activeProject?.links || []
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)

    const filtered = links.filter(l =>
        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.url.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const selectedLink = links.find(l => l.id === selectedLinkId)

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <Globe className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to manage links.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex animate-in fade-in duration-500 bg-[#0F0F13] overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[300px] flex-none bg-[#13131A] border-r border-[#2A2A3A] flex flex-col">
                <div className="p-4 border-b border-[#2A2A3A] space-y-1">
                    <h3 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.2em]">LINKS</h3>
                    <p className="text-[11px] text-[#6B7280] leading-tight">Portals, Documentation, Admin Consoles</p>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280]" />
                        <Input
                            placeholder="Filter registry..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 bg-[#0F0F13] border-[#2A2A3A] text-xs text-[#E2E8F0]"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filtered.map(link => (
                        <div
                            key={link.id}
                            onClick={() => setSelectedLinkId(link.id)}
                            className={cn(
                                "p-3 rounded-xl border transition-all cursor-pointer group flex items-center gap-3",
                                selectedLinkId === link.id ? "bg-[#1A1A24] border-[#A78BFA]/40 shadow-lg shadow-[#A78BFA]/5" : "bg-transparent border-transparent hover:bg-[#1A1A24]/50"
                            )}
                        >
                            <div className="w-8 h-8 rounded-lg bg-[#1A1A24] flex items-center justify-center border border-[#2A2A3A]">
                                <Globe2 className="h-4 w-4 text-[#A78BFA]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-[#E2E8F0] truncate">{link.title}</div>
                                <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest truncate">{link.url}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 bg-[#0F0F13] border-t border-[#2A2A3A] space-y-2">
                    <Button className="w-full h-10 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-black text-xs gap-2">
                        <Plus className="h-4 w-4" /> REGISTER NEW LINK
                    </Button>
                </div>
            </aside>

            {/* Main Preview Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#0F0F13]">
                {!selectedLink ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                        <div className="w-24 h-24 rounded-3xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center">
                            <Compass className="h-10 w-10 text-[#6B7280]" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-[#E2E8F0]">Select terminal endpoint</p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col animate-in slide-in-from-right-4 duration-500">
                        <header className="p-6 bg-[#13131A] border-b border-[#2A2A3A] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-[#A78BFA]/10 flex items-center justify-center border border-[#A78BFA]/20">
                                    <Globe className="h-6 w-6 text-[#A78BFA]" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-[#E2E8F0] uppercase tracking-tight">{selectedLink.title}</h2>
                                    <p className="text-xs font-semibold text-[#6B7280] flex items-center gap-2 mt-1">
                                        <Shield className="h-3 w-3 text-[#10B981]" /> SECURE CONNECTION • {selectedLink.url}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="icon" className="text-[#EF4444] hover:bg-[#EF4444]/10">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button onClick={() => (window as any).electronAPI.openUrl(selectedLink.url)} className="h-10 px-8 bg-[#A78BFA] text-[#0F0F13] font-black text-xs gap-2 shadow-2xl shadow-[#A78BFA]/20">
                                    <Zap className="h-4 w-4 fill-current" /> LAUNCH PORTAL
                                </Button>
                            </div>
                        </header>

                        <div className="flex-1 p-8">
                            <div className="h-full rounded-[2.5rem] border border-[#2A2A3A] bg-[#13131A] flex flex-col items-center justify-center text-center p-12 overflow-hidden relative group">
                                <div className="absolute inset-0 bg-gradient-to-br from-[#A78BFA]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                <div className="max-w-md space-y-6 relative">
                                    <div className="flex justify-center">
                                        <div className="p-6 rounded-full bg-[#1A1A24] border border-[#2A2A3A] group-hover:scale-110 transition-transform duration-700">
                                            <ExternalLink className="h-12 w-12 text-[#A78BFA]/20" strokeWidth={1} />
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-black text-[#E2E8F0] tracking-widest uppercase">Safe Browser Bridge</h3>
                                    <p className="text-sm text-[#6B7280] font-medium leading-relaxed">
                                        This link will open in an external browser. Session persistence is handled by your system browser.
                                    </p>
                                    <div className="pt-4 grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-[#1A1A24] border border-[#2A2A3A] rounded-2xl text-left">
                                            <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest mb-1">Last Access</div>
                                            <div className="text-xs font-bold text-[#E2E8F0]">Today, 14:02</div>
                                        </div>
                                        <div className="p-4 bg-[#1A1A24] border border-[#2A2A3A] rounded-2xl text-left">
                                            <div className="text-[9px] font-black text-[#6B7280] uppercase tracking-widest mb-1">Security Rank</div>
                                            <div className="text-xs font-bold text-[#10B981]">Class A (TRUSTED)</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
