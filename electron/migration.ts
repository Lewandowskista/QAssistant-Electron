/**
 * migration.ts — One-time migration from projects.json to SQLite
 *
 * Called during app startup. If projects.json exists and the SQLite DB has no
 * projects yet, we read the JSON and import it into SQLite, then rename the
 * JSON file to projects.json.migrated so the user's data is preserved.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { saveAllProjects } from './database'
import { log } from './logger'

/**
 * Runs the migration if needed.
 * @param projectsJsonPath  Path to the old projects.json file
 * @param db                The already-initialised database instance (unused directly — saveAllProjects uses the module-level singleton)
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
