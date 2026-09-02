import { useMemo } from "react"
import { Command } from "cmdk"
import { useNavigate } from "react-router-dom"
import {
    ClipboardCheck,
    FlaskConical,
    FolderKanban,
    Globe,
    Moon,
    Plus,
    Search,
    Settings,
    Sun,
} from "lucide-react"

import { PRIMARY_ITEMS, UTILITY_ITEMS, matchesRole } from "@/lib/navigation"
import { useTheme } from "@/hooks/useTheme"
import { useProjectStore } from "@/store/useProjectStore"
import { useUserStore } from "@/store/useUserStore"

interface CommandPaletteProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * Command palette on cmdk: fuzzy filtering, listbox semantics, and item
 * labels that always match the sidebar (both read from lib/navigation).
 */
export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const navigate = useNavigate()
    const isMac = navigator.userAgent.toUpperCase().includes("MAC")
    const { theme, toggleTheme } = useTheme()

    const projects = useProjectStore((state) => state.projects)
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const setActiveProject = useProjectStore((state) => state.setActiveProject)
    const setEnvironmentDefault = useProjectStore((state) => state.setEnvironmentDefault)
    const seedDemoProject = useProjectStore((state) => state.seedDemoProject)
    const activeProject = useMemo(
        () => projects.find((project) => project.id === activeProjectId),
        [projects, activeProjectId]
    )

    const activeRole = (useUserStore((state) => state.profile?.activeRole) ?? "qa") as "qa" | "dev"

    const navItems = useMemo(
        () => [...PRIMARY_ITEMS, ...UTILITY_ITEMS].filter((item) => matchesRole(item, activeRole)),
        [activeRole]
    )

    const run = (action: () => void) => {
        onOpenChange(false)
        action()
    }

    const itemClass =
        "flex cursor-pointer select-none items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-soft data-[selected=true]:bg-surface-selected data-[selected=true]:text-foreground"
    const groupClass =
        "[&_[cmdk-group-heading]]:app-section-label [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3"

    return (
        <Command.Dialog
            open={open}
            onOpenChange={onOpenChange}
            label="Command palette"
            className="fixed left-1/2 top-[15vh] z-layer-dialog w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-ui bg-[hsl(var(--surface-overlay))] shadow-2xl"
            overlayClassName="fixed inset-0 z-layer-overlay bg-black/60 backdrop-blur-sm"
        >
            <div className="flex items-center gap-3 border-b border-ui px-4">
                <Search className="h-4 w-4 shrink-0 text-muted-ui" aria-hidden="true" />
                <Command.Input
                    autoFocus
                    placeholder="Search pages, projects, and actions…"
                    className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-ui focus:outline-none"
                />
                <kbd className="rounded-md border border-ui bg-panel-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-ui">esc</kbd>
            </div>

            <Command.List className="max-h-[360px] overflow-y-auto custom-scrollbar p-2">
                <Command.Empty className="py-10 text-center text-sm text-muted-ui">
                    No results. Try a page name like “Files” or an action like “New task”.
                </Command.Empty>

                <Command.Group heading="Go to" className={groupClass}>
                    {navItems.map((item) => (
                        <Command.Item key={item.href} value={`go to ${item.name}`} onSelect={() => run(() => navigate(item.href))} className={itemClass}>
                            <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span>{item.name}</span>
                        </Command.Item>
                    ))}
                    <Command.Item value="go to Settings" onSelect={() => run(() => navigate("/settings"))} className={itemClass}>
                        <Settings className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>Settings</span>
                    </Command.Item>
                </Command.Group>

                <Command.Group heading="Actions" className={groupClass}>
                    <Command.Item
                        value="new task create task"
                        onSelect={() =>
                            run(() => {
                                const { projects: currentProjects, activeProjectId: currentActiveProjectId } = useProjectStore.getState()
                                if (currentProjects.length > 0 && !currentActiveProjectId) setActiveProject(currentProjects[0].id)
                                navigate("/tasks")
                            })
                        }
                        className={itemClass}
                    >
                        <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>New task</span>
                    </Command.Item>
                    <Command.Item
                        value="new project create project"
                        onSelect={() => run(() => window.dispatchEvent(new Event("open-project-dialog")))}
                        className={itemClass}
                    >
                        <FolderKanban className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>New project</span>
                    </Command.Item>
                    <Command.Item
                        value="toggle theme light dark appearance"
                        onSelect={() => run(() => { void toggleTheme() })}
                        className={itemClass}
                    >
                        {theme === "dark"
                            ? <Sun className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            : <Moon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                        <span>Switch to {theme === "dark" ? "light" : "dark"} theme</span>
                    </Command.Item>
                    {projects.length === 0 ? (
                        <Command.Item
                            value="load demo project"
                            onSelect={() => run(() => { void seedDemoProject() })}
                            className={itemClass}
                        >
                            <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span>Load demo project</span>
                        </Command.Item>
                    ) : null}
                </Command.Group>

                {projects.length > 1 ? (
                    <Command.Group heading="Switch project" className={groupClass}>
                        {projects.map((project) => (
                            <Command.Item
                                key={project.id}
                                value={`switch project ${project.name}`}
                                onSelect={() => run(() => setActiveProject(project.id))}
                                className={itemClass}
                            >
                                <span className={`h-4 w-1.5 shrink-0 rounded-full ${project.color}`} aria-hidden="true" />
                                <span className="truncate">{project.name}</span>
                                {project.id === activeProjectId ? <span className="ml-auto text-[11px] text-muted-ui">Active</span> : null}
                            </Command.Item>
                        ))}
                    </Command.Group>
                ) : null}

                {activeProject && activeProject.environments.length > 1 ? (
                    <Command.Group heading="Switch environment" className={groupClass}>
                        {activeProject.environments.map((environment) => (
                            <Command.Item
                                key={environment.id}
                                value={`switch environment ${environment.name}`}
                                onSelect={() => run(() => { if (activeProjectId) void setEnvironmentDefault(activeProjectId, environment.id) })}
                                className={itemClass}
                            >
                                <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                <span className="truncate">{environment.name}</span>
                                {environment.isDefault ? <span className="ml-auto text-[11px] text-muted-ui">Active</span> : null}
                            </Command.Item>
                        ))}
                    </Command.Group>
                ) : null}

                {activeProject && activeProject.testPlans.length > 0 ? (
                    <Command.Group heading="Test plans" className={groupClass}>
                        {activeProject.testPlans.slice(0, 5).map((plan) => (
                            <Command.Item
                                key={plan.id}
                                value={`test plan ${plan.name}`}
                                onSelect={() => run(() => navigate("/tests"))}
                                className={itemClass}
                            >
                                <FlaskConical className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                <span className="truncate">{plan.name}</span>
                            </Command.Item>
                        ))}
                    </Command.Group>
                ) : null}
            </Command.List>

            <div className="flex items-center gap-4 border-t border-ui bg-panel-muted/60 px-4 py-2 text-xs text-muted-ui">
                <span><kbd className="rounded border border-ui bg-panel px-1">↑↓</kbd> navigate</span>
                <span><kbd className="rounded border border-ui bg-panel px-1">↵</kbd> select</span>
                <span className="ml-auto"><kbd className="rounded border border-ui bg-panel px-1">{isMac ? "⌘" : "Ctrl"}+1–5</kbd> quick nav</span>
            </div>
        </Command.Dialog>
    )
}
