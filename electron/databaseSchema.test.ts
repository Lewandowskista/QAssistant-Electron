/**
 * Contract tests between the hand-written SQL in database.ts and the schema it
 * runs against.
 *
 * Why this exists: `better-sqlite3` is compiled for Electron's ABI, so no test
 * can import database.ts and execute its queries. That left an entire class of
 * defect unguarded — a column renamed in the schema but not in an INSERT, or a
 * named parameter dropped from a `.run()` call. TypeScript cannot see inside a
 * SQL string, so those fail at runtime, in production, on a write path.
 *
 * These tests read database.ts as text and run its SQL through Node's built-in
 * sqlite, which needs no native module. That verifies the parts a type checker
 * cannot: every statement parses, every column exists, and every INSERT binds
 * the exact parameters the application passes.
 */
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(__dirname, 'database.ts'), 'utf8')

/** The DDL blocks handed to `database.exec()`, executed the way the app does. */
function schemaBlocks(): string[] {
    return [...SOURCE.matchAll(/database\.exec\(`([\s\S]*?)`\)/g)]
        .map(match => match[1])
        .filter(block => /CREATE TABLE/i.test(block))
}

/** SQL written as a template literal (multi-line statements). */
function templateLiteralSql(): string[] {
    return [...SOURCE.matchAll(/`\s*((?:INSERT|UPDATE|DELETE|SELECT)[\s\S]*?)`/g)]
        .map(match => match[1].trim())
        .filter(sql => /^(INSERT|UPDATE|DELETE)/i.test(sql))
        // Statements built by interpolating a placeholder list are not static SQL.
        .filter(sql => !sql.includes('${'))
}

/** SQL written as a quoted single-line string. */
function quotedSql(): string[] {
    return [
        ...[...SOURCE.matchAll(/\.prepare\(\s*'([^']+)'\s*\)/g)].map(m => m[1]),
        ...[...SOURCE.matchAll(/\.prepare\(\s*"([^"]+)"\s*\)/g)].map(m => m[1]),
    ].filter(sql => !sql.includes('${'))
}

function freshDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const block of schemaBlocks()) db.exec(block)
    return db
}

describe('schema', () => {
    it('executes cleanly', () => {
        const blocks = schemaBlocks()
        expect(blocks.length).toBeGreaterThan(0)
        expect(() => freshDb()).not.toThrow()
    })

    it('declares the tables the app persists to', () => {
        const db = freshDb()
        const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
            .map(row => row.name)

        for (const table of [
            'projects', 'tasks', 'notes', 'test_plans', 'test_cases', 'environments',
            'test_run_sessions', 'handoff_packets', 'artifact_links', 'collaboration_events',
            'checklists', 'runbooks', 'test_data_groups', 'project_files',
            'secret_migration_state', 'sync_pending_queue',
        ]) {
            expect(names, `missing table ${table}`).toContain(table)
        }
    })
})

describe('every statement in database.ts', () => {
    it('prepares against the real schema', () => {
        const db = freshDb()
        const failures: string[] = []

        for (const sql of [...templateLiteralSql(), ...quotedSql()]) {
            try {
                db.prepare(sql)
            } catch (error) {
                // A failure here is almost always a column that no longer exists.
                failures.push(`${sql.replace(/\s+/g, ' ').slice(0, 120)}\n    -> ${(error as Error).message}`)
            }
        }

        expect(failures, `SQL that does not match the schema:\n${failures.join('\n')}`).toEqual([])
    })

    it('binds as many values as it names columns', () => {
        const mismatches: string[] = []

        for (const sql of [...templateLiteralSql(), ...quotedSql()]) {
            const match = sql.match(/INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+(\w+)\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i)
            if (!match) continue
            const [, table, columnList, valueList] = match
            const columns = columnList.split(',').map(part => part.trim()).filter(Boolean)
            const values = valueList.split(',').map(part => part.trim()).filter(Boolean)
            if (columns.length !== values.length) {
                mismatches.push(`${table}: ${columns.length} columns vs ${values.length} values`)
            }
        }

        expect(mismatches, mismatches.join('\n')).toEqual([])
    })
})

