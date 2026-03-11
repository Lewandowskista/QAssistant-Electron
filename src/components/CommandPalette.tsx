import { useState, useEffect, useMemo } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import {
    Search,
    FlaskConical,
    LayoutDashboard,
    Settings,
    Plus,
    Target,
    Activity,
    Globe,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"

interface CommandPaletteProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const navigate = useNavigate()
    const projects = useProjectStore(state => state.projects)
    const activeProjectId = useProjectStore(state => state.activeProjectId)
    const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId])

    const [query, setQuery] = useState("")
    const [selectedIndex, setSelectedIndex] = useState(0)

    const commands = useMemo(() => {
        const base = [
            { id: 'dash', title: 'Go to Dashboard', icon: LayoutDashboard, action: () => navigate('/') },
            { id: 'tasks', title: 'Open Operational Board', icon: Target, action: () => navigate('/tasks') },
            { id: 'tests', title: 'Open Quality Core', icon: FlaskConical, action: () => navigate('/tests') },
            { id: 'envs', title: 'Infrastructure Monitor', icon: Activity, action: () => navigate('/environments') },
            { id: 'settings', title: 'Control Center Settings', icon: Settings, action: () => navigate('/settings') },
            { id: 'add-task', title: 'Create New Task', icon: Plus, action: () => navigate('/tasks') },
        ]

        if (activeProject) {
            activeProject.testPlans.slice(0, 5).forEach(plan => {
                base.push({
                    id: `plan-${plan.id}`,
                    title: `Test Plan: ${plan.name}`,
                    icon: FlaskConical,
                    action: () => navigate('/tests')
                })
            })

            activeProject.environments.slice(0, 3).forEach(env => {
                base.push({
                    id: `env-${env.id}`,
                    title: `Environment: ${env.name}`,
                    icon: Globe,
                    action: () => navigate('/environments')
                })
            })
        }

        return base.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    }, [query, activeProject, navigate])

    useEffect(() => {
        setSelectedIndex(0)
    }, [query])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!open) return

            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(i => (i + 1) % commands.length)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(i => (i - 1 + commands.length) % commands.length)
            } else if (e.key === 'Enter') {
                e.preventDefault()
                commands[selectedIndex]?.action()
                onOpenChange(false)
            } else if (e.key === 'Escape') {
                onOpenChange(false)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [open, commands, selectedIndex, onOpenChange])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
            <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-md" onClick={() => onOpenChange(false)} />

            <div className="relative w-full max-w-2xl bg-card border-none shadow-[0_32px_96px_-12px_rgba(0,0,0,0.5)] rounded-[2.5rem] overflow-hidden flex flex-col focus-visible:outline-none ring-1 ring-white/10 ring-inset">
                <div className="flex items-center px-8 border-b border-border/50 h-20">
                    <Search className="h-6 w-6 text-[#A78BFA] mr-4 shrink-0" />
                    <input
                        autoFocus
                        placeholder="Search mission protocols, tests, or environments..."
                        className="flex-1 bg-transparent border-none focus:outline-none text-xl font-bold placeholder:text-muted-foreground/30 placeholder:font-black tracking-tight"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-xl text-[10px] font-black uppercase text-muted-foreground opacity-60">
                        <span>ESC</span>
                        <span className="opacity-30">to close</span>
                    </div>
                </div>

                <div className="max-h-[450px] overflow-y-auto p-4 custom-scrollbar">
                    {commands.length > 0 ? (
                        <div className="space-y-1">
                            {commands.map((cmd, idx) => (
                                <div
                                    key={cmd.id}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    onClick={() => {
                                        cmd.action()
                                        onOpenChange(false)
                                    }}
                                    className={cn(
                                        "flex items-center gap-4 px-6 py-4 rounded-2xl cursor-pointer transition-all duration-150 select-none",
                                        idx === selectedIndex
                                            ? "bg-[#A78BFA] text-[#0F0F13] shadow-xl shadow-[#A78BFA]/20 translate-x-2"
                                            : "hover:bg-muted/50 text-muted-foreground"
                                    )}
                                >
                                    <cmd.icon className={cn("h-5 w-5", idx === selectedIndex ? "text-[#0F0F13]" : "text-[#A78BFA]")} />
                                    <span className="font-bold tracking-tight">{cmd.title}</span>
                                    {idx === selectedIndex && (
                                        <div className="ml-auto text-[10px] font-black uppercase tracking-widest opacity-60 animate-in slide-in-from-right-2">
                                            Execute
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 flex flex-col items-center justify-center text-center opacity-30">
                            <p className="text-sm font-black uppercase tracking-widest">No matching results</p>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-muted/20 border-t border-border/50 flex items-center justify-between text-[10px] font-black text-muted-foreground uppercase opacity-60 tracking-tighter">
                    <div className="flex items-center gap-6 px-4">
                        <div className="flex items-center gap-2">
                            <div className="px-1.5 py-0.5 bg-card border rounded shadow-sm">↑↓</div>
                            <span>Navigate</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="px-1.5 py-0.5 bg-card border rounded shadow-sm">↵</div>
                            <span>Select</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="px-1.5 py-0.5 bg-card border rounded shadow-sm">Ctrl+1–5</div>
                            <span>Quick Nav</span>
                        </div>
                    </div>
                    <div className="px-4">
                        Mission Logic Core v1.2
                    </div>
                </div>
            </div>
        </div>
    )
}
