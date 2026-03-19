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
                <PolarGrid stroke="#2A2A3A" />
                <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }}
                />
                <Radar
                    name="Score"
                    dataKey="score"
                    stroke="#A78BFA"
                    fill="#A78BFA"
                    fillOpacity={0.2}
                    strokeWidth={2}
                />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#13131A',
                        border: '1px solid #2A2A3A',
                        borderRadius: 8,
                        fontSize: 11,
                        color: '#E2E8F0'
                    }}
                    formatter={(value) => [`${value}/100`, 'Score']}
                />
            </RadarChart>
        </ResponsiveContainer>
    )
}
