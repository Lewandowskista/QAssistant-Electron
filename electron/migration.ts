/**
 * migration.ts — One-time migration from projects.json to SQLite
 *
 * Called during app startup. If projects.json exists and the SQLite DB has no
 * projects yet, we read the JSON and import it into SQLite, then rename the
 * JSON file to projects.json.migrated so the user's data is preserved.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { getDb, saveAllProjects } from './database'
import { log } from './logger'

/**
 * True if the SQLite database already holds at least one project.
 *
 * If the check itself fails we report `true` (i.e. "assume populated") so the
 * import is skipped: leaving the legacy JSON in place is recoverable, whereas
 * overwriting live data is not.
 */
function databaseHasProjects(): boolean {
    try {
        return getDb().prepare('SELECT 1 FROM projects LIMIT 1').get() !== undefined
    } catch (e) {
        log.error('[migration] Could not check for existing projects — skipping import:', e)
        return true
    }
}

/**
 * Runs the migration if needed. Requires initDatabase() to have been called —
 * the database is reached through the module-level singleton in ./database.
 *
 * @param projectsJsonPath  Path to the old projects.json file
 */
export function migrateJsonToSqlite(projectsJsonPath: string): { migrated: boolean; count: number } {
    // Only migrate if the JSON file exists
    if (!fs.existsSync(projectsJsonPath)) {
        return { migrated: false, count: 0 }
    }

    let projects: any[]
    try {
        const content = fs.readFileSync(projectsJsonPath, 'utf8')
        const parsed = JSON.parse(content)
        if (!Array.isArray(parsed)) {
            log.warn('[migration] projects.json does not contain an array — skipping migration')
            return { migrated: false, count: 0 }
        }
        projects = parsed
    } catch (e) {
        log.error('[migration] Failed to read/parse projects.json:', e)
        return { migrated: false, count: 0 }
    }

    if (projects.length === 0) {
        // Nothing to migrate — just rename the empty file
        renameLegacy(projectsJsonPath)
        return { migrated: true, count: 0 }
    }

    // Only import into an empty database. The rename below normally makes this a
    // one-shot operation, but a legacy file can reappear — restored from a backup,
    // or recreated by an older build the user downgraded to and then upgraded from.
    // saveAllProjects() upserts by id, so importing stale JSON over live data would
    // silently overwrite newer projects. Leave the file in place instead.
    if (databaseHasProjects()) {
        log.warn(
            `[migration] SQLite already contains projects — skipping import of ${path.basename(projectsJsonPath)} ` +
            'to avoid overwriting newer data. The legacy file has been left in place.',
        )
        return { migrated: false, count: 0 }
    }

    try {
        saveAllProjects(projects)
        log.info(`[migration] Migrated ${projects.length} project(s) from projects.json to SQLite`)
    } catch (e) {
        log.error('[migration] Failed to write projects to SQLite:', e)
        return { migrated: false, count: 0 }
    }

    renameLegacy(projectsJsonPath)
    return { migrated: true, count: projects.length }
}

function renameLegacy(filePath: string): void {
    const migratedPath = `${filePath}.migrated`
    try {
        // Keep a backup in case the user needs to roll back
        fs.renameSync(filePath, migratedPath)
        log.info(`[migration] Renamed ${path.basename(filePath)} to ${path.basename(migratedPath)}`)
    } catch (e) {
        // Non-fatal: the migration already succeeded, just couldn't rename
        log.warn('[migration] Could not rename legacy file (non-fatal):', e)
    }
}
