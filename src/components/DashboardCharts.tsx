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
import { useActiveProject } from "@/store/useProjectStore"

const COLORS = {
    passed: "#10B981",
    failed: "#EF4444",
    blocked: "#F59E0B",
    skipped: "#94A3B8",
    "not-run": "#38BDF8",
    grid: "rgba(148, 163, 184, 0.12)",
    gridStrong: "rgba(148, 163, 184, 0.22)",
    text: "#94A3B8",
    textStrong: "#CBD5E1",
    brand: "#7DD3FC",
    brandStrong: "#38BDF8",
    brandSoft: "rgba(56, 189, 248, 0.16)",
    violet: "#A78BFA",
    violetSoft: "rgba(167, 139, 250, 0.18)",
    panel: "rgba(15, 23, 42, 0.94)",
}

const TooltipStyle = {
    contentStyle: {
        background: COLORS.panel,
        border: `1px solid ${COLORS.gridStrong}`,
        borderRadius: "14px",
        fontSize: "11px",
        color: "#E2E8F0",
        boxShadow: "0 18px 48px -24px rgba(2, 6, 23, 0.95)",
        backdropFilter: "blur(10px)",
    },
    labelStyle: { color: COLORS.textStrong, fontWeight: 700 },
    itemStyle: { color: "#E2E8F0" },
    cursor: { fill: "transparent" },
}

const axisTick = { fill: COLORS.text, fontSize: 10, fontWeight: 600 }
const gridProps = { stroke: COLORS.grid, strokeDasharray: "3 6" }

function ChartFrame({ id }: { id: string }) {
    return (
        <defs>
            <linearGradient id={`${id}-line`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.brandStrong} />
                <stop offset="100%" stopColor={COLORS.violet} />
            </linearGradient>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(125, 211, 252, 0.28)" />
                <stop offset="100%" stopColor="rgba(125, 211, 252, 0)" />
            </linearGradient>
            <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.brandStrong} />
                <stop offset="100%" stopColor={COLORS.violet} />
            </linearGradient>
        </defs>
    )
}

export function PassRateTrendChart() {
    const activeProject = useActiveProject()

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
                <ChartFrame id="pass-rate" />
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any) => [`${val}%`, "Pass Rate"]}
                />
                <Line
                    type="monotone"
                    dataKey="passRate"
                    stroke="url(#pass-rate-line)"
                    strokeWidth={3}
                    dot={{ fill: COLORS.brandStrong, stroke: "#0F172A", strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: COLORS.brandStrong, stroke: "#E2E8F0", strokeWidth: 2 }}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}

export function DefectDensityChart() {
    const activeProject = useActiveProject()

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
                <ChartFrame id="defect-density" />
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis
                    dataKey="module"
                    tick={{ ...axisTick, fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any, name: any) => [val, name === 'failed' ? 'Failed' : 'Passed']}
                />
                <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ color: COLORS.text, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{value}</span>}
                />
                <Bar dataKey="passed" stackId="a" fill="rgba(16, 185, 129, 0.78)" radius={[0, 0, 10, 10]} />
                <Bar dataKey="failed" stackId="a" fill="rgba(239, 68, 68, 0.92)" radius={[10, 10, 0, 0]} />
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
    const activeProject = useActiveProject()

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
                    innerRadius="58%"
                    outerRadius="78%"
                    paddingAngle={4}
                    dataKey="value"
                    stroke="rgba(15, 23, 42, 0.85)"
                    strokeWidth={3}
                >
                    {data.map((entry, index) => (
                        <Cell key={index} fill={DONUT_COLORS[entry.name] || '#6B7280'} />
                    ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ color: COLORS.text, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{value}</span>}
                />
            </PieChart>
        </ResponsiveContainer>
    )
}

export function ExecutionVelocityChart() {
    const activeProject = useActiveProject()

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
                <ChartFrame id="execution-velocity" />
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} label={{ value: 'Executions', angle: -90, position: 'insideLeft', fill: COLORS.text, fontSize: 10 }} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any) => [val, "Test Cases Executed"]}
                    labelFormatter={(label) => `${label}`}
                />
                <Bar dataKey="executions" fill="url(#execution-velocity-bar)" radius={[12, 12, 4, 4]} />
            </BarChart>
        </ResponsiveContainer>
    )
}

export function TestBurndownChart() {
    const activeProject = useActiveProject()

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
                <ChartFrame id="burndown" />
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} label={{ value: 'Not Run', angle: -90, position: 'insideLeft', fill: COLORS.text, fontSize: 10 }} />
                <Tooltip
                    {...TooltipStyle}
                    formatter={(val: any) => [val, "Test Cases Remaining"]}
                    labelFormatter={(label) => `${label}`}
                />
                <Line
                    type="monotone"
                    dataKey="remaining"
                    stroke="url(#burndown-line)"
                    strokeWidth={3}
                    dot={{ fill: COLORS.violet, stroke: "#0F172A", strokeWidth: 2, r: 3.5 }}
                    activeDot={{ r: 6, fill: COLORS.violet, stroke: "#E2E8F0", strokeWidth: 2 }}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}
