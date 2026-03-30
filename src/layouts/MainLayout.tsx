import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { useShallow } from "zustand/react/shallow"
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Code,
  Compass,
  Copy,
  Database,
  Edit2,
  FileText,
  FlaskConical,
  Globe,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Minus,
  Pin,
  Plus,
  Rocket,
  Search,
  ServerCog,
  Settings,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react"
import { Toaster } from "sonner"

import { ProjectDialog } from "@/components/ProjectDialog"
import { useConfirm } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SideDrawerHeader } from "@/components/ui/side-drawer-header"
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator"
import { cn } from "@/lib/utils"
import { recordRendererMetric } from "@/lib/perf"
import { Project, useProjectStore } from "@/store/useProjectStore"
import { useSettingsStore } from "@/store/useSettingsStore"
import { useSyncStore } from "@/store/useSyncStore"
import { useUserStore } from "@/store/useUserStore"

const SettingsPage = lazy(() => import("@/pages/SettingsPage"))
const CommandPalette = lazy(() => import("@/components/CommandPalette"))
const AiCopilot = lazy(() => import("@/components/AiCopilot"))

const EMPTY_ENVIRONMENTS: Project["environments"] = []

type NavItem = {
  name: string
  href: string
  icon: typeof LayoutDashboard
  roles?: Array<"qa" | "dev">
}

const PRIMARY_ITEMS: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Tests", href: "/tests", icon: FlaskConical, roles: ["qa"] },
  { name: "Code Reviews", href: "/code-reviews", icon: MessageSquare, roles: ["dev"] },
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "Files", href: "/files", icon: FileText },
  { name: "Release Queue", href: "/release-queue", icon: ClipboardCheck },
  { name: "Activity Feed", href: "/activity", icon: Activity },
]

const UTILITY_ITEMS: NavItem[] = [
  { name: "Exploratory", href: "/exploratory", icon: Compass, roles: ["qa"] },
  { name: "Test Data", href: "/test-data", icon: Database, roles: ["qa"] },
  { name: "Checklists", href: "/checklists", icon: ListChecks, roles: ["qa"] },
  { name: "Reports", href: "/reports", icon: BarChart3, roles: ["qa"] },
  { name: "GitHub", href: "/github", icon: GitBranch },
  { name: "Environments", href: "/environments", icon: Globe },
  { name: "API", href: "/api", icon: Code },
  { name: "Runbooks", href: "/runbooks", icon: BookOpen },
  { name: "Deployments", href: "/deployments", icon: Rocket, roles: ["dev"] },
  { name: "SAP HAC", href: "/sap", icon: ServerCog, roles: ["qa"] },
  { name: "Docs", href: "/docs", icon: BookOpen },
]

const FULL_BLEED_ROUTES = [
  "/notes",
  "/files",
  "/tasks",
  "/tests",
  "/exploratory",
  "/test-data",
  "/checklists",
  "/environments",
  "/api",
  "/sap",
  "/runbooks",
  "/github",
  "/code-reviews",
  "/deployments",
  "/activity",
  "/reports",
  "/docs",
]

function matchesRole(item: NavItem, activeRole: "qa" | "dev") {
  return !item.roles || item.roles.includes(activeRole)
}

function isItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

function UserActivityReporter() {
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.reportUserActivity) return

    let lastSentAt = 0
    const sendActivity = () => {
      const now = Date.now()
      if (now - lastSentAt < 5000) return
      lastSentAt = now
      api.reportUserActivity()
    }

    sendActivity()
    window.addEventListener("keydown", sendActivity, true)
    window.addEventListener("pointerdown", sendActivity, true)
    window.addEventListener("wheel", sendActivity, { passive: true })
    window.addEventListener("focus", sendActivity)

    return () => {
      window.removeEventListener("keydown", sendActivity, true)
      window.removeEventListener("pointerdown", sendActivity, true)
      window.removeEventListener("wheel", sendActivity)
      window.removeEventListener("focus", sendActivity)
    }
  }, [])

  return null
}

