import { describe, expect, it } from 'vitest'

import { OPEN_LAYER_SELECTORS, hasOpenLayer, overlayOwnsKeyboard, type LayerScope } from './overlays'

/** Records the selector it was asked for, and answers with a fixed result. */
function scope(found: boolean): LayerScope & { selector: string } {
    return {
        selector: '',
        querySelector(selectors: string) {
            this.selector = selectors
            return found ? {} : null
        },
    }
}

describe('overlay layer detection', () => {
    it('reports a layer when one matches', () => {
        expect(hasOpenLayer(scope(true))).toBe(true)
        expect(overlayOwnsKeyboard(scope(true))).toBe(true)
    })

    it('reports no layer when nothing matches', () => {
        expect(hasOpenLayer(scope(false))).toBe(false)
        expect(overlayOwnsKeyboard(scope(false))).toBe(false)
    })

    it('queries every known layer selector', () => {
        const s = scope(false)
        hasOpenLayer(s)
        for (const selector of OPEN_LAYER_SELECTORS) {
            expect(s.selector).toContain(selector)
        }
    })

    /*
     * The distinction the two predicates exist for. A dialog dismissed with
     * Escape stays mounted as `data-state="closed"` until its exit animation
     * ends; during that window it must not swallow the next Escape, but it may
     * still hold Radix's pointer-events lock.
     */
    it('excludes closing layers from keyboard ownership only', () => {
        const owns = scope(false)
        overlayOwnsKeyboard(owns)
        for (const selector of OPEN_LAYER_SELECTORS) {
            expect(owns.selector).toContain(`${selector}:not([data-state="closed"])`)
        }

        const present = scope(false)
        hasOpenLayer(present)
        expect(present.selector).not.toContain('data-state')
    })
})
