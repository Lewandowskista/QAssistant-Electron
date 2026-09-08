/**
 * One place that answers "is an overlay currently on top?".
 *
 * Two unrelated features need that answer and used to guess at it separately:
 *
 *  - `useModalLockGuard`, to tell an orphaned Radix pointer-events lock from a
 *    legitimate one.
 *  - Window-level keyboard handlers (the task board's Escape, the GitHub list's
 *    j/k/o/Enter/Escape). Those listen on `window`, so they also fire for keys a
 *    dialog or menu is already handling. Without this check, dismissing a modal
 *    with Escape *also* ran the page's Escape behaviour behind it — closing the
 *    New Task modal deselected the task whose inspector was open — and typing
 *    "j" into an open menu moved the list underneath.
 *
 * The rule is: the topmost layer owns the key. A page only handles keys that
 * reach it with nothing overlaid.
 */

/**
 * Selectors that indicate a Radix modal/popover layer is genuinely open.
 *
 * Deliberately narrow: `[data-state="open"]` alone is unusable here because Radix
 * also stamps it on *triggers*, accordions and collapsibles, so a closed menu whose
 * button is still marked open would look like a live layer forever. These match only
 * rendered layer content.
 */
export const OPEN_LAYER_SELECTORS = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[data-radix-popper-content-wrapper]',
    '[data-radix-menu-content]',
    '[data-radix-select-content]',
    /*
     * Deliberately NOT '[data-radix-focus-guard]'. Radix's focus guards are
     * body-level spans removed by the same reference counting that strands
     * `body { pointer-events: none }`. When a layer fails to deregister, the
     * guards leak too — so treating them as evidence of an open layer would make
     * the lock guard permanently believe a layer is open, in exactly the case it
     * exists to fix. Every selector here is scoped to layer *content*, which is
     * unmounted with the layer.
     */
] as const

const OPEN_LAYER_SELECTOR = OPEN_LAYER_SELECTORS.join(',')

/**
 * The same layers, minus any that Radix has already marked closed and is only
 * keeping mounted to finish its exit animation.
 */
const LIVE_LAYER_SELECTOR = OPEN_LAYER_SELECTORS
    .map((selector) => `${selector}:not([data-state="closed"])`)
    .join(',')

/** Scope abstraction so the query can be exercised without a DOM in tests. */
export interface LayerScope {
    querySelector(selectors: string): unknown
}

/**
 * Is any layer element mounted — including one animating out?
 *
 * This is the conservative reading, and the one the modal-lock guard wants: a
 * layer mid-teardown may still hold Radix's pointer-events lock, so treating it
 * as present keeps the guard from clearing a lock that is about to be released
 * legitimately.
 */
export function hasOpenLayer(scope: LayerScope = document): boolean {
    return scope.querySelector(OPEN_LAYER_SELECTOR) !== null
}

/**
 * Is a layer actually *up* and therefore entitled to this keypress?
 *
 * Distinct from {@link hasOpenLayer} because of what Escape does. Dismissing a
 * dialog leaves its element in the DOM, marked `data-state="closed"`, until the
 * exit animation ends. Keying off mere presence made the *next* Escape a dead
 * key for a couple of hundred milliseconds — press Escape twice to close a
 * dialog and then the inspector behind it, and the second press did nothing.
 * A layer on its way out has already given the keyboard back.
 */
export function overlayOwnsKeyboard(scope: LayerScope = document): boolean {
    return scope.querySelector(LIVE_LAYER_SELECTOR) !== null
}
