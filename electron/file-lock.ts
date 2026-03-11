/**
 * Simple promise-based file write lock to prevent concurrent writes to the same file.
 * Ensures sequential writes even when called from different modules (main.ts, server.ts).
 */

const locks = new Map<string, Promise<void>>()

/**
 * Run `fn` exclusively for the given file path.
 * Concurrent calls queue up and execute one at a time, in order.
 */
export function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(filePath) ?? Promise.resolve()
    let resolve!: () => void
    const next = new Promise<void>(r => { resolve = r })
    locks.set(filePath, next)

    return prev.then(fn).finally(resolve)
}
