/**
 * Shared constants for the React frontend.
 * Import from here instead of scattering magic numbers throughout the codebase.
 */

/** Z-index scale — use these tokens instead of z-[100] etc. */
export const Z = {
    OVERLAY: 100,
    MODAL_BACKDROP: 200,
    MODAL: 201,
    TOAST: 300,
} as const

/** Debounce delay for persisting project state to disk */
export const PROJECTS_SAVE_DEBOUNCE_MS = 1_000

/** Maximum items shown in dashboard recent-activity lists */
export const DASHBOARD_RECENT_LIMIT = 5

/** Delay before auto-focusing modal inputs (allows animation to settle) */
export const MODAL_FOCUS_DELAY_MS = 150

/** How long to show a "Copied!" feedback state on buttons */
export const COPY_FEEDBACK_DURATION_MS = 1_500
