import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts"
import { AccuracyDimensionScore } from "@/types/project"
import { DIMENSION_LABELS } from "@/lib/accuracy"

interface DimensionRadarChartProps {
    dimensionScores: AccuracyDimensionScore[]
}

export function DimensionRadarChart({ dimensionScores }: DimensionRadarChartProps) {
    const data = dimensionScores.map(ds => ({
        dimension: DIMENSION_LABELS[ds.dimension],
        score: ds.score
    }))

    return (
        <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="hsl(var(--border-default))" />
                <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fill: 'hsl(var(--text-muted))', fontSize: 10, fontWeight: 700 }}
                />
                <Radar
                    name="Score"
                    dataKey="score"
                    stroke="hsl(var(--accent-primary))"
                    fill="hsl(var(--accent-primary))"
                    fillOpacity={0.2}
                    strokeWidth={2}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'hsl(var(--surface-card))',
                        border: '1px solid hsl(var(--border-default))',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'hsl(var(--text-primary))'
                    }}
                    formatter={(value) => [`${value}/100`, 'Score']}
                />
            </RadarChart>
        </ResponsiveContainer>
    )
}
