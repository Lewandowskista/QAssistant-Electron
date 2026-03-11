/**
 * Shared constants for the Electron main process.
 * Import from here instead of scattering magic numbers throughout the codebase.
 */

/** Minimum milliseconds between AI API calls per channel (rate limiter) */
export const AI_RATE_LIMIT_MS = 3_000

/** Default HTTP request timeout for external APIs (Linear, Jira, Gemini, SAP HAC) */
export const REQUEST_TIMEOUT_MS = 30_000

/** Timeout for long-running AI generation calls */
export const AI_GENERATION_TIMEOUT_MS = 60_000

/** Maximum number of cached SAP HAC service instances before evicting the oldest */
export const MAX_SAP_HAC_INSTANCES = 10

/** Default port for the local Automation API server */
export const AUTOMATION_API_DEFAULT_PORT = 3_030

/** Cooldown between repeat reminder notifications for the same task (4 hours) */
export const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1_000

/** Maximum file size allowed for attachments (50 MB) */
export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024
