import type { AppUpdateState } from '../src/types/update'

type ReleaseNoteLike =
    | string
    | Array<{ note?: string | null; version?: string | null } | null>
    | null
    | undefined

export function createDefaultAppUpdateState(currentVersion: string): AppUpdateState {
    return {
        status: 'idle',
        currentVersion,
    }
}

export function normalizeReleaseNotes(releaseNotes: ReleaseNoteLike): string | undefined {
    if (!releaseNotes) return undefined
    if (typeof releaseNotes === 'string') {
        const trimmed = releaseNotes.trim()
        return trimmed || undefined
    }

    const flattened = releaseNotes
        .map((entry) => entry?.note?.trim() || '')
        .filter(Boolean)
        .join('\n\n')
        .trim()

    return flattened || undefined
}

export function mergeAppUpdateState(
    current: AppUpdateState,
    patch: Partial<AppUpdateState>,
): AppUpdateState {
    return {
        ...current,
        ...patch,
        currentVersion: patch.currentVersion ?? current.currentVersion,
    }
}
