import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { LayoutDashboard, CheckSquare, Settings, Plus, Globe, FileText, FlaskConical, Database, ListChecks, Code, ServerCog, Search, Minus, Square, X, MoreVertical, Edit2, Trash2, ChevronLeft, ChevronRight, Copy, BookOpen, Pin, Sparkles, ChevronDown, User, GitBranch, MessageSquare, Rocket, BarChart3, ClipboardCheck, Activity, Compass, Loader2 } from "lucide-react"
import AiCopilot from "@/components/AiCopilot"
import { cn } from "@/lib/utils"
import { useEffect, useMemo, useState } from "react"
import { useProjectStore, Project } from "@/store/useProjectStore"
import { useUserStore } from "@/store/useUserStore"
import { useSettingsStore } from "@/store/useSettingsStore"
import { ProjectDialog } from "@/components/ProjectDialog"
import CommandPalette from "@/components/CommandPalette"
import { lazy, Suspense } from "react"
const SettingsPage = lazy(() => import("@/pages/SettingsPage"))
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Toaster } from "sonner"
import { SideDrawerHeader } from "@/components/ui/side-drawer-header"
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator"
import { useConfirm } from "@/components/ConfirmDialog"

const EMPTY_ENVIRONMENTS: Project["environments"] = []

export default function MainLayout() {
    const location = useLocation()
    const navigate = useNavigate()
    
    // Use fine-grained selectors to prevent unnecessary re-renders
    // Only subscribe to the fields the sidebar actually needs — task/note/test mutations
    // won't re-render MainLayout since they don't affect id/name/color/environments.
    const projects = useProjectStore(state => state.projects)
    const activeProjectId = useProjectStore(state => state.activeProjectId)
    const loadProjects = useProjectStore(state => state.loadProjects)
    const setActiveProject = useProjectStore(state => state.setActiveProject)
    const deleteProject = useProjectStore(state => state.deleteProject)
    const setEnvironmentDefault = useProjectStore(state => state.setEnvironmentDefault)
    const seedDemoProject = useProjectStore(state => state.seedDemoProject)

    const projectSummaries = useMemo(
        () => projects.map(project => ({ id: project.id, name: project.name, color: project.color })),
        [projects]
    )
    const activeProject = useMemo(
        () => projects.find(project => project.id === activeProjectId) ?? null,
        [projects, activeProjectId]
    )
    const environments = activeProject?.environments ?? EMPTY_ENVIRONMENTS
    const defaultEnv = useMemo(
        () => environments.find(environment => environment.isDefault) ?? environments[0],
        [environments]
    )

    const { profile: userProfile, isLoaded: userLoaded, loadProfile } = useUserStore()
    const activeRole = userProfile?.activeRole ?? 'qa'
    const connectedIdentity = userProfile?.identities?.[0] ?? null

    const loadSettings = useSettingsStore(s => s.load)
    const saveSettings = useSettingsStore(s => s.save)
    const currentTheme = useSettingsStore(s => s.settings.theme)
    const isPinnedStore = useSettingsStore(s => s.settings.alwaysOnTop)
    const isSapActive = useSettingsStore(s => s.settings.sapCommerceContext)
    const reduceVisualEffects = useSettingsStore(s => s.settings.reduceVisualEffects ?? false)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingProject, setEditingProject] = useState<Project | undefined>(undefined)
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isPinned, setIsPinned] = useState(isPinnedStore)
    const [copilotOpen, setCopilotOpen] = useState(false)
    const [isMaximized, setIsMaximized] = useState(false)
    const [toolsCollapsed, setToolsCollapsed] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const { confirm: confirmDelete, dialog: confirmDeleteDialog } = useConfirm()
    const [isMac, setIsMac] = useState(() => navigator.userAgent.toUpperCase().indexOf('MAC') >= 0)

    // Routes that use h-full flex layouts and need the full content area (no padding/max-width)
    const FULL_BLEED_ROUTES = ['/notes', '/files', '/tasks', '/tests', '/exploratory', '/test-data', '/checklists', '/environments', '/api', '/sap', '/runbooks', '/github', '/code-reviews', '/deployments', '/activity', '/reports', '/docs']
    const isFullBleedRoute = FULL_BLEED_ROUTES.some(r => location.pathname.startsWith(r))

    useEffect(() => {
        loadProjects()
        if (!userLoaded) loadProfile()
        loadSettings()
        const api = window.electronAPI
        if (api) {
            const removePaletteListener = api.onCommandPalette?.(() => setPaletteOpen(prev => !prev))
            const removeTaskListener = api.onAddTask?.(() => {
                const { projects: ps, activeProjectId: aid } = useProjectStore.getState()
                if (ps.length > 0 && !aid) setActiveProject(ps[0].id)
                navigate('/tasks')
            })
            const removeMaxListener = api.onMaximizedStatus?.((status: boolean) => setIsMaximized(status))
            const removeSettingsListener = api.onOpenSettings?.(() => setSettingsOpen(true))

            // If DB init was deferred past first render, retry loadProjects once IPC is ready
            const removeIpcReadyListener = api.onIpcReady?.(() => {
                const { projects: ps } = useProjectStore.getState()
                if (ps.length === 0) loadProjects()
            })

            const handleOpenDialog = () => {
                setEditingProject(undefined)
                setDialogOpen(true)
            }
            window.addEventListener('open-project-dialog', handleOpenDialog)

            api.getSystemInfo().then((info) => {
                setIsMac(info.platform === 'darwin')
            })

            return () => {
                removePaletteListener?.()
                removeTaskListener?.()
                removeMaxListener?.()
                removeSettingsListener?.()
                removeIpcReadyListener?.()
                window.removeEventListener('open-project-dialog', handleOpenDialog)
            }
        }
    }, [loadProjects, setActiveProject, navigate])

    // Close settings drawer when navigating away
    useEffect(() => { setSettingsOpen(false) }, [location.pathname])

    const handlePinToggle = async () => {
        const next = !isPinned
        setIsPinned(next)
        window.electronAPI?.setAlwaysOnTop(next)
        await saveSettings({ alwaysOnTop: next })
    }

    // Global keyboard shortcuts: Ctrl+K palette, Ctrl+N add task, Ctrl+, settings, F1 docs, Ctrl+1-5 nav
    useEffect(() => {
        const NAV_SHORTCUTS: Record<string, string> = {
            '1': '/',
            '2': '/tasks',
            '3': '/tests',
            '4': '/environments',
            '5': '/notes',
        }
        const handleGlobalKey = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input/textarea/contenteditable
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
            const isCtrl = e.ctrlKey || e.metaKey
            if (isCtrl && e.key === 'k') {
                e.preventDefault()
                setPaletteOpen(prev => !prev)
            } else if (isCtrl && e.key === 'n') {
                e.preventDefault()
                const { projects: ps, activeProjectId: aid } = useProjectStore.getState()
                if (ps.length > 0 && !aid) setActiveProject(ps[0].id)
                navigate('/tasks')
            } else if (isCtrl && e.key === ',') {
                e.preventDefault()
                setSettingsOpen(true)
            } else if (e.key === 'F1') {
                e.preventDefault()
                navigate('/docs')
            } else if (isCtrl && NAV_SHORTCUTS[e.key]) {
                e.preventDefault()
                navigate(NAV_SHORTCUTS[e.key])
            }
        }
        window.addEventListener('keydown', handleGlobalKey)
        return () => window.removeEventListener('keydown', handleGlobalKey)
    }, [navigate])

    const activeNavItem = (() => {
        const allItems = [
            { name: "Dashboard", href: "/", icon: LayoutDashboard },
            { name: "Notes", href: "/notes", icon: FileText },
            { name: "Files", href: "/files", icon: FileText },
            { name: "Tasks", href: "/tasks", icon: CheckSquare },
            { name: "Code Reviews", href: "/code-reviews", icon: MessageSquare },
            { name: "Tests", href: "/tests", icon: FlaskConical },
            { name: "Exploratory", href: "/exploratory", icon: Compass },
            { name: "Test Data", href: "/test-data", icon: Database },
            { name: "Checklists", href: "/checklists", icon: ListChecks },
            { name: "GitHub", href: "/github", icon: GitBranch },
            { name: "Environments", href: "/environments", icon: Globe },
            { name: "Release Queue", href: "/release-queue", icon: ClipboardCheck },
            { name: "Activity Feed", href: "/activity", icon: Activity },
            { name: "API", href: "/api", icon: Code },
            { name: "Runbooks", href: "/runbooks", icon: BookOpen },
            { name: "Reports", href: "/reports", icon: BarChart3 },
            { name: "Deployments", href: "/deployments", icon: Rocket },
            { name: "SAP HAC", href: "/sap", icon: ServerCog },
        ]
        return allItems.find(item =>
            item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)
        )
    })()

    const navGroups = [
        { items: [{ name: "Dashboard", href: "/", icon: LayoutDashboard }] },
        {
            title: "ORGANIZATION",
            items: [
                { name: "Notes", href: "/notes", icon: FileText },
                { name: "Files", href: "/files", icon: FileText },
            ]
        },
        {
            title: activeRole === 'dev' ? "DEVELOPMENT" : "QA BASIC",
            items: [
                { name: "Tasks", href: "/tasks", icon: CheckSquare },
                ...(activeRole === 'dev' ? [
                    { name: "Code Reviews", href: "/code-reviews", icon: MessageSquare },
                ] : [
                    { name: "Tests", href: "/tests", icon: FlaskConical },
                    { name: "Exploratory", href: "/exploratory", icon: Compass },
                    { name: "Test Data", href: "/test-data", icon: Database },
                    { name: "Checklists", href: "/checklists", icon: ListChecks },
                ]),
            ]
        },
        {
            title: activeRole === 'dev' ? "DEV TOOLS" : "QA ADVANCED",
            items: [
                { name: "Release Queue", href: "/release-queue", icon: ClipboardCheck },
                { name: "Activity Feed", href: "/activity", icon: Activity },
                { name: "Environments", href: "/environments", icon: Globe },
                { name: "GitHub", href: "/github", icon: GitBranch },
                { name: "API", href: "/api", icon: Code },
                { name: "Runbooks", href: "/runbooks", icon: BookOpen },
                ...(activeRole === 'qa' ? [
                    { name: "Reports", href: "/reports", icon: BarChart3 },
                ] : []),
                ...(activeRole === 'dev' ? [
                    { name: "Deployments", href: "/deployments", icon: Rocket },
                ] : [
                    { name: "SAP HAC", href: "/sap", icon: ServerCog },
                ]),
            ]
        }
    ]

    if (!userLoaded) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>Loading your workspace…</span>
                </div>
            </div>
        )
    }

    return (
        <>
        <div className={cn(
            "app-shell flex selection:bg-primary/20",
            isMac && !reduceVisualEffects && "backdrop-blur-xl"
        )}>
            {/* 1. PROJECTS SIDEBAR (200px) */}
            <aside
                aria-label="Projects"
                className={cn(
                "app-sidebar w-[220px] shrink-0",
                isMac && !reduceVisualEffects && "pt-8 backdrop-blur-md"
            )}>
                <div className="h-12 flex items-center px-4 border-b app-divider app-section-label">
                    Projects
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                    {projectSummaries.map((project) => (
                        <div key={project.id} className="group relative">
                            <button
                                onClick={() => setActiveProject(project.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium transition-all text-left",
                                    activeProjectId === project.id
                                        ? "bg-[linear-gradient(180deg,hsl(var(--surface-selected)/0.75),hsl(var(--surface-card)/0.95))] border-ui-strong text-foreground shadow-sm"
                                        : "border-transparent text-soft hover:bg-panel-muted hover:text-foreground"
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
                                        <button className="rounded-lg p-1.5 hover:bg-panel text-muted-ui hover:text-foreground"><MoreVertical className="h-3 w-3" /></button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-36">
                                        <DropdownMenuItem onClick={() => { setEditingProject(useProjectStore.getState().projects.find(p => p.id === project.id)); setDialogOpen(true); }}>
                                            <Edit2 className="mr-2 h-3 w-3" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-red-400" onClick={async () => {
                                            const ok = await confirmDelete(`Delete "${project.name}"?`, { description: 'All tasks, tests, notes, and handoffs will be permanently deleted. This cannot be undone.', confirmLabel: 'Delete Project', destructive: true })
                                            if (ok) deleteProject(project.id)
                                        }}>
                                            <Trash2 className="mr-2 h-3 w-3" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-3 border-t app-divider space-y-2">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 h-10 rounded-xl text-sm text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={() => { setEditingProject(undefined); setDialogOpen(true); }}
                    >
                        <Plus className="h-4 w-4" />
                        New Project
                    </Button>
                    {projectSummaries.length === 0 && (
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-3 h-10 rounded-xl text-sm text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                            onClick={() => seedDemoProject()}
                        >
                            <ClipboardCheck className="h-4 w-4" />
                            Load Demo
                        </Button>
                    )}
                </div>
            </aside>

            {/* 2. TOOLS SIDEBAR (200px or Collapsed) */}
            <aside
                aria-label="Navigation"
                className={cn(
                    "app-sidebar transition-all duration-300 shrink-0",
                    isMac && !reduceVisualEffects && "pt-8 backdrop-blur-md",
                    toolsCollapsed ? "w-0 overflow-hidden opacity-0" : "w-[220px]"
                )}
            >
                <div className="h-12 flex items-center justify-between px-4 border-b app-divider">
                    <span className="app-section-label">Workspace</span>
                    <button onClick={() => setToolsCollapsed(true)} aria-label="Collapse sidebar" className="rounded-lg p-1.5 text-muted-ui transition-colors hover:bg-panel-muted hover:text-foreground">
                        <ChevronLeft className="h-3 w-3" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    <div>
                        <div className="relative group">
                            <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-ui opacity-70 group-focus-within:text-primary transition-colors pointer-events-none" />
                            <Input
                                placeholder="Search tools"
                                aria-label="Search navigation"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="h-10 pl-9 text-sm"
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
                                {group.title && <div className="px-3 py-1 app-section-label opacity-70">{group.title}</div>}
                                {filteredItems.map(item => {
                                    const isActive = location.pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            to={item.href}
                                            data-active={isActive}
                                            className="app-nav-item"
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

                {/* Cloud sync status */}
                <div className="px-2 pb-1">
                    <SyncStatusIndicator />
                </div>

                {/* User identity badge */}
                <div className="p-3 border-t app-divider">
                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="app-panel-muted app-panel-hover w-full flex items-center gap-3 px-3 py-3 transition-colors group"
                        title="Account & Identity"
                    >
                        {connectedIdentity?.avatarUrl ? (
                            <img src={connectedIdentity.avatarUrl} className="w-6 h-6 rounded-full shrink-0" alt="avatar" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-panel flex items-center justify-center shrink-0 border border-ui">
                                <User className="h-3.5 w-3.5 text-muted-ui" />
                            </div>
                        )}
                        <div className="flex flex-col min-w-0 text-left">
                            <span className="text-sm font-medium text-soft group-hover:text-foreground truncate transition-colors">
                                {connectedIdentity?.username ?? 'No account'}
                            </span>
                            <span className="app-section-label opacity-80">
                                {activeRole === 'dev' ? 'Developer' : 'QA Engineer'}
                            </span>
                        </div>
                    </button>
                </div>
            </aside>

            {/* 3. MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
                {/* TITLEBAR */}
                <header className={cn(
                    "app-titlebar h-14 flex items-center justify-between px-4 app-region-drag shrink-0 relative z-50",
                    isMac && "pl-20" // Leave room for traffic lights
                )}>
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        {toolsCollapsed && (
                            <button
                                onClick={() => setToolsCollapsed(false)}
                                aria-label="Expand sidebar"
                                className="app-region-no-drag flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel-muted text-muted-ui hover:text-foreground shrink-0 transition-colors"
                            >
                                <ChevronRight className="h-3 w-3" />
                                {activeNavItem && (
                                    <>
                                        <activeNavItem.icon className="h-3.5 w-3.5 text-primary" />
                                        <span className="text-xs font-semibold text-foreground">{activeNavItem.name}</span>
                                    </>
                                )}
                            </button>
                        )}
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="w-8 h-8 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center">
                                <FlaskConical className="h-4 w-4 text-primary stroke-[2.4]" />
                            </div>
                            <span className="text-sm font-semibold tracking-tight text-foreground">QAssistant</span>
                        </div>
                        <div className="w-px h-5 bg-border mx-1 shrink-0" />
                        <span className="text-sm font-medium text-muted-ui truncate min-w-0">
                            {projectSummaries.find(p => p.id === activeProjectId)?.name || "QAssistant"}
                        </span>
                    </div>

                    <div className="flex items-center shrink-0 app-region-no-drag">
                        {/* Environment quick-switch */}
                        {environments.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="app-chip mr-2 app-region-no-drag group normal-case tracking-normal text-[11px]" title="Switch active environment">
                                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: defaultEnv?.color || '#6B7280' }} />
                                        <span className="truncate max-w-[100px] transition-colors group-hover:text-foreground">{defaultEnv?.name || 'No Env'}</span>
                                        <ChevronDown className="h-3 w-3 text-muted-ui group-hover:text-soft transition-colors" />
                                    </button>
                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56">
                                    <div className="px-2 py-1.5 app-section-label">Active Environment</div>
                                    <DropdownMenuSeparator className="bg-border" />
                                    {environments.map(env => (
                                        <DropdownMenuItem
                                            key={env.id}
                                            onClick={() => activeProjectId && setEnvironmentDefault(activeProjectId, env.id)}
                                            className={cn("flex items-center gap-2 cursor-pointer text-sm", env.isDefault ? "text-foreground" : "text-soft")}
                                        >
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: env.color || '#6B7280' }} />
                                            <span className="flex-1 truncate">{env.name}</span>
                                            {env.isDefault && <span className="app-section-label text-primary">Active</span>}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator className="bg-border" />
                                    <DropdownMenuItem onClick={() => navigate('/environments')} className="text-sm text-soft cursor-pointer">
                                        <Globe className="h-3 w-3 mr-2" /> Manage Environments
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {isSapActive && (
                            <div className="app-chip mr-2 border-cyan-400/20 bg-cyan-500/10 text-cyan-300 group cursor-help transition-all hover:bg-cyan-500/15" title="SAP Commerce Context is active and injected into AI analysis">
                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
                                <span>SAP Active</span>
                            </div>
                        )}
                        <button
                            onClick={() => setCopilotOpen(prev => !prev)}
                            className={cn(
                                "w-10 h-10 flex items-center justify-center rounded-xl hover:bg-panel-muted group transition-colors relative",
                                copilotOpen ? "text-primary" : "text-muted-ui"
                            )}
                            title="AI Copilot"
                        >
                            <Sparkles className={cn("h-4 w-4 transition-all", copilotOpen ? "text-primary drop-shadow-[0_0_8px_rgba(96,165,250,0.45)]" : "group-hover:text-primary")} />
                            {copilotOpen && (
                                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            )}
                        </button>
                        <button onClick={() => setSettingsOpen(true)} aria-label="Settings" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-panel-muted group transition-colors">
                            <Settings className="h-4 w-4 text-muted-ui group-hover:text-primary" />
                        </button>
                        <button
                            onClick={handlePinToggle}
                            className={cn(
                                "w-10 h-10 flex items-center justify-center rounded-xl hover:bg-panel-muted group transition-colors relative",
                                isPinned ? "text-primary" : "text-muted-ui"
                            )}
                            title={isPinned ? "Unpin Window" : "Pin Window"}
                        >
                            <Pin className={cn("h-4 w-4 transition-transform", isPinned ? "fill-current rotate-45" : "group-hover:text-primary")} />
                        </button>

                        {!isMac && (
                            <>
                                <button onClick={() => window.electronAPI?.minimize()} aria-label="Minimize window" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-panel-muted">
                                    <Minus className="h-4 w-4 text-primary" />
                                </button>
                                <button onClick={() => window.electronAPI?.maximize()} aria-label={isMaximized ? "Restore window" : "Maximize window"} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-panel-muted">
                                    {isMaximized ? <Copy className="h-3.5 w-3.5 text-primary rotate-180" /> : <Square className="h-3.5 w-3.5 text-primary" />}
                                </button>
                                <button onClick={() => window.electronAPI?.close()} aria-label="Close window" className="w-11 h-10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                </header>

                <main
                    role="main"
                    className={cn(
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
                        "absolute top-0 right-0 h-full w-full max-w-[680px] bg-[hsl(var(--surface-overlay))] border-l border-ui shadow-2xl transition-transform duration-300 ease-out flex flex-col",
                        settingsOpen ? "translate-x-0" : "translate-x-full"
                    )}>
                        <SideDrawerHeader
                            icon={Settings}
                            title="Settings"
                            subtitle="Application preferences, integrations, and diagnostics"
                            onClose={() => setSettingsOpen(false)}
                        />
                        <div className="flex-1 overflow-hidden">
                            {settingsOpen && (
                                <Suspense fallback={<div className="p-6 text-muted-ui">Loading...</div>}>
                                    <SettingsPage />
                                </Suspense>
                            )}
                        </div>
                    </div>
                </div>

                <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editingProject} />
                <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
                <Toaster theme={currentTheme} position="bottom-right" />
                {confirmDeleteDialog}
            </div>

            </div>

            {/* AI COPILOT PANEL - Moved out of flex container */}
            <AiCopilot open={copilotOpen} onClose={() => setCopilotOpen(false)} />
        </>
    )
}