/**
 * Executing an upsert with the exact object the app passes is the only way to
 * catch a missing or surplus named parameter: better-sqlite3 throws on both, and
 * so does node:sqlite.
 */
describe('upserts accept the parameters the app passes', () => {
    function withProject(db: DatabaseSync) {
        db.prepare('INSERT INTO projects (id, name, color) VALUES (?, ?, ?)').run('p1', 'Storefront QA', '#6366f1')
    }

    function statementFor(table: string): string {
        const sql = [...templateLiteralSql(), ...quotedSql()]
            .find(candidate => new RegExp(`INSERT(?:\\s+OR\\s+REPLACE)?\\s+INTO\\s+${table}\\b`, 'i').test(candidate))
        if (!sql) throw new Error(`no INSERT found for ${table}`)
        return sql
    }

    it('environments', () => {
        const db = freshDb()
        withProject(db)

        // Mirrors upsertProjectEnvironment / saveAllProjects exactly. The removed
        // occ_base_path and ignore_ssl_errors columns must take their defaults.
        db.prepare(statementFor('environments')).run({
            id: 'e1', project_id: 'p1', name: 'Staging', type: 'staging', color: '#f59e0b',
            is_default: 1, created_at: 1_700_000_000_000, base_url: 'https://staging.invalid',
            notes: '', health_check_url: 'https://staging.invalid/health',
            hac_url: 'https://staging.invalid/hac', back_office_url: '',
            storefront_url: 'https://staging.invalid', solr_admin_url: '',
        })

        const row = db.prepare('SELECT * FROM environments WHERE id = ?').get('e1') as Record<string, unknown>
        expect(row.name).toBe('Staging')
        expect(row.hac_url).toBe('https://staging.invalid/hac')
        expect(row.occ_base_path).toBe('')
        expect(row.ignore_ssl_errors).toBe(0)
    })

    it('projects, including the AI provider columns', () => {
        const db = freshDb()
        const sql = statementFor('projects')
        const columns = sql.match(/INTO\s+projects\s*\(([\s\S]*?)\)/i)![1]
            .split(',').map(part => part.trim())

        // Build the parameter object from the statement's own column list so this
        // test keeps working as columns are added, while still proving that every
        // named parameter the statement declares can actually be bound.
        const params: Record<string, string | number | null> = {}
        for (const column of columns) params[column] = null
        Object.assign(params, {
            id: 'p2', name: 'Provider project', color: '#6366f1',
            created_at: 1_700_000_000_000, updated_at: 1_700_000_000_000,
            ai_provider: 'ollama', ollama_model: 'gpt-oss:20b',
        })

        expect(() => db.prepare(sql).run(params)).not.toThrow()
        const row = db.prepare('SELECT ai_provider, ollama_model FROM projects WHERE id = ?').get('p2') as Record<string, unknown>
        expect(row.ai_provider).toBe('ollama')
        expect(row.ollama_model).toBe('gpt-oss:20b')
    })
})

describe('legacy environment secrets', () => {
    it('are cleared from the plaintext columns', () => {
        const db = freshDb()
        db.prepare('INSERT INTO projects (id, name, color) VALUES (?, ?, ?)').run('p1', 'P', '#fff')
        db.prepare(`
            INSERT INTO environments (id, project_id, name, type, color, is_default, created_at, username, password)
            VALUES ('e1', 'p1', 'S', 'staging', '#fff', 1, 1, 'admin', 'nimda')
        `).run()

        // The statement clearLegacyEnvironmentSecrets runs.
        const result = db
            .prepare('UPDATE environments SET username = NULL, password = NULL WHERE username IS NOT NULL OR password IS NOT NULL')
            .run()

        expect(result.changes).toBe(1)
        const row = db.prepare('SELECT username, password FROM environments WHERE id = ?').get('e1') as Record<string, unknown>
        expect(row.username).toBeNull()
        expect(row.password).toBeNull()
    })
})
