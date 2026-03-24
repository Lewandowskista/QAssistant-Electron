import { describe, expect, it } from 'vitest'
import { normalizePullRequestAnalysisResult } from './prAnalysis'

describe('normalizePullRequestAnalysisResult', () => {
    it('returns a stable PR analysis result when the model output is partial', () => {
        const result = normalizePullRequestAnalysisResult({
            summary: 'Touches checkout totals and discount validation.',
            qaChecks: ['Verify recalculation on cart refresh', 'Verify discount removal edge case'],
        })

        expect(result.summary).toContain('Touches checkout totals')
        expect(result.riskLevel).toBe('medium')
        expect(result.qaChecks).toHaveLength(2)
        expect(result.impactedCaseIds).toEqual([])
        expect(result.hotspots).toEqual([])
    })

    it('normalizes impacted tests, hotspots, and risk level from a full payload', () => {
        const result = normalizePullRequestAnalysisResult({
            summary: 'Updates promotion evaluation and order review totals.',
            riskLevel: 'high',
            hotspots: [
                { file: 'src/checkout/promo.ts', reason: 'Promotion eligibility logic changed.' },
                { file: 'src/checkout/review.tsx', reason: 'Displayed total now depends on new state.' },
            ],
            affectedAreas: ['checkout', 'promotions'],
            qaChecks: ['Verify stacked promo codes on guest checkout.'],
            impactedCaseIds: ['tc-1', 'tc-2'],
            rationale: 'Existing checkout coverage maps cleanly to the modified files.',
        })

        expect(result.riskLevel).toBe('high')
        expect(result.hotspots).toHaveLength(2)
        expect(result.affectedAreas).toEqual(['checkout', 'promotions'])
        expect(result.impactedCaseIds).toEqual(['tc-1', 'tc-2'])
        expect(result.rationale).toContain('coverage maps cleanly')
    })

    it('filters malformed values and falls back safely', () => {
        const result = normalizePullRequestAnalysisResult({
            summary: '',
            riskLevel: 'severe',
            hotspots: [{ file: '', reason: 'missing file' }, { file: 'src/a.ts', reason: 42 }],
            affectedAreas: ['catalog', 'catalog', 123],
            qaChecks: ['  ', 'Verify product detail render.'],
            impactedCaseIds: ['tc-1', 2, 'tc-1'],
        })

        expect(result.summary).toBe('PR analysis completed with limited detail.')
        expect(result.riskLevel).toBe('medium')
        expect(result.hotspots).toEqual([])
        expect(result.affectedAreas).toEqual(['catalog'])
        expect(result.qaChecks).toEqual(['Verify product detail render.'])
        expect(result.impactedCaseIds).toEqual(['tc-1'])
    })
})
