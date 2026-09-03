/**
 * Tests for display-id generation.
 *
 * These ids are the handle a human uses and, more importantly, the key the
 * automation API resolves an incoming result by: POST /api/results looks up the
 * first test case whose displayId matches. A duplicate therefore does not just
 * look untidy — it routes a CI result to the wrong test case.
 */
import { describe, it, expect } from 'vitest'
import { nextDisplayId } from './useProjectStore'

describe('nextDisplayId', () => {
    it('formats as PREFIX-001, not with the prefix padded', () => {
        // The previous implementation was `TC-${n}`.padStart(6, '0'), and
        // padStart pads the whole string — so it produced "00TC-1".
        expect(nextDisplayId('TC', [])).toBe('TC-001')
        expect(nextDisplayId('TP', [])).toBe('TP-001')
    })

    it('continues from the highest number present', () => {
        expect(nextDisplayId('TC', [
            { displayId: 'TC-001' },
            { displayId: 'TC-002' },
            { displayId: 'TC-003' },
        ])).toBe('TC-004')
    })

    it('does not reuse an id after a deletion', () => {
        // Deriving from the collection's length meant deleting TC-002 and adding
        // a case produced a second TC-003.
        const afterDeletingTheMiddleOne = [{ displayId: 'TC-001' }, { displayId: 'TC-003' }]
        expect(nextDisplayId('TC', afterDeletingTheMiddleOne)).toBe('TC-004')
    })

    it('ignores ids belonging to a different prefix', () => {
        expect(nextDisplayId('TC', [
            { displayId: 'TP-009' },
            { displayId: 'TC-002' },
        ])).toBe('TC-003')
    })

    it('ignores unparseable and missing ids rather than throwing', () => {
        expect(nextDisplayId('TC', [
            { displayId: 'TC-002' },
            { displayId: 'legacy-imported-case' },
            { displayId: undefined },
            {},
        ])).toBe('TC-003')
    })

    it('keeps counting past three digits without truncating', () => {
        expect(nextDisplayId('TC', [{ displayId: 'TC-999' }])).toBe('TC-1000')
    })

    it('is not confused by the old malformed ids', () => {
        // Existing databases contain "00TC-1"-style values. They do not match the
        // pattern, so they are skipped and numbering starts cleanly.
        expect(nextDisplayId('TC', [{ displayId: '00TC-1' }, { displayId: '00TC-2' }])).toBe('TC-001')
    })

    it('produces a unique id when applied repeatedly', () => {
        const cases: Array<{ displayId: string }> = []
        for (let i = 0; i < 25; i++) {
            cases.push({ displayId: nextDisplayId('TC', cases) })
        }
        expect(new Set(cases.map(c => c.displayId)).size).toBe(25)
        expect(cases[24].displayId).toBe('TC-025')
    })
})
