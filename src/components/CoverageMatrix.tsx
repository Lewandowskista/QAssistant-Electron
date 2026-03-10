import { useMemo, useState } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import type { TestCase } from "@/types/project"
import { cn } from "@/lib/utils"
import { ExternalLink, Download, Search, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ViewMode = 'issue' | 'module'

interface CoverageCell {
    covered: boolean
    passed: boolean
    failed: boolean
    caseCount: number
    cases: TestCase[]
}

export default function CoverageMatrix() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const [viewMode, setViewMode] = useState<ViewMode>('issue')
    const [searchQuery, setSearchQuery] = useState("")
    const [hoveredCell, setHoveredCell] = useState<{ row: string; col: string } | null>(null)

    const testPlans = useMemo(() => (activeProject?.testPlans || []).filter(tp => !tp.isArchived), [activeProject])

    // Build coverage data by Issue
    const issueMatrix = useMemo(() => {
        if (!activeProject) return { rows: [], cols: [], cells: new Map<string, CoverageCell>() }

        // Collect all unique sourceIssueIds from tasks + test cases
        const issueIds = new Set<string>()
        activeProject.tasks.forEach(t => {
            if (t.sourceIssueId) issueIds.add(t.sourceIssueId)
            if (t.externalId) issueIds.add(t.externalId)
        })
        testPlans.flatMap(tp => tp.testCases).forEach(tc => {
            if (tc.sourceIssueId) issueIds.add(tc.sourceIssueId)
        })

        // Build task lookup for display names
        const taskByIssueId = new Map<string, { title: string; status: string; priority: string; ticketUrl?: string }>()
        activeProject.tasks.forEach(t => {
            if (t.sourceIssueId) taskByIssueId.set(t.sourceIssueId, { title: t.title, status: t.status, priority: t.priority, ticketUrl: t.ticketUrl })
            if (t.externalId) taskByIssueId.set(t.externalId, { title: t.title, status: t.status, priority: t.priority, ticketUrl: t.ticketUrl })
        })

        const rows = Array.from(issueIds).filter(id => {
            if (!searchQuery.trim()) return true
            const task = taskByIssueId.get(id)
            return id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                task?.title.toLowerCase().includes(searchQuery.toLowerCase())
        }).map(id => ({
            id,
            label: id,
            task: taskByIssueId.get(id)
        }))

        const cols = testPlans.map(tp => ({ id: tp.id, name: tp.name, displayId: tp.displayId }))

        const cells = new Map<string, CoverageCell>()
        for (const row of rows) {
            for (const col of cols) {
                const plan = testPlans.find(tp => tp.id === col.id)!
                const linkedCases = plan.testCases.filter(tc => tc.sourceIssueId === row.id)
                const cell: CoverageCell = {
                    covered: linkedCases.length > 0,
                    passed: linkedCases.some(tc => tc.status === 'passed'),
                    failed: linkedCases.some(tc => tc.status === 'failed'),
                    caseCount: linkedCases.length,
                    cases: linkedCases
                }
                cells.set(`${row.id}::${col.id}`, cell)
            }
        }

        return { rows, cols, cells, taskByIssueId }
    }, [activeProject, testPlans, searchQuery])

    // Build coverage data by SAP Module
    const moduleMatrix = useMemo(() => {
        if (!activeProject) return { rows: [], cols: [], cells: new Map<string, CoverageCell>() }

        const modules = new Set<string>()
        testPlans.flatMap(tp => tp.testCases).forEach(tc => {
            if (tc.sapModule) modules.add(tc.sapModule)
        })

        const rows = Array.from(modules)
            .filter(m => !searchQuery.trim() || m.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(m => ({ id: m, label: m }))

        const cols = testPlans.map(tp => ({ id: tp.id, name: tp.name, displayId: tp.displayId }))

        const cells = new Map<string, CoverageCell>()
        for (const row of rows) {
            for (const col of cols) {
                const plan = testPlans.find(tp => tp.id === col.id)!
                const linkedCases = plan.testCases.filter(tc => tc.sapModule === row.id)
                const cell: CoverageCell = {
                    covered: linkedCases.length > 0,
                    passed: linkedCases.some(tc => tc.status === 'passed'),
                    failed: linkedCases.some(tc => tc.status === 'failed'),
                    caseCount: linkedCases.length,
                    cases: linkedCases
                }
                cells.set(`${row.id}::${col.id}`, cell)
            }
        }

        return { rows, cols, cells }
    }, [activeProject, testPlans, searchQuery])

    const matrix = viewMode === 'issue' ? issueMatrix : moduleMatrix

    const exportCsv = () => {
        const header = ['', ...matrix.cols.map(c => c.name)].join(',')
        const bodyRows = matrix.rows.map(row => {
            const cells = matrix.cols.map(col => {
                const cell = matrix.cells.get(`${row.id}::${col.id}`)
                if (!cell?.covered) return 'No Coverage'
                if (cell.failed) return `FAILED (${cell.caseCount})`
                if (cell.passed) return `PASSED (${cell.caseCount})`
                return `NOT RUN (${cell.caseCount})`
            })
            return [row.label, ...cells].join(',')
        })
        const csv = [header, ...bodyRows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'coverage-matrix.csv'
        a.click()
    }

    const getCellStyle = (cell: CoverageCell | undefined) => {
        if (!cell?.covered) return "bg-[#1A1A24] text-[#4B5563] border-[#2A2A3A]"
        if (cell.failed)    return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20"
        if (cell.passed)    return "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20"
        return "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20"
    }

    const getCellLabel = (cell: CoverageCell | undefined) => {
        if (!cell?.covered) return "–"
        if (cell.failed)    return `✗ ${cell.caseCount}`
        if (cell.passed)    return `✓ ${cell.caseCount}`
        return `○ ${cell.caseCount}`
    }

    if (!activeProject || testPlans.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center opacity-40">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center mb-4">
                    <Info className="h-8 w-8 text-[#6B7280]" strokeWidth={1} />
                </div>
                <h3 className="text-lg font-bold text-[#E2E8F0]">No Test Plans</h3>
                <p className="text-sm text-[#6B7280] max-w-sm mt-2">
                    Create test plans with cases linked to issues to see coverage.
                </p>
            </div>
        )
    }

    if (matrix.rows.length === 0) {
        return (
            <div className="flex-1 flex flex-col min-h-0">
                {/* Toolbar */}
                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center gap-4">
                    <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                        <button onClick={() => setViewMode('issue')} className={cn("h-7 px-3 text-[10px] font-bold rounded transition-all", viewMode === 'issue' ? "bg-[#A78BFA]/10 text-[#A78BFA]" : "text-[#6B7280] hover:text-[#E2E8F0]")}>By Issue</button>
                        <button onClick={() => setViewMode('module')} className={cn("h-7 px-3 text-[10px] font-bold rounded transition-all", viewMode === 'module' ? "bg-[#A78BFA]/10 text-[#A78BFA]" : "text-[#6B7280] hover:text-[#E2E8F0]")}>By SAP Module</button>
                    </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 p-16">
                    <p className="text-sm font-semibold text-[#E2E8F0]">
                        {viewMode === 'issue'
                            ? "No test cases linked to issues. Set sourceIssueId on test cases."
                            : "No test cases have SAP Module assigned."}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center gap-4">
                <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                    <button onClick={() => setViewMode('issue')} className={cn("h-7 px-3 text-[10px] font-bold rounded transition-all", viewMode === 'issue' ? "bg-[#A78BFA]/10 text-[#A78BFA]" : "text-[#6B7280] hover:text-[#E2E8F0]")}>By Issue</button>
                    <button onClick={() => setViewMode('module')} className={cn("h-7 px-3 text-[10px] font-bold rounded transition-all", viewMode === 'module' ? "bg-[#A78BFA]/10 text-[#A78BFA]" : "text-[#6B7280] hover:text-[#E2E8F0]")}>By SAP Module</button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6B7280]" />
                    <Input
                        placeholder={viewMode === 'issue' ? "Filter issues..." : "Filter modules..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-9 pl-8 w-52 bg-[#1A1A24] border-[#2A2A3A] text-xs"
                    />
                </div>
                <div className="ml-auto flex items-center gap-3">
                    {/* Legend */}
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1 text-[#10B981]"><span className="w-3 h-3 rounded bg-[#10B981]/20 border border-[#10B981]/30 inline-block" /> All Passed</span>
                        <span className="flex items-center gap-1 text-[#EF4444]"><span className="w-3 h-3 rounded bg-[#EF4444]/20 border border-[#EF4444]/30 inline-block" /> Has Failures</span>
                        <span className="flex items-center gap-1 text-[#3B82F6]"><span className="w-3 h-3 rounded bg-[#3B82F6]/20 border border-[#3B82F6]/30 inline-block" /> Not Run Yet</span>
                        <span className="flex items-center gap-1 text-[#4B5563]"><span className="w-3 h-3 rounded bg-[#1A1A24] border border-[#2A2A3A] inline-block" /> No Coverage</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 border-[#2A2A3A] text-[#6B7280] text-[10px] font-bold gap-2 hover:bg-[#A78BFA]/10 hover:text-[#A78BFA]">
                        <Download className="h-3 w-3" /> Export CSV
                    </Button>
                </div>
            </div>

            {/* Matrix Table */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4">
                <div className="inline-block min-w-full">
                    <table className="border-collapse text-xs">
                        <thead>
                            <tr>
                                {/* Corner header */}
                                <th className="sticky left-0 z-20 bg-[#0F0F13] p-3 text-left min-w-[220px] border border-[#2A2A3A]">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                                        {viewMode === 'issue' ? 'Issue / Requirement' : 'SAP Module'}
                                    </span>
                                </th>
                                {matrix.cols.map(col => (
                                    <th key={col.id} className="p-3 text-center border border-[#2A2A3A] bg-[#13131A] min-w-[130px]">
                                        <div className="font-mono text-[9px] text-[#A78BFA] font-bold">{col.displayId}</div>
                                        <div className="text-[10px] text-[#E2E8F0] font-semibold truncate max-w-[120px] mt-0.5" title={col.name}>{col.name}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.rows.map(row => {
                                const task = (matrix as any).taskByIssueId?.get(row.id)
                                const totalCovered = matrix.cols.filter(col => matrix.cells.get(`${row.id}::${col.id}`)?.covered).length
                                const coveragePct = matrix.cols.length > 0 ? Math.round((totalCovered / matrix.cols.length) * 100) : 0

                                return (
                                    <tr key={row.id} className="group hover:bg-[#1A1A24]/30 transition-colors">
                                        {/* Row Header */}
                                        <td className="sticky left-0 z-10 bg-[#0F0F13] group-hover:bg-[#1A1A24]/50 p-3 border border-[#2A2A3A] transition-colors">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[11px] text-[#A78BFA] font-bold">{row.id}</span>
                                                    {task?.ticketUrl && (
                                                        <a href={task.ticketUrl} target="_blank" rel="noopener noreferrer" className="text-[#6B7280] hover:text-[#A78BFA] transition-colors">
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    )}
                                                </div>
                                                {task && (
                                                    <span className="text-[10px] text-[#9CA3AF] truncate max-w-[200px]" title={task.title}>{task.title}</span>
                                                )}
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <div className="h-1 w-20 bg-[#1A1A24] rounded-full overflow-hidden">
                                                        <div className="h-full bg-[#10B981] rounded-full" style={{ width: `${coveragePct}%` }} />
                                                    </div>
                                                    <span className="text-[9px] text-[#6B7280] font-bold">{coveragePct}%</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Data Cells */}
                                        {matrix.cols.map(col => {
                                            const cell = matrix.cells.get(`${row.id}::${col.id}`)
                                            const key = `${row.id}::${col.id}`
                                            const isHovered = hoveredCell?.row === row.id && hoveredCell?.col === col.id

                                            return (
                                                <td
                                                    key={col.id}
                                                    className={cn(
                                                        "p-2 text-center border transition-all cursor-default relative",
                                                        getCellStyle(cell),
                                                        isHovered && "scale-105"
                                                    )}
                                                    onMouseEnter={() => setHoveredCell({ row: row.id, col: col.id })}
                                                    onMouseLeave={() => setHoveredCell(null)}
                                                >
                                                    <span className="text-[13px] font-bold">{getCellLabel(cell)}</span>
                                                    {/* Tooltip */}
                                                    {isHovered && cell?.covered && cell.cases.length > 0 && (
                                                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg p-3 text-left min-w-[200px] shadow-2xl pointer-events-none">
                                                            <p className="text-[10px] font-bold text-[#6B7280] uppercase mb-1.5">Test Cases</p>
                                                            {cell.cases.slice(0, 4).map(tc => (
                                                                <div key={tc.id} className="flex items-center gap-1.5 py-0.5">
                                                                    <span className={cn("w-1.5 h-1.5 rounded-full flex-none", tc.status === 'passed' ? "bg-[#10B981]" : tc.status === 'failed' ? "bg-[#EF4444]" : "bg-[#6B7280]")} />
                                                                    <span className="text-[10px] text-[#E2E8F0] truncate">{tc.title}</span>
                                                                </div>
                                                            ))}
                                                            {cell.cases.length > 4 && <p className="text-[9px] text-[#6B7280] mt-1">+{cell.cases.length - 4} more</p>}
                                                        </div>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Summary footer */}
                <div className="mt-4 flex items-center gap-6 text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">
                    <span>{matrix.rows.length} {viewMode === 'issue' ? 'issues' : 'modules'}</span>
                    <span>{matrix.cols.length} test plans</span>
                    <span>{Array.from(matrix.cells.values()).filter(c => c.covered).length} cells covered</span>
                    <span>{Array.from(matrix.cells.values()).filter(c => c.failed).length} with failures</span>
                </div>
            </div>
        </div>
    )
}
