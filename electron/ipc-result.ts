import { IpcMainInvokeEvent } from 'electron'

/**
 * Canonical IPC result envelope.
 *
 * All new IPC handlers should return `IpcResult<T>` rather than the legacy
 * ad-hoc shapes (`{ __isError, message }` or `{ success, error }`).
 * Existing handlers are migrated incrementally when touched for other reasons.
 *
 * Renderer-side: check `result.ok` before accessing `result.data`.
 */
export type IpcResult<T = void> =
    | { ok: true; data: T }
    | { ok: false; error: string }

export function ok<T>(data: T): IpcResult<T> {
    return { ok: true, data }
}

export function err(error: string | unknown): IpcResult<never> {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
}

/**
 * Wraps an IPC handler function with uniform error catching.
 * The inner function receives the raw IPC event and a typed args object.
 *
 * Usage:
 *   ipcMain.handle('my-channel', wrapHandler(async (_e, args: MyArgs) => {
 *       const result = doSomething(args)
 *       return ok(result)
 *   }))
 */
export function wrapHandler<TArgs, TResult>(
    fn: (event: IpcMainInvokeEvent, args: TArgs) => Promise<IpcResult<TResult>>
): (event: IpcMainInvokeEvent, args: TArgs) => Promise<IpcResult<TResult>> {
    return async (event, args) => {
        try {
            return await fn(event, args)
        } catch (e) {
            console.error('[ipc] handler error:', e)
            return err(e)
        }
    }
}
