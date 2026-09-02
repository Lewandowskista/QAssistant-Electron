/**
 * Tests for the one-time projects.json -> SQLite migration.
 *
 * The module reaches the database through the ./database singleton, which needs a
 * live better-sqlite3 handle, so both ./database and ./logger are stubbed via
 * vi.mock. Filesystem work runs against a real temp directory — the rename is
 * part of the behaviour under test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// vi.mock factories are hoisted above imports, so shared state has to be hoisted too.
const mocks = vi.hoisted(() => ({
    saveAllProjects: vi.fn(),
    db: { hasProjects: false, throws: false },
}))

vi.mock('./database', () => ({
    saveAllProjects: mocks.saveAllProjects,
    getDb: () => {
        if (mocks.db.throws) throw new Error('Database not initialised')
        return {
            prepare: () => ({ get: () => (mocks.db.hasProjects ? 1 : undefined) }),
        }
    },
}))

vi.mock('./logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { migrateJsonToSqlite } from './migration'

describe('migrateJsonToSqlite', () => {
    let tmpDir: string
    let jsonPath: string

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-migration-'))
        jsonPath = path.join(tmpDir, 'projects.json')
        mocks.db.hasProjects = false
        mocks.db.throws = false
        mocks.saveAllProjects.mockClear()
    })

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    it('does nothing when there is no legacy file', () => {
        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: false, count: 0 })
        expect(mocks.saveAllProjects).not.toHaveBeenCalled()
    })

    it('imports projects and renames the legacy file when the database is empty', () => {
        const projects = [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]
        fs.writeFileSync(jsonPath, JSON.stringify(projects))

        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: true, count: 2 })
        expect(mocks.saveAllProjects).toHaveBeenCalledWith(projects)
        expect(fs.existsSync(jsonPath)).toBe(false)
        expect(fs.existsSync(`${jsonPath}.migrated`)).toBe(true)
    })

    it('refuses to import over a database that already has projects', () => {
        mocks.db.hasProjects = true
        fs.writeFileSync(jsonPath, JSON.stringify([{ id: 'p1', name: 'Stale' }]))

        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: false, count: 0 })
        expect(mocks.saveAllProjects).not.toHaveBeenCalled()
        // Left in place on purpose: the data stays recoverable rather than being
        // renamed away after a skipped import.
        expect(fs.existsSync(jsonPath)).toBe(true)
        expect(fs.existsSync(`${jsonPath}.migrated`)).toBe(false)
    })

    it('skips the import when the database state cannot be determined', () => {
        mocks.db.throws = true
        fs.writeFileSync(jsonPath, JSON.stringify([{ id: 'p1', name: 'Alpha' }]))

        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: false, count: 0 })
        expect(mocks.saveAllProjects).not.toHaveBeenCalled()
        expect(fs.existsSync(jsonPath)).toBe(true)
    })

    it('renames an empty legacy file without touching the database', () => {
        fs.writeFileSync(jsonPath, '[]')

        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: true, count: 0 })
        expect(mocks.saveAllProjects).not.toHaveBeenCalled()
        expect(fs.existsSync(`${jsonPath}.migrated`)).toBe(true)
    })

    it('leaves the file alone when the contents are not an array', () => {
        fs.writeFileSync(jsonPath, JSON.stringify({ not: 'an array' }))

        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: false, count: 0 })
        expect(mocks.saveAllProjects).not.toHaveBeenCalled()
        expect(fs.existsSync(jsonPath)).toBe(true)
    })

    it('leaves the file alone when the contents are unparseable', () => {
        fs.writeFileSync(jsonPath, '{ this is not json')

        expect(migrateJsonToSqlite(jsonPath)).toEqual({ migrated: false, count: 0 })
        expect(mocks.saveAllProjects).not.toHaveBeenCalled()
        expect(fs.existsSync(jsonPath)).toBe(true)
    })
})
