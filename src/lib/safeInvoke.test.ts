import { describe, expect, it, vi, beforeEach } from 'vitest'
import { safeInvoke } from './safeInvoke'

// Mock sonner's toast so we can assert on calls without a DOM
vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
    },
}))

import { toast } from 'sonner'

describe('safeInvoke', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns the resolved value on success', async () => {
        const result = await safeInvoke(() => Promise.resolve(42))
        expect(result).toBe(42)
    })

    it('returns null when the promise rejects', async () => {
        const result = await safeInvoke(() => Promise.reject(new Error('boom')))
        expect(result).toBeNull()
    })

    it('shows a toast with the error message on failure', async () => {
        await safeInvoke(() => Promise.reject(new Error('network error')))
        expect(toast.error).toHaveBeenCalledWith('network error')
    })

    it('prepends the custom error message to the detail', async () => {
        await safeInvoke(() => Promise.reject(new Error('timed out')), 'Failed to load repos')
        expect(toast.error).toHaveBeenCalledWith('Failed to load repos: timed out')
    })

    it('handles non-Error rejections (plain strings)', async () => {
        const result = await safeInvoke(() => Promise.reject('raw string error'))
        expect(result).toBeNull()
        expect(toast.error).toHaveBeenCalledWith('raw string error')
    })

    it('does not call toast on success', async () => {
        await safeInvoke(() => Promise.resolve('ok'))
        expect(toast.error).not.toHaveBeenCalled()
    })

    it('passes through resolved null values', async () => {
        const result = await safeInvoke(() => Promise.resolve(null))
        expect(result).toBeNull()
        expect(toast.error).not.toHaveBeenCalled()
    })
})
