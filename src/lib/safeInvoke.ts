import { toast } from 'sonner'

/**
 * Wraps an async IPC call with error handling.
 * On success, returns the result.
 * On failure, shows a toast notification and returns `null`.
 *
 * Usage:
 *   const result = await safeInvoke(() => api.someMethod(args), 'Failed to do thing')
 *   if (result === null) return  // error already shown
 */
export async function safeInvoke<T>(
    fn: () => Promise<T>,
    errorMessage?: string,
): Promise<T | null> {
    try {
        return await fn()
    } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err)
        toast.error(errorMessage ? `${errorMessage}: ${detail}` : detail)
        return null
    }
}
