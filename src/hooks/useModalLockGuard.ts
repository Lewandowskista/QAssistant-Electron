import { useEffect } from 'react'

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
     * this guard permanently believe a layer is open, in exactly the case it
     * exists to fix. Every selector here is scoped to layer *content*, which is
     * unmounted with the layer.
     */
] as const

const OPEN_LAYER_SELECTOR = OPEN_LAYER_SELECTORS.join(',')

// 200ms x CLEAN_POLLS_REQUIRED bounds how long input stays dead if a lock is
// orphaned. Kept short because that window is a visible freeze to the user, but not
// so short that a layer hand-off is mistaken for a leak.
const POLL_MS = 200

/**
 * Consecutive clean polls required before clearing. Handing off between two layers
 * (closing a menu to open a dialog) leaves a brief window where the lock is set but
 * no layer is mounted; clearing there desynchronises Radix's counter and leaves the
 * *next* dialog non-modal. Requiring the condition to persist rides out that gap.
 */
export const CLEAN_POLLS_REQUIRED = 3

/** Scope abstraction so the query can be exercised without a DOM in tests. */
export interface LayerScope {
    querySelector(selectors: string): unknown
}

export function hasOpenLayer(scope: LayerScope = document): boolean {
    return scope.querySelector(OPEN_LAYER_SELECTOR) !== null
}

/**
 * Whether an orphaned lock should be cleared: the body is locked but nothing is
 * actually open to justify it.
 */
export function shouldClearLock(locked: boolean, layerOpen: boolean): boolean {
    return locked && !layerOpen
}

function isLocked(): boolean {
    return document.body.style.pointerEvents === 'none'
}

/**
 * Repairs an orphaned Radix modal lock that would otherwise freeze the whole window.
 *
 * Radix sets `body { pointer-events: none }` while a modal layer is open and restores
 * it only when its internal layer counter returns to zero. If a destructive action
 * unmounts a trigger's subtree while layers are still unwinding — deleting the last
 * project from the project menu was one such path — a layer can fail to deregister.
 * The style is then stuck: the app still renders and its event loop is healthy, but
 * every click is swallowed and nothing is logged, which is indistinguishable from a
 * hard freeze.
 *
 * This watches for that state and clears the lock only when no layer is actually
 * open, so it cannot fight Radix during a legitimate open/close. It is a backstop —
 * call sites should still avoid unmounting a trigger mid-teardown (see `useConfirm`).
 */
export function useModalLockGuard(): void {
    useEffect(() => {
        let timer: ReturnType<typeof setInterval> | null = null
        let cleanPolls = 0

        const stop = () => {
            if (timer !== null) {
                clearInterval(timer)
                timer = null
            }
            cleanPolls = 0
        }

        const check = () => {
            if (!isLocked()) { stop(); return }
            // A layer is up: this lock is legitimate. Keep watching rather than
            // clearing, because the leak shows up only once the last layer is gone.
            if (!shouldClearLock(true, hasOpenLayer())) { cleanPolls = 0; return }

            // Only act once the lock has outlived any plausible layer hand-off.
            if (++cleanPolls < CLEAN_POLLS_REQUIRED) return

            document.body.style.removeProperty('pointer-events')
            // Leave a trace: this should not happen, and silently repairing it would
            // hide a real regression at whichever call site caused it.
            console.warn('[modal-lock-guard] cleared an orphaned body{pointer-events:none} with no open Radix layer')
            stop()
        }

        // Poll only while a lock is present; self-terminates once resolved. A
        // MutationObserver alone is not enough — the leak leaves the attribute
        // untouched, so there is no mutation to react to at the moment it goes bad.
        const start = () => {
            if (timer === null) timer = setInterval(check, POLL_MS)
        }

        const observer = new MutationObserver(() => { if (isLocked()) start() })
        observer.observe(document.body, { attributes: true, attributeFilter: ['style'] })

        // Also cover mounting into an already-stuck state (e.g. after a hot reload).
        if (isLocked()) start()

        return () => { observer.disconnect(); stop() }
    }, [])
}

/**
 * Mountable form of {@link useModalLockGuard}, for use at the app root where there is
 * no existing component to hang the hook on. Renders nothing.
 */
export function ModalLockGuard(): null {
    useModalLockGuard()
    return null
}
