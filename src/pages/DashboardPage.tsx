import { useProjectStore } from "@/store/useProjectStore"
import {
    LayoutDashboard,
    CheckSquare,
    Target,
    Activity,
    AlertOctagon,
    Clock,
    Folder,
    XCircle,
    PlayCircle,
    FileText,
    ListChecks
} from "lucide-react"
import { cn } from "@/lib/utils"
// import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    if (!activeProject) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="p-8 bg-[#13131A] border border-[#2A2A3A] rounded-2xl">
                    <LayoutDashboard className="h-16 w-16 text-[#6B7280]/30" strokeWidth={1} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#E2E8F0]">No Project Selected</h2>
                    <p className="text-[#6B7280] mt-2 max-w-sm font-medium">
                        Select a project from the sidebar to access the dashboard.
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="h-11 px-8 font-black rounded-xl border-[#A78BFA] text-[#A78BFA] hover:bg-[#A78BFA]/10"
                    onClick={() => window.dispatchEvent(new Event('open-project-dialog'))}
                >
                    CREATE PROJECT
                </Button>
            </div>
        )
    }

    const tasks = activeProject.tasks || []
    const testPlans = activeProject.testPlans || []
    const allTestCases = testPlans.flatMap(p => p.testCases || [])
    const notes = (activeProject.notes || []).slice(0, 5)
    const checklists = (activeProject.checklists || []).slice(0, 5)

    const openStatuses = ['backlog', 'todo', 'in-progress', 'in-review']

    // Metrics calculations
    const openTasks = tasks.filter(t => openStatuses.includes(t.status || 'todo'))
    const openTasksCount = openTasks.length
    const criticalBlockersCount = openTasks.filter(t => t.priority === 'critical').length

    const passedTests = allTestCases.filter(c => c.status === 'passed').length
    const failedTests = allTestCases.filter(c => c.status === 'failed').length
    const notRunTests = allTestCases.filter(c => c.status === 'not-run').length
    const testCasesCount = allTestCases.length
    const passRate = testCasesCount > 0 ? Math.round((passedTests / testCasesCount) * 100) : 0

    const now = new Date()
    const upcomingTasks = openTasks
        .filter(t => t.dueDate && new Date(t.dueDate) >= now)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
        .slice(0, 7)

    const overdueCount = openTasks.filter(t => t.dueDate && new Date(t.dueDate) < now).length

    // Status mapping for breakdown
    const statusMap: Record<string, { label: string, color: string, count: number }> = {
        'backlog': { label: 'Backlog', color: 'bg-zinc-500', count: 0 },
        'todo': { label: 'Todo', color: 'bg-[#3B82F6]', count: 0 },
        'in-progress': { label: 'In Progress', color: 'bg-[#F59E0B]', count: 0 },
        'in-review': { label: 'In Review', color: 'bg-[#A78BFA]', count: 0 },
        'done': { label: 'Done', color: 'bg-[#10B981]', count: 0 },
        'canceled': { label: 'Canceled', color: 'bg-[#EF4444]', count: 0 },
    }

    tasks.forEach(t => {
        if (statusMap[t.status || 'todo']) {
            statusMap[t.status || 'todo'].count++
        }
    })

    const statusesForBreakdown = Object.values(statusMap)

    const recentTestPlans = testPlans
        .filter(p => !p.isArchived)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)

    return (
        <div className="space-y-6 max-w-[1600px] animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <header className="space-y-1">
                <p className="text-[9px] font-bold text-[#6B7280] tracking-[0.2em] uppercase">PROJECT OVERVIEW</p>
                <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">{activeProject.name}</h1>
                <p className="text-xs text-[#6B7280] font-medium">Project Dashboard</p>
            </header>

            {/* Metrics List (MetricCardsRow) */}
            <div className="flex flex-wrap gap-3">
                {/* Tasks Open */}
                <div className="min-w-[160px] flex-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm space-y-1">
                    <CheckSquare className="h-5 w-5 text-[#3B82F6]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{openTasksCount}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Open Tasks</p>
                </div>

                {/* Blockers */}
                <div className={cn(
                    "min-w-[160px] flex-1 bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    criticalBlockersCount > 0 ? "border-[#EF4444]/30 bg-[#EF4444]/5" : "border-[#2A2A3A]"
                )}>
                    <AlertOctagon className="h-5 w-5 text-[#EF4444]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{criticalBlockersCount}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Critical / Blockers</p>
                </div>

                {/* Pass Rate */}
                <div className="min-w-[160px] flex-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm space-y-1">
                    <Target className="h-5 w-5 text-[#10B981]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{passRate}%</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Test Pass Rate</p>
                </div>

                {/* Failed Tests */}
                <div className={cn(
                    "min-w-[160px] flex-1 bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    failedTests > 0 ? "border-[#EF4444]/30 bg-[#EF4444]/5" : "border-[#2A2A3A]"
                )}>
                    <XCircle className="h-5 w-5 text-[#EF4444]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{failedTests}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Failed Tests</p>
                </div>

                {/* Not Run */}
                <div className="min-w-[160px] flex-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm space-y-1">
                    <PlayCircle className="h-5 w-5 text-[#9CA3AF]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{notRunTests}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Not Run</p>
                </div>

                {/* Overdue */}
                <div className={cn(
                    "min-w-[160px] flex-1 bg-[#13131A] border rounded-xl p-5 shadow-sm space-y-1",
                    overdueCount > 0 ? "border-[#F59E0B]/30 bg-[#F59E0B]/5" : "border-[#2A2A3A]"
                )}>
                    <Clock className="h-5 w-5 text-[#F59E0B]" strokeWidth={2.5} />
                    <p className="text-2xl font-bold text-[#E2E8F0] pt-1">{overdueCount}</p>
                    <p className="text-[11px] font-medium text-[#6B7280]">Overdue Tasks</p>
                </div>
            </div>

            {/* Layout Row 1: Breakdown + Upcoming */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Test Case Breakdown */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">TEST CASE BREAKDOWN</p>
                    <div className="flex-1 space-y-4">
                        <div className="h-2 w-full bg-[#1A1A24] rounded-full overflow-hidden flex shadow-inner">
                            {statusesForBreakdown.map(s => {
                                if (s.count === 0) return null;
                                const pct = (s.count / tasks.length) * 100;
                                return (
                                    <div
                                        key={s.label}
                                        className={cn("h-full transition-all border-r border-[#0F0F13]/20 last:border-0", s.color)}
                                        style={{ width: `${pct}%` }}
                                        title={`${s.label}: ${s.count}`}
                                    />
                                )
                            })}
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            {statusesForBreakdown.map(s => (
                                <div key={s.label} className="flex items-center justify-between text-xs font-semibold">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-2 h-2 rounded-[1px]", s.color)} />
                                        <span className="text-[#6B7280]">{s.label}</span>
                                    </div>
                                    <span className="text-[#E2E8F0]">{s.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Upcoming Due Dates */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm flex flex-col">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">UPCOMING DUE DATES</p>
                    <div className="space-y-2.5">
                        {upcomingTasks.length > 0 ? (
                            upcomingTasks.map(t => {
                                const daysLeft = Math.ceil((new Date(t.dueDate!).getTime() - now.getTime()) / (1000 * 3600 * 24))
                                const dueLabel = daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `in ${daysLeft} days`
                                return (
                                    <div key={t.id} className="flex items-center justify-between group">
                                        <span className="text-xs font-medium text-[#E2E8F0] truncate flex-1 group-hover:text-[#A78BFA] transition-colors">{t.title}</span>
                                        <span className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                                            daysLeft <= 1 ? "text-[#EF4444]" : "text-[#10B981]"
                                        )}>
                                            {dueLabel}
                                        </span>
                                    </div>
                                )
                            })
                        ) : (
                            <p className="text-xs text-[#6B7280] font-medium italic">No upcoming due dates found.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Layout Row 2: Test Plans + Notes/Runbooks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Test Plans */}
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-4">TEST PLANS</p>
                    <div className="space-y-3">
                        {recentTestPlans.map(plan => {
                            const cases = plan.testCases || []
                            const passed = cases.filter(c => c.status === 'passed').length
                            const planPassRate = cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0
                            return (
                                <div key={plan.id} className="flex items-center gap-4 bg-[#1A1A24]/50 p-3 rounded-lg border border-[#2A2A3A]/50">
                                    <div className="w-10 h-10 rounded bg-[#252535] flex items-center justify-center shrink-0">
                                        <Folder className="h-5 w-5 text-[#A78BFA]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-[#E2E8F0] truncate">{plan.name}</p>
                                        <p className="text-[10px] text-[#6B7280] font-bold uppercase tracking-wider">{cases.length} Cases • {planPassRate}% Pass</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="h-1.5 w-24 bg-[#0F0F13] rounded-full overflow-hidden border border-[#2A2A3A]">
                                            <div className="h-full bg-[#10B981]" style={{ width: `${planPassRate}%` }} />
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Notes + Runbooks */}
                <div className="grid grid-rows-2 gap-4">
                    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                        <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-3">RECENT NOTES</p>
                        <div className="space-y-2">
                            {notes.length > 0 ? notes.map(note => (
                                <div key={note.id} className="flex items-center gap-2 group cursor-pointer">
                                    <FileText className="h-3 w-3 text-[#A78BFA]" />
                                    <span className="text-xs text-[#6B7280] group-hover:text-[#E2E8F0] truncate transition-colors">{note.title}</span>
                                </div>
                            )) : (
                                <p className="text-[11px] text-[#6B7280] italic">No notes found.</p>
                            )}
                        </div>
                    </div>
                    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 shadow-sm">
                        <p className="text-[10px] font-bold text-[#6B7280] tracking-[0.15em] uppercase mb-3">ACTIVE RUNBOOKS</p>
                        <div className="space-y-2">
                            {checklists.length > 0 ? checklists.map(checklist => (
                                <div key={checklist.id} className="flex items-center gap-2 group cursor-pointer">
                                    <ListChecks className="h-3 w-3 text-[#10B981]" />
                                    <span className="text-xs text-[#6B7280] group-hover:text-[#E2E8F0] truncate transition-colors font-semibold">{checklist.name}</span>
                                </div>
                            )) : (
                                <p className="text-[11px] text-[#6B7280] italic">No active runbooks detected.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
