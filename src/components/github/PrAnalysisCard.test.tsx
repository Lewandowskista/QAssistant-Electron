import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrAnalysisCard } from './PrAnalysisCard'
import type { AiPullRequestAnalysisResult } from '@/types/ai'
import type { TestCase } from '@/types/project'

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock('lucide-react', () => {
    const Icon = () => <span />
    return {
        CheckCircle2: Icon,
        Loader2: Icon,
        Sparkles: Icon,
        Zap: Icon,
    }
})

const baseAnalysis: AiPullRequestAnalysisResult = {
    summary: 'Checkout pricing paths changed and need targeted regression.',
    riskLevel: 'high',
    hotspots: [{ file: 'src/checkout/price.ts', reason: 'Discount math changed.' }],
    affectedAreas: ['checkout'],
    qaChecks: ['Verify guest checkout with and without promo codes.'],
    impactedCaseIds: [],
    rationale: 'The diff touches shared checkout totals logic.',
}

const testCases: TestCase[] = [
    {
        id: 'tc-1',
        displayId: 'TC-1',
        title: 'Guest checkout with promo code',
        preConditions: '',
        steps: '',
        testData: '',
        expectedResult: '',
        actualResult: '',
        priority: 'major',
        status: 'not-run',
        updatedAt: Date.now(),
    },
]

function renderCard(analysis: AiPullRequestAnalysisResult) {
    return renderToStaticMarkup(
        <PrAnalysisCard
            analysis={analysis}
            isAnalyzing={false}
            onAnalyze={vi.fn()}
            projectTestCases={testCases}
            selectedImpactedIds={new Set(analysis.impactedCaseIds)}
            onToggleImpactedId={vi.fn()}
            onBuildRegressionSuite={vi.fn()}
            isBuildingRegressionSuite={false}
        />
    )
}

describe('PrAnalysisCard', () => {
    it('shows the new Analyze PR CTA and qa-focused output even without impacted tests', () => {
        const html = renderCard(baseAnalysis)

        expect(html).toContain('Analyze PR')
        expect(html).toContain('Suggested QA Checks')
        expect(html).toContain('Checkout pricing paths changed')
        expect(html).toContain('No existing project tests matched this PR')
        expect(html).not.toContain('Build Regression Suite')
        expect(html).not.toContain('No test cases in project to analyze')
    })

    it('shows rerunnable impacted tests and the regression action when matches exist', () => {
        const html = renderCard({
            ...baseAnalysis,
            impactedCaseIds: ['tc-1'],
        })

        expect(html).toContain('TC-1 - Guest checkout with promo code')
        expect(html).toContain('Build Regression Suite (1)')
    })
})
