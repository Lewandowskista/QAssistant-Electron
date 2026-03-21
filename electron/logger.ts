/**
 * Minimal structured logger for the Electron main process.
 *
 * Prefixes every message with an ISO timestamp and level tag.
 * In test environments (NODE_ENV=test) all output is suppressed to keep
 * test output clean.
 *
 * Usage:
 *   import { log } from './logger'
 *   log.info('[sync] workspace created')
 *   log.warn('[db] migration skipped')
 *   log.error('[auth] sign-in failed', err)
 */

const isSilent = process.env['NODE_ENV'] === 'test'

function ts(): string {
    return new Date().toISOString()
}

export const log = {
    info(...args: unknown[]): void {
        if (isSilent) return
        console.log(`[${ts()}] INFO`, ...args)
    },
    warn(...args: unknown[]): void {
        if (isSilent) return
        console.warn(`[${ts()}] WARN`, ...args)
    },
    error(...args: unknown[]): void {
        if (isSilent) return
        console.error(`[${ts()}] ERROR`, ...args)
    },
}
