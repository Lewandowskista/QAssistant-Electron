/**
 * Shared constants for the React frontend.
 * Import from here instead of scattering magic numbers throughout the codebase.
 */

/**
 * Z-index scale (single source of truth for stacking order).
 *
 * Use the matching `z-layer-*` utility classes in markup (defined in
 * index.css) rather than arbitrary `z-[N]` literals, so every overlay shares
 * one ordered scale. The numeric values here exist for the rare case where a
 * z-index must be set via inline style or passed to a library.
 *
 * Order (low -> high):
 *   STICKY    in-page sticky bars
 *   DROPDOWN  Radix select / dropdown / popover poppers
 *   OVERLAY   app drawers + command palette backdrops
 *   DRAWER    drawer content that sits above its own overlay
 *   DIALOG    Radix Dialog (overlay + content)
 *   CONFIRM   confirm dialogs — must sit ABOVE a Dialog that triggered them
 *   TOAST     transient toasts, above all surfaces
 *   SKIP_LINK accessibility skip link, always reachable
 */
export const Z = {
    STICKY: 30,
    DROPDOWN: 50,
    OVERLAY: 100,
    DRAWER: 120,
    DIALOG: 9999,
    CONFIRM: 10000,
    TOAST: 10010,
    SKIP_LINK: 10020,
} as const

/** Debounce delay for persisting project state to disk */
export const PROJECTS_SAVE_DEBOUNCE_MS = 1_000

/** Maximum items shown in dashboard recent-activity lists */
export const DASHBOARD_RECENT_LIMIT = 5

/** Delay before auto-focusing modal inputs (allows animation to settle) */
export const MODAL_FOCUS_DELAY_MS = 150

/** How long to show a "Copied!" feedback state on buttons */
export const COPY_FEEDBACK_DURATION_MS = 1_500

/** Debounce delay for saving the note title on keystroke */
export const NOTE_TITLE_DEBOUNCE_MS = 600

/** Debounce delay for saving the note content on keystroke */
export const NOTE_CONTENT_DEBOUNCE_MS = 800

/** Dialog close animation duration — wait this long before resetting dialog state */
export const DIALOG_CLOSE_ANIMATION_MS = 300
