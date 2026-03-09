import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { LayoutDashboard, CheckSquare, Settings, Plus, Globe, FileText, FlaskConical, Database, ListChecks, Code, ServerCog, Search, Minus, Square, X, MoreVertical, Edit2, Trash2, ChevronLeft, ChevronRight, Copy, BookOpen, Pin } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { useProjectStore, Project } from "@/store/useProjectStore"
import { ProjectDialog } from "@/components/ProjectDialog"
import CommandPalette from "@/components/CommandPalette"
import SettingsPage from "@/pages/SettingsPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function MainLayout() {
    const location = useLocation()
    const navigate = useNavigate()
    
    // Use fine-grained selectors to prevent unnecessary re-renders
    const projects = useProjectStore(state => state.projects)
    const activeProjectId = useProjectStore(state => state.activeProjectId)
    const loadProjects = useProjectStore(state => state.loadProjects)
    const setActiveProject = useProjectStore(state => state.setActiveProject)
    const deleteProject = useProjectStore(state => state.deleteProject)
    
    const activeProject = projects.find(p => p.id === activeProjectId)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingProject, setEditingProject] = useState<Project | undefined>(undefined)
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isPinned, setIsPinned] = useState(false)
    const [isMaximized, setIsMaximized] = useState(false)
    const [toolsCollapsed, setToolsCollapsed] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [isSapActive, setIsSapActive] = useState(false)

    const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0

    // Routes that use h-full flex layouts and need the full content area (no padding/max-width)
    const FULL_BLEED_ROUTES = ['/notes', '/files', '/tasks', '/tests', '/test-data', '/checklists', '/environments', '/api', '/sap', '/runbooks']
    const isFullBleedRoute = FULL_BLEED_ROUTES.some(r => location.pathname.startsWith(r))

    useEffect(() => {
        loadProjects()
        const api = window.electronAPI as any;
        if (api) {

            const removePaletteListener = api.onCommandPalette?.(() => setPaletteOpen(prev => !prev))
            const removeTaskListener = api.onAddTask?.(() => {
                if (projects.length > 0 && !activeProjectId) setActiveProject(projects[0].id)
                navigate('/tasks')
            })
            const removeMaxListener = api.onMaximizedStatus?.((status: boolean) => setIsMaximized(status))
            const removeSettingsListener = api.onOpenSettings?.(() => setSettingsOpen(true))

            const handleOpenDialog = () => {
                setEditingProject(undefined)
                setDialogOpen(true)
            }
            window.addEventListener('open-project-dialog', handleOpenDialog)

            api.getSystemInfo().then(() => {
                // platform state removed
            })

            const refreshSettings = async () => {
                const settings = await api.readSettingsFile()
                if (settings?.alwaysOnTop !== undefined) setIsPinned(settings.alwaysOnTop)
                setIsSapActive(!!settings?.sapCommerceContext)
            }

            window.addEventListener('settings-updated', refreshSettings)
            refreshSettings()

            return () => {
                removePaletteListener?.()
                removeTaskListener?.()
                removeMaxListener?.()
                removeSettingsListener?.()
                window.removeEventListener('open-project-dialog', handleOpenDialog)
                window.removeEventListener('settings-updated', refreshSettings)
            }
        }
    }, [loadProjects, projects.length, activeProjectId, setActiveProject, navigate])

    const handlePinToggle = async () => {
        const next = !isPinned
        setIsPinned(next)
        window.electronAPI?.setAlwaysOnTop(next)

        // Persist to settings
        const api = window.electronAPI as any
        if (api) {
            const settings = await api.readSettingsFile()
            await api.writeSettingsFile({ ...settings, alwaysOnTop: next })
            window.dispatchEvent(new Event('settings-updated'))
        }
    }

    const navGroups = [
        { items: [{ name: "Dashboard", href: "/", icon: LayoutDashboard }] },
        {
            title: "ORGANIZATION",
            items: [
                { name: "Notes", href: "/notes", icon: FileText },
                { name: "Files", href: "/files", icon: FileText }, // Should probably be Files/Images
            ]
        },
        {
            title: "QA BASIC",
            items: [
                { name: "Tasks", href: "/tasks", icon: CheckSquare },
                { name: "Tests", href: "/tests", icon: FlaskConical },
                { name: "Test Data", href: "/test-data", icon: Database },
                { name: "Checklists", href: "/checklists", icon: ListChecks },
            ]
        },
        {
            title: "QA ADVANCED",
            items: [
                { name: "Environments", href: "/environments", icon: Globe },
                { name: "API", href: "/api", icon: Code },
                { name: "Runbooks", href: "/runbooks", icon: BookOpen },
                { name: "SAP HAC", href: "/sap", icon: ServerCog },
            ]
        }
    ]

    return (
        <div className={cn(
            "flex text-[#E2E8F0] h-screen overflow-hidden selection:bg-primary/30",
            isMac ? "bg-[#0F0F13]/80 backdrop-blur-xl" : "bg-[#0F0F13]"
        )}>
            {/* 1. PROJECTS SIDEBAR (200px) */}
            <aside className={cn(
                "w-[200px] flex flex-col border-r border-[#2A2A3A] shrink-0",
                isMac ? "bg-[#13131A]/50 backdrop-blur-md" : "bg-[#13131A]"
            )}>
                <div className="h-11 flex items-center px-4 border-b border-[#2A2A3A] text-[9px] font-black tracking-[0.2em] text-[#6B7280] uppercase">
                    Projects
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {projects.map((project) => (
                        <div key={project.id} className="group relative">
                            <button
                                onClick={() => setActiveProject(project.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 rounded-md px-3 py-2 text-xs font-semibold transition-all text-left",
                                    activeProjectId === project.id
                                        ? "bg-[#2D2D3F] text-[#E2E8F0]"
                                        : "text-[#6B7280] hover:bg-[#252535] hover:text-[#E2E8F0]"
                                )}
                            >
                                <div className={cn("w-1 h-7 rounded-[2px] shrink-0", project.color)} />
                                <div className="flex flex-col min-w-0">
                                    <span className="truncate">{project.name}</span>
                                </div>
                            </button>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="p-1 rounded hover:bg-[#3D3D5F] text-[#6B7280]"><MoreVertical className="h-3 w-3" /></button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-32 bg-[#1A1A24] border-[#2A2A3A] text-white">
                                        <DropdownMenuItem onClick={() => { setEditingProject(project); setDialogOpen(true); }}>
                                            <Edit2 className="mr-2 h-3 w-3" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-red-400" onClick={() => deleteProject(project.id)}>
                                            <Trash2 className="mr-2 h-3 w-3" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-2 border-t border-[#2A2A3A]">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 h-10 text-[#A78BFA] hover:bg-[#252535] hover:text-[#A78BFA] font-bold text-xs"
                        onClick={() => { setEditingProject(undefined); setDialogOpen(true); }}
                    >
                        <Plus className="h-4 w-4" />
                        New Project
                    </Button>
                </div>
            </aside>

            {/* 2. TOOLS SIDEBAR (200px or Collapsed) */}
            <aside
                className={cn(
                    "flex flex-col border-r border-[#2A2A3A] transition-all duration-300 shrink-0",
                    isMac ? "bg-[#13131A]/50 backdrop-blur-md" : "bg-[#13131A]",
                    toolsCollapsed ? "w-0 overflow-hidden opacity-0" : "w-[200px]"
                )}
            >
                <div className="h-11 flex items-center justify-between px-4 border-b border-[#2A2A3A]">
                    <span className="text-[9px] font-black tracking-[0.2em] text-[#6B7280] uppercase">Tools</span>
                    <button onClick={() => setToolsCollapsed(true)} className="p-1.5 hover:bg-[#252535] rounded-md text-[#6B7280] transition-colors">
                        <ChevronLeft className="h-3 w-3" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
                    <div className="px-1">
                        <div className="relative group">
                            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#6B7280] opacity-50 group-focus-within:text-[#A78BFA] transition-colors pointer-events-none" />
                            <Input
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="h-9 pl-9 bg-background/30 border-[#2A2A3A] text-xs focus-visible:ring-1 focus-visible:ring-[#A78BFA]/30"
                            />
                        </div>
                    </div>

                    {navGroups.map((group, idx) => {
                        const filteredItems = group.items.filter(item =>
                            item.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        if (filteredItems.length === 0) return null

                        return (
                            <div key={idx} className="space-y-1">
                                {group.title && <div className="px-3 py-1 text-[9px] font-black text-[#6B7280]/60 tracking-[0.2em] uppercase">{group.title}</div>}
                                {filteredItems.map(item => {
                                    const isActive = location.pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            to={item.href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold transition-all",
                                                isActive ? "bg-[#3D3D5F] text-[#A78BFA] shadow-lg shadow-black/20" : "text-[#6B7280] hover:bg-[#252535] hover:text-[#E2E8F0]"
                                            )}
                                        >
                                            <item.icon className="h-4 w-4" />
                                            {item.name}
                                        </Link>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </aside>

            {/* 3. MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0F0F13] relative">
                {/* TITLEBAR */}
                <header className={cn(
                    "h-12 border-b border-[#2A2A3A] bg-[#13131A]/80 backdrop-blur-md flex items-center justify-between px-4 app-region-drag shrink-0 relative z-50 shadow-sm",
                    isMac && "pl-20" // Leave room for traffic lights
                )}>
                    <div className="flex items-center gap-4">
                        {toolsCollapsed && (
                            <button onClick={() => setToolsCollapsed(false)} className="app-region-no-drag p-1.5 hover:bg-[#252535] rounded-md text-[#6B7280]">
                                <ChevronRight className="h-3 w-3" />
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 bg-[#A78BFA] rounded flex items-center justify-center">
                                <FlaskConical className="h-3 w-3 text-[#0F0F13] stroke-[3]" />
                            </div>
                            <span className="text-xs font-bold tracking-tight text-[#A78BFA]">QAssistant</span>
                        </div>
                        <div className="w-px h-4 bg-[#2A2A3A] mx-2" />
                        <span className="text-xs font-medium text-[#6B7280] truncate max-w-[300px]">
                            {activeProject?.name || "QAssistant"}
                        </span>
                    </div>

                    <div className="flex items-center gap-0 app-region-no-drag">
                        {isSapActive && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#A78BFA]/10 border border-[#A78BFA]/20 rounded-full mr-2 group cursor-help transition-all hover:bg-[#A78BFA]/20" title="SAP Commerce Context is active and injected into AI analysis">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
                                <span className="text-[10px] font-black text-[#A78BFA] tracking-tighter uppercase">SAP ACTIVE</span>
                            </div>
                        )}
                        <button onClick={() => setSettingsOpen(true)} className="w-10 h-10 flex items-center justify-center hover:bg-[#252535] group transition-colors">
                            <Settings className="h-4 w-4 text-[#6B7280] group-hover:text-[#A78BFA]" />
                        </button>
                        <button
                            onClick={handlePinToggle}
                            className={cn(
                                "w-10 h-10 flex items-center justify-center hover:bg-[#252535] group transition-colors relative",
                                isPinned ? "text-[#A78BFA]" : "text-[#6B7280]"
                            )}
                            title={isPinned ? "Unpin Window" : "Pin Window"}
                        >
                            <Pin className={cn("h-4 w-4 transition-transform", isPinned ? "fill-current rotate-45" : "group-hover:text-[#A78BFA]")} />
                        </button>

                        {!isMac && (
                            <>
                                <button onClick={() => window.electronAPI?.minimize()} className="w-10 h-10 flex items-center justify-center hover:bg-[#252535]">
                                    <Minus className="h-4 w-4 text-[#A78BFA]" />
                                </button>
                                <button onClick={() => window.electronAPI?.maximize()} className="w-10 h-10 flex items-center justify-center hover:bg-[#252535]">
                                    {isMaximized ? <Copy className="h-3.5 w-3.5 text-[#A78BFA] rotate-180" /> : <Square className="h-3.5 w-3.5 text-[#A78BFA]" />}
                                </button>
                                <button onClick={() => window.electronAPI?.close()} className="w-11 h-10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <main className={cn(
                    "flex-1 min-h-0 relative",
                    isFullBleedRoute
                        ? "flex flex-col overflow-hidden"
                        : "overflow-y-auto p-6 scroll-smooth custom-scrollbar"
                )}>
                    {isFullBleedRoute ? (
                        <Outlet />
                    ) : (
                        <div className="max-w-[1600px] mx-auto">
                            <Outlet />
                        </div>
                    )}
                </main>

                {/* SETTINGS OVERLAY (DRAWER) */}
                <div
                    className={cn(
                        "fixed inset-0 z-[100] transition-opacity duration-300",
                        settingsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
                    <div className={cn(
                        "absolute top-0 right-0 h-full w-[680px] bg-[#0F0F13] border-l border-[#2A2A3A] shadow-2xl transition-transform duration-300 ease-out flex flex-col",
                        settingsOpen ? "translate-x-0" : "translate-x-full"
                    )}>
                        <button onClick={() => setSettingsOpen(false)} className="absolute top-3 right-3 z-10 p-2 hover:bg-[#252535] rounded-md transition-colors">
                            <X className="h-4 w-4 text-[#6B7280]" />
                        </button>
                        <div className="flex-1 overflow-hidden">
                            {settingsOpen && <SettingsPage />}
                        </div>
                    </div>
                </div>

                {/* MODALS */}
                <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editingProject} />
                <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
            </div>
        </div>
    )
}
