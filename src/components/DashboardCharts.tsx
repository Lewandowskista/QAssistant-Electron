/**
 * DashboardCharts.tsx
 * Recharts-powered analytics charts for the QAssistant Dashboard.
 * Includes:
 *   1. Test Pass Rate Trend (line chart — per run session over time)
 *   2. Defect Density by SAP Module (bar chart — failed cases per module)
 *   3. Test Status Donut (pie chart)
 */
import { useMemo } from "react"
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import { useProjectStore } from "@/store/useProjectStore"

const COLORS = {
    passed: "#10B981",
    failed: "#EF4444",
    blocked: "#F59E0B",
    skipped: "#6B7280",
    "not-run": "#3B82F6",
    grid: "#2A2A3A",
    text: "#9CA3AF",
    purple: "#A78BFA",
}

const TooltipStyle = {
    contentStyle: {
        background: "#1A1A24",
        border: "1px solid #2A2A3A",
        borderRadius: "8px",
        fontSize: "11px",
        color: "#E2E8F0",
    },
    labelStyle: { color: "#9CA3AF", fontWeight: 700 },
}

export function PassRateTrendChart() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const data = useMemo(() => {
        const sessions = [...(activeProject?.testRunSessions || [])]
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-12)

        return sessions.map((session, i) => {
            const allExecs = session.planExecutions.flatMap(pe => pe.caseExecutions)
            const total = allExecs.length
            const passed = allExecs.filter(e => e.result === 'passed').length
            const failed = allExecs.filter(e => e.result === 'failed').length
            const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
            return {
                run: `Run ${i + 1}`,
                date: new Date(session.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                passRate,
                passed,
                failed,
                total,
            }
        })
    }, [activeProject])

    if (data.length < 2) {
        return (
            <div className="flex items-center justify-center h-full text-[11px] text-[#6B7280] italic">
                Run at least 2 test sessions to see the trend.
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="date" tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any) => [`${val}%`, "Pass Rate"]}
                />
                <Line
                    type="monotone"
                    dataKey="passRate"
                    stroke={COLORS.purple}
                    strokeWidth={2}
                    dot={{ fill: COLORS.purple, strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6, fill: COLORS.purple }}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}

export function DefectDensityChart() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const data = useMemo(() => {
        const moduleMap = new Map<string, { total: number; failed: number }>()

        for (const plan of activeProject?.testPlans || []) {
            for (const tc of plan.testCases || []) {
                const mod = tc.sapModule || 'General'
                const current = moduleMap.get(mod) || { total: 0, failed: 0 }
                moduleMap.set(mod, {
                    total: current.total + 1,
                    failed: current.failed + (tc.status === 'failed' ? 1 : 0)
                })
            }
        }

        return Array.from(moduleMap.entries())
            .map(([module, { total, failed }]) => ({
                module,
                failed,
                passed: total - failed,
                density: total > 0 ? Math.round((failed / total) * 100) : 0
            }))
            .filter(d => d.failed > 0 || d.passed > 0)
            .sort((a, b) => b.failed - a.failed)
            .slice(0, 8)
    }, [activeProject])

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[11px] text-[#6B7280] italic">
                No test cases with SAP modules found.
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis
                    dataKey="module"
                    tick={{ fill: COLORS.text, fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                />
                <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any, name: any) => [val, name === 'failed' ? 'Failed' : 'Passed']}
                />
                <Bar dataKey="passed" stackId="a" fill={COLORS.passed} radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" stackId="a" fill={COLORS.failed} radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    )
}

const DONUT_COLORS: Record<string, string> = {
    passed: COLORS.passed,
    failed: COLORS.failed,
    blocked: COLORS.blocked,
    skipped: COLORS.skipped,
    "not-run": COLORS["not-run"],
}

export function TestStatusDonut() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const data = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const plan of activeProject?.testPlans || []) {
            for (const tc of plan.testCases || []) {
                counts[tc.status] = (counts[tc.status] || 0) + 1
            }
        }
        return Object.entries(counts).map(([name, value]) => ({ name, value }))
    }, [activeProject])

    const total = data.reduce((s, d) => s + d.value, 0)

    if (total === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[11px] text-[#6B7280] italic">
                No test cases yet.
            </div>
        )
    }

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload?.length) {
            const { name, value } = payload[0].payload
            return (
                <div style={{ ...TooltipStyle.contentStyle, padding: '8px 12px' }}>
                    <p style={{ color: DONUT_COLORS[name] || '#E2E8F0', fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>{name}</p>
                    <p style={{ color: '#E2E8F0' }}>{value} cases ({total > 0 ? Math.round(value / total * 100) : 0}%)</p>
                </div>
            )
        }
        return null
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="75%"
                    paddingAngle={3}
                    dataKey="value"
                >
                    {data.map((entry, index) => (
                        <Cell key={index} fill={DONUT_COLORS[entry.name] || '#6B7280'} />
                    ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{value}</span>}
                />
            </PieChart>
        </ResponsiveContainer>
    )
}

export function ExecutionVelocityChart() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const data = useMemo(() => {
        const sessions = [...(activeProject?.testRunSessions || [])]
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-30) // Last 30 days

        // Group by date
        const byDate: Record<string, number> = {}
        sessions.forEach(session => {
            const date = new Date(session.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const execCount = session.planExecutions.reduce((sum, pe) => sum + pe.caseExecutions.length, 0)
            byDate[date] = (byDate[date] || 0) + execCount
        })

        return Object.entries(byDate).map(([date, count]) => ({
            date,
            executions: count,
        }))
    }, [activeProject])

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[11px] text-[#6B7280] italic">
                No execution data yet.
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="date" tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Executions', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any) => [val, "Test Cases Executed"]}
                    labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="executions" fill={COLORS.purple} radius={[8, 8, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    )
}

export function TestBurndownChart() {
    const { projects, activeProjectId } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const data = useMemo(() => {
        if (!activeProject) return []

        // Find active sprint
        const activeSprint = activeProject.tasks.find(t => t.sprint?.isActive)?.sprint
        if (!activeSprint) return []

        const sprintStart = new Date(activeSprint.startDate || 0)
        const sprintEnd = new Date(activeSprint.endDate || Date.now())

        // Get test cases that should be run in this sprint
        const sprintTestCases = activeProject.testPlans.flatMap(tp => tp.testCases)

        // Build burndown data by date
        const byDate: Record<string, number> = {}
        const dateRange = Math.ceil((sprintEnd.getTime() - sprintStart.getTime()) / (1000 * 3600 * 24)) + 1

        for (let i = 0; i < dateRange; i++) {
            const date = new Date(sprintStart)
            date.setDate(date.getDate() + i)
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            // Start with all test cases not run
            byDate[dateStr] = sprintTestCases.filter(tc => tc.status === 'not-run').length
        }

        // Count remaining (not-run) test cases across the sprint duration
        return Object.entries(byDate)
            .map(([date, count]) => ({
                date,
                remaining: count
            }))
            .slice(-14) // Last 14 days for clarity
    }, [activeProject])

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[11px] text-[#6B7280] italic">
                No active sprint or test cases.
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="date" tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: COLORS.text, fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Not Run', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any) => [val, "Test Cases Remaining"]}
                    labelFormatter={(label) => `${label}`}
                />
                <Line
                    type="monotone"
                    dataKey="remaining"
                    stroke={COLORS.purple}
                    strokeWidth={2}
                    dot={{ fill: COLORS.purple, r: 3 }}
                    activeDot={{ r: 5 }}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}