export default function MainLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const shellReadyRef = useRef(false)

  const {
    projects,
    activeProjectId,
    loadProjects,
    setActiveProject,
    deleteProject,
    setEnvironmentDefault,
    seedDemoProject,
  } = useProjectStore(useShallow((state) => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    loadProjects: state.loadProjects,
    setActiveProject: state.setActiveProject,
    deleteProject: state.deleteProject,
    setEnvironmentDefault: state.setEnvironmentDefault,
    seedDemoProject: state.seedDemoProject,
  })))

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )
  const environments = activeProject?.environments ?? EMPTY_ENVIRONMENTS
  const defaultEnv = useMemo(
    () => environments.find((environment) => environment.isDefault) ?? environments[0],
    [environments]
  )

  const { profile: userProfile, isLoaded: userLoaded, loadProfile } = useUserStore(useShallow((state) => ({
    profile: state.profile,
    isLoaded: state.isLoaded,
    loadProfile: state.loadProfile,
  })))
  const activeRole = (userProfile?.activeRole ?? "qa") as "qa" | "dev"
  const connectedIdentity = userProfile?.identities?.[0] ?? null

  const { loadSettings, saveSettings, currentTheme, isPinnedStore, isSapActive, resolvedPerformanceMode } = useSettingsStore(useShallow((state) => ({
    loadSettings: state.load,
    saveSettings: state.save,
    currentTheme: state.settings.theme,
    isPinnedStore: state.settings.alwaysOnTop,
    isSapActive: state.settings.sapCommerceContext,
    resolvedPerformanceMode: state.resolvedPerformanceMode,
  })))
  const isPerformanceMode = resolvedPerformanceMode === "performance"

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(isPinnedStore)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMac, setIsMac] = useState(() => navigator.userAgent.toUpperCase().includes("MAC"))
  const [paletteMounted, setPaletteMounted] = useState(false)
  const [copilotMounted, setCopilotMounted] = useState(false)
  const { confirm: confirmDelete, dialog: confirmDeleteDialog } = useConfirm()

  const isFullBleedRoute = FULL_BLEED_ROUTES.some((route) => location.pathname.startsWith(route))

  useEffect(() => {
    loadProjects()
    if (!userLoaded) loadProfile()
    loadSettings()

    const api = window.electronAPI
    if (!api) return

    const removePaletteListener = api.onCommandPalette?.(() => setPaletteOpen((prev) => !prev))
    const removeTaskListener = api.onAddTask?.(() => {
      const { projects: currentProjects, activeProjectId: currentActiveProjectId } = useProjectStore.getState()
      if (currentProjects.length > 0 && !currentActiveProjectId) setActiveProject(currentProjects[0].id)
      navigate("/tasks")
    })
    const removeMaxListener = api.onMaximizedStatus?.((status: boolean) => setIsMaximized(status))
    const removeSettingsListener = api.onOpenSettings?.(() => setSettingsOpen(true))
    const removeIpcReadyListener = api.onIpcReady?.(() => {
      const { projects: currentProjects } = useProjectStore.getState()
      if (currentProjects.length === 0) loadProjects()
    })

    const handleOpenDialog = () => {
      setEditingProject(undefined)
      setDialogOpen(true)
    }

    window.addEventListener("open-project-dialog", handleOpenDialog)
    api.getSystemInfo().then((info) => setIsMac(info.platform === "darwin"))

    return () => {
      removePaletteListener?.()
      removeTaskListener?.()
      removeMaxListener?.()
      removeSettingsListener?.()
      removeIpcReadyListener?.()
      window.removeEventListener("open-project-dialog", handleOpenDialog)
    }
  }, [loadProjects, loadProfile, loadSettings, navigate, setActiveProject, userLoaded])

  useEffect(() => {
    if (paletteOpen) setPaletteMounted(true)
  }, [paletteOpen])

  useEffect(() => {
    if (copilotOpen) setCopilotMounted(true)
  }, [copilotOpen])

  useEffect(() => {
    let raf1 = 0
    let raf2 = 0

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (shellReadyRef.current) return
        shellReadyRef.current = true

        void Promise.all([
          recordRendererMetric("shellMountMs", performance.now()),
          recordRendererMetric("firstRouteInteractiveMs", performance.now()),
          window.electronAPI?.appShellReady?.() ?? Promise.resolve(true),
        ])

        ;(async () => {
          const syncStore = useSyncStore.getState()
          if (!syncStore.isLoaded) {
            await syncStore.loadConfig()
          }
          const latestSyncStore = useSyncStore.getState()
          if (latestSyncStore.config?.configured) {
            await latestSyncStore.initSync()
          }
        })().catch(console.error)
      })
    })

    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
    }
  }, [])

  useEffect(() => {
    const NAV_SHORTCUTS: Record<string, string> = {
      "1": "/",
      "2": "/tasks",
      "3": activeRole === "dev" ? "/code-reviews" : "/tests",
      "4": "/environments",
      "5": "/notes",
    }

    const handleGlobalKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return

      const isCtrl = event.ctrlKey || event.metaKey
      if (isCtrl && event.key === "k") {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
      } else if (isCtrl && event.key === "n") {
        event.preventDefault()
        const { projects: currentProjects, activeProjectId: currentActiveProjectId } = useProjectStore.getState()
        if (currentProjects.length > 0 && !currentActiveProjectId) setActiveProject(currentProjects[0].id)
        navigate("/tasks")
      } else if (isCtrl && event.key === ",") {
        event.preventDefault()
        setSettingsOpen(true)
      } else if (event.key === "F1") {
        event.preventDefault()
        navigate("/docs")
      } else if (isCtrl && NAV_SHORTCUTS[event.key]) {
        event.preventDefault()
        navigate(NAV_SHORTCUTS[event.key])
      }
    }

    window.addEventListener("keydown", handleGlobalKey)
    return () => window.removeEventListener("keydown", handleGlobalKey)
  }, [activeRole, navigate, setActiveProject])

  const handlePinToggle = async () => {
    const next = !isPinned
    setIsPinned(next)
    window.electronAPI?.setAlwaysOnTop(next)
    await saveSettings({ alwaysOnTop: next })
  }

  const filteredPrimaryItems = PRIMARY_ITEMS
    .filter((item) => matchesRole(item, activeRole))
    .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const filteredUtilityItems = UTILITY_ITEMS
    .filter((item) => matchesRole(item, activeRole))
    .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const activeNavItem = [...PRIMARY_ITEMS, ...UTILITY_ITEMS]
    .filter((item) => matchesRole(item, activeRole))
    .find((item) => isItemActive(location.pathname, item.href))

  return (
    <>
      <UserActivityReporter />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className={cn("app-shell flex selection:bg-primary/20", isMac && !isPerformanceMode && "backdrop-blur-xl")}>
        <aside
          aria-label="Workspace navigation"
          data-collapsed={railCollapsed}
          className={cn(
            "workspace-rail shrink-0 transition-[width,opacity] duration-300",
            isMac && !isPerformanceMode && "pt-8 backdrop-blur-md"
          )}
        >
          <div className="workspace-rail-section border-b app-divider">
            <div className={cn("flex items-center gap-3", railCollapsed ? "justify-center" : "justify-between")}>
              <div className={cn("flex min-w-0 items-center gap-3", railCollapsed && "justify-center")}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10">
                  <FlaskConical className="h-4 w-4 text-primary stroke-[2.4]" />
                </div>
                {!railCollapsed ? (
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">QAssistant</div>
                    <div className="app-helper-text">QA workspace</div>
                  </div>
                ) : null}
              </div>

              {!railCollapsed ? (
                <button
                  type="button"
                  aria-label="Collapse navigation rail"
                  className="rounded-lg p-2 text-muted-ui transition-colors hover:bg-panel-muted hover:text-foreground"
                  onClick={() => setRailCollapsed(true)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="workspace-rail-section space-y-3 border-b app-divider">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="workspace-project-button">
                  <div className={cn("h-8 w-2 shrink-0 rounded-full", activeProject?.color ?? "bg-primary")} />
                  {!railCollapsed ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {activeProject?.name ?? "No project selected"}
                        </div>
                        <div className="app-helper-text">
                          {projects.length} workspace project{projects.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-ui" />
                    </>
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <div className="px-2 py-1.5 app-section-label">Projects</div>
                <DropdownMenuSeparator />
                {projects.map((project) => (
                  <DropdownMenuItem key={project.id} asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => setActiveProject(project.id)}
                    >
                      <div className={cn("h-6 w-1.5 rounded-full", project.color)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                      </div>
                      {activeProjectId === project.id ? <span className="app-helper-text text-primary">Active</span> : null}
                    </button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setEditingProject(undefined)
                    setDialogOpen(true)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Project
                </DropdownMenuItem>
                {projects.length === 0 ? (
                  <DropdownMenuItem onClick={() => seedDemoProject()}>
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Load Demo
                  </DropdownMenuItem>
                ) : null}
                {activeProject ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingProject(activeProject)
                        setDialogOpen(true)
                      }}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit Active Project
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-400"
                      onClick={async () => {
                        const ok = await confirmDelete(`Delete "${activeProject.name}"?`, {
                          description:
                            "All tasks, tests, notes, and handoffs will be permanently deleted. This cannot be undone.",
                          confirmLabel: "Delete Project",
                          destructive: true,
                        })
                        if (ok) deleteProject(activeProject.id)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Active Project
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              className={cn("w-full justify-start gap-2", railCollapsed && "justify-center px-0")}
              onClick={() => {
                setEditingProject(undefined)
                setDialogOpen(true)
              }}
              aria-label="Create a new project"
            >
              <Plus className="h-4 w-4" />
              {!railCollapsed ? <span>New Project</span> : null}
            </Button>

            {!railCollapsed ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted-ui" />
                <Input
                  aria-label="Search navigation"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search workspace…"
                  className="h-10 pl-9 text-sm"
                />
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            <div className="workspace-rail-section">
              {!railCollapsed ? <div className="workspace-rail-heading">Work</div> : null}
              <div className="space-y-1">
                {filteredPrimaryItems.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    data-active={isItemActive(location.pathname, item.href)}
                    className="workspace-rail-item"
                    aria-label={item.name}
                    title={railCollapsed ? item.name : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!railCollapsed ? <span className="truncate">{item.name}</span> : null}
                  </Link>
                ))}
              </div>
            </div>

            <div className="workspace-rail-section">
              {!railCollapsed ? <div className="workspace-rail-heading">Utilities</div> : null}
              <div className="space-y-1">
                {filteredUtilityItems.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    data-active={isItemActive(location.pathname, item.href)}
                    className="workspace-rail-item"
                    aria-label={item.name}
                    title={railCollapsed ? item.name : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!railCollapsed ? <span className="truncate">{item.name}</span> : null}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="workspace-rail-section border-t app-divider">
            <div className={cn("space-y-3", railCollapsed && "flex flex-col items-center")}>
              <SyncStatusIndicator />

              <button
                type="button"
                className={cn("workspace-rail-item w-full", railCollapsed && "justify-center")}
                onClick={() => setSettingsOpen(true)}
                aria-label="Open account and settings"
              >
                {connectedIdentity?.avatarUrl ? (
                  <img src={connectedIdentity.avatarUrl} className="h-7 w-7 rounded-full shrink-0" alt="" />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ui bg-panel-muted">
                    <User className="h-3.5 w-3.5 text-muted-ui" />
                  </div>
                )}
                {!railCollapsed ? (
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-foreground">
                      {connectedIdentity?.username ?? "No account"}
                    </div>
                    <div className="app-helper-text">{activeRole === "dev" ? "Developer" : "QA Engineer"}</div>
                  </div>
                ) : null}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className={cn("workspace-topbar app-region-drag", isMac && "pl-20")}>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {railCollapsed ? (
                <button
                  type="button"
                  aria-label="Expand navigation rail"
                  className="app-region-no-drag rounded-lg p-2 text-muted-ui transition-colors hover:bg-panel-muted hover:text-foreground"
                  onClick={() => setRailCollapsed(false)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
              {activeNavItem ? (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-ui bg-panel-muted">
                    <activeNavItem.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{activeNavItem.name}</div>
                    <div className="app-helper-text truncate">
                      {activeProject?.name ?? "Select a project to start working"}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="app-region-no-drag flex shrink-0 items-center gap-1">
              {environments.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="app-chip normal-case tracking-normal text-[11px]" title="Switch active environment">
                      <div
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: defaultEnv?.color || "#64748b" }}
                      />
                      <span className="max-w-[120px] truncate">{defaultEnv?.name || "No Env"}</span>
                      <ChevronDown className="h-3 w-3 text-muted-ui" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 app-section-label">Active Environment</div>
                    <DropdownMenuSeparator className="bg-border" />
                    {environments.map((environment) => (
                      <DropdownMenuItem
                        key={environment.id}
                        onClick={() => activeProjectId && setEnvironmentDefault(activeProjectId, environment.id)}
                        className="flex items-center gap-2 text-sm"
                      >
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: environment.color || "#64748b" }} />
                        <span className="flex-1 truncate">{environment.name}</span>
                        {environment.isDefault ? <span className="app-section-label text-primary">Active</span> : null}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem onClick={() => navigate("/environments")}>
                      <Globe className="mr-2 h-4 w-4" />
                      Manage Environments
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              {isSapActive ? (
                <div className="app-chip border-cyan-400/20 bg-cyan-500/10 text-cyan-300" title="SAP Commerce context is active">
                  <div className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                  <span>SAP</span>
                </div>
              ) : null}

              <button
                type="button"
                aria-label="Toggle AI Copilot"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-panel-muted",
                  copilotOpen ? "text-primary" : "text-muted-ui"
                )}
                onClick={() => setCopilotOpen((prev) => !prev)}
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Open settings"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-ui transition-colors hover:bg-panel-muted hover:text-primary"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={isPinned ? "Unpin window" : "Pin window"}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-panel-muted",
                  isPinned ? "text-primary" : "text-muted-ui"
                )}
                onClick={handlePinToggle}
              >
                <Pin className={cn("h-4 w-4", isPinned && "fill-current rotate-45")} />
              </button>

              {!isMac ? (
                <>
                  <button
                    type="button"
                    aria-label="Minimize window"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-colors hover:bg-panel-muted"
                    onClick={() => window.electronAPI?.minimize()}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={isMaximized ? "Restore window" : "Maximize window"}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-colors hover:bg-panel-muted"
                    onClick={() => window.electronAPI?.maximize()}
                  >
                    {isMaximized ? <Copy className="h-3.5 w-3.5 rotate-180" /> : <Square className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Close window"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-ui transition-colors hover:bg-red-500 hover:text-white"
                    onClick={() => window.electronAPI?.close()}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          </header>

          <main
            id="main-content"
            role="main"
            className={cn(
              "min-h-0 flex-1",
              isFullBleedRoute ? "flex flex-col overflow-hidden" : cn("overflow-y-auto custom-scrollbar", !isPerformanceMode && "scroll-smooth")
            )}
          >
            {isFullBleedRoute ? (
              <Outlet />
            ) : (
              <div className="mx-auto w-full max-w-[1600px]">
                <Outlet />
              </div>
            )}
          </main>

          <div
            className={cn(
              "fixed inset-0 z-[100] transition-opacity duration-300",
              settingsOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
            <div
              className={cn(
                "absolute right-0 top-0 flex h-full w-full max-w-[760px] flex-col border-l border-ui bg-[hsl(var(--surface-overlay))] shadow-2xl transition-transform duration-300 ease-out",
                settingsOpen ? "translate-x-0" : "translate-x-full"
              )}
              style={{ overscrollBehavior: "contain" }}
            >
              <SideDrawerHeader
                icon={Settings}
                title="Settings"
                subtitle="Application preferences, integrations, and diagnostics"
                onClose={() => setSettingsOpen(false)}
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                {settingsOpen ? (
                  <Suspense fallback={<div className="p-6 text-muted-ui">Loading…</div>}>
                    <SettingsPage />
                  </Suspense>
                ) : null}
              </div>
            </div>
          </div>

          <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editingProject} />
          {paletteMounted ? (
            <Suspense fallback={null}>
              <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
            </Suspense>
          ) : null}
          <Toaster theme={currentTheme} position="bottom-right" />
          {confirmDeleteDialog}
        </div>
      </div>

      {copilotMounted ? (
        <Suspense fallback={null}>
          <AiCopilot open={copilotOpen} onClose={() => setCopilotOpen(false)} />
        </Suspense>
      ) : null}
    </>
  )
}
