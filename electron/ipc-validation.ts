/**
 * IPC input validation helpers.
 * Use at the boundary of ipcMain.handle() to reject malformed data early.
 */

export function assertString(val: unknown, name: string, maxLen = 100_000): asserts val is string {
    if (typeof val !== 'string') throw new Error(`IPC validation: '${name}' must be a string, got ${typeof val}`)
    if (val.length > maxLen) throw new Error(`IPC validation: '${name}' exceeds max length of ${maxLen}`)
}

export function assertOptionalString(val: unknown, name: string, maxLen = 100_000): asserts val is string | undefined {
    if (val !== undefined && val !== null) assertString(val, name, maxLen)
}

export function assertObject(val: unknown, name: string): asserts val is Record<string, unknown> {
    if (typeof val !== 'object' || val === null || Array.isArray(val))
        throw new Error(`IPC validation: '${name}' must be a plain object`)
}

export function assertArray(val: unknown, name: string, maxLen?: number): asserts val is unknown[] {
    if (!Array.isArray(val)) throw new Error(`IPC validation: '${name}' must be an array`)
    if (maxLen !== undefined && val.length > maxLen) throw new Error(`IPC validation: '${name}' exceeds max length of ${maxLen}`)
}

export function assertNumber(val: unknown, name: string, min?: number, max?: number): asserts val is number {
    if (typeof val !== 'number' || !isFinite(val))
        throw new Error(`IPC validation: '${name}' must be a finite number`)
    if (min !== undefined && val < min) throw new Error(`IPC validation: '${name}' must be >= ${min}`)
    if (max !== undefined && val > max) throw new Error(`IPC validation: '${name}' must be <= ${max}`)
}

export function assertBoolean(val: unknown, name: string): asserts val is boolean {
    if (typeof val !== 'boolean') throw new Error(`IPC validation: '${name}' must be a boolean`)
}
