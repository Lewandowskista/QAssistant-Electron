import { describe, expect, it } from 'vitest'
import {
    createDefaultAppUpdateState,
    mergeAppUpdateState,
    normalizeReleaseNotes,
} from './appUpdateState'

describe('appUpdateState', () => {
    it('creates a stable default state', () => {
        expect(createDefaultAppUpdateState('1.2.3')).toEqual({
            status: 'idle',
            currentVersion: '1.2.3',
        })
    })

    it('normalizes string release notes', () => {
        expect(normalizeReleaseNotes('  Fixes and polish  ')).toBe('Fixes and polish')
    })

    it('normalizes array release notes', () => {
        expect(
            normalizeReleaseNotes([
                { version: '1.0.1', note: 'First change' },
                null,
                { version: '1.0.2', note: 'Second change' },
            ]),
        ).toBe('First change\n\nSecond change')
    })

    it('merges state without dropping current version', () => {
        const next = mergeAppUpdateState(createDefaultAppUpdateState('1.2.3'), {
            status: 'downloading',
            availableVersion: '1.2.4',
            downloadProgressPercent: 42,
        })

        expect(next).toEqual({
            status: 'downloading',
            currentVersion: '1.2.3',
            availableVersion: '1.2.4',
            downloadProgressPercent: 42,
        })
    })
})
