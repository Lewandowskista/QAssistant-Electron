import { describe, expect, it } from 'vitest'
import { CLEAN_POLLS_REQUIRED, OPEN_LAYER_SELECTORS, hasOpenLayer, shouldClearLock, type LayerScope } from './useModalLockGuard'

/** Minimal stand-in for a document: reports which selectors "match". */
function scopeMatching(present: string[]): LayerScope & { asked: string[] } {
    const asked: string[] = []
    return {
        asked,
        querySelector(selectors: string) {
            asked.push(selectors)
            return selectors.split(',').some(s => present.includes(s.trim())) ? {} : null
        },
    }
}

describe('open-layer detection', () => {
    it('treats a rendered alertdialog as an open layer', () => {
        expect(hasOpenLayer(scopeMatching(['[role="alertdialog"]']))).toBe(true)
    })

    it('treats positioned menu/popover content as an open layer', () => {
        expect(hasOpenLayer(scopeMatching(['[data-radix-popper-content-wrapper]']))).toBe(true)
        expect(hasOpenLayer(scopeMatching(['[data-radix-menu-content]']))).toBe(true)
    })

    it('reports no layer when nothing is rendered', () => {
        expect(hasOpenLayer(scopeMatching([]))).toBe(false)
    })

    it('never keys off a bare [data-state="open"]', () => {
        // Radix stamps data-state="open" on triggers, accordions and collapsibles too.
        // Matching it would make a closed menu whose button is still marked open look
        // like a live layer forever, so the guard could never repair the lock.
        for (const sel of OPEN_LAYER_SELECTORS) {
            expect(sel).not.toBe('[data-state="open"]')
        }
        expect(OPEN_LAYER_SELECTORS.join(',')).not.toMatch(/(^|,)\s*\[data-state="open"\]\s*(,|$)/)
    })

    it('queries every known layer marker in one pass', () => {
        const scope = scopeMatching([])
        hasOpenLayer(scope)
        expect(scope.asked).toHaveLength(1)
        for (const sel of OPEN_LAYER_SELECTORS) expect(scope.asked[0]).toContain(sel)
    })
})

describe('lock-clearing decision', () => {
    it('clears only when locked with no layer open', () => {
        expect(shouldClearLock(true, false)).toBe(true)
    })

    it('leaves a legitimate lock alone while a layer is open', () => {
        // Clearing here would fight Radix mid-open and break modal behaviour.
        expect(shouldClearLock(true, true)).toBe(false)
    })

    it('does nothing when the body is not locked', () => {
        expect(shouldClearLock(false, false)).toBe(false)
        expect(shouldClearLock(false, true)).toBe(false)
    })
})

describe('transition tolerance', () => {
    it('requires several consecutive clean polls before clearing', () => {
        // Closing a menu to open a dialog briefly leaves the lock set with no layer
        // mounted. Clearing in that window desynchronises Radix's counter and leaves
        // the next dialog non-modal, which is how the first version of this guard
        // broke the delete-confirmation dialog.
        expect(CLEAN_POLLS_REQUIRED).toBeGreaterThan(1)
    })
})
