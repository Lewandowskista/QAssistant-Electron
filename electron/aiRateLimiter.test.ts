import { describe, expect, it } from 'vitest'
import { AiRateLimiter } from './aiRateLimiter'

describe('AiRateLimiter', () => {
    it('queues concurrent requests on the same channel instead of rejecting them', async () => {
        let now = 0
        const sleeps: number[] = []
        const limiter = new AiRateLimiter(
            100,
            () => now,
            async (ms) => {
                sleeps.push(ms)
                now += ms
            },
        )

        await Promise.all([
            limiter.wait('ai-chat'),
            limiter.wait('ai-chat'),
            limiter.wait('ai-chat'),
        ])

        expect(sleeps).toEqual([100, 100])
    })

    it('keeps separate channels independent', async () => {
        let now = 0
        const sleeps: number[] = []
        const limiter = new AiRateLimiter(
            100,
            () => now,
            async (ms) => {
                sleeps.push(ms)
                now += ms
            },
        )

        await Promise.all([
            limiter.wait('ai-chat'),
            limiter.wait('ai-accuracy'),
        ])

        expect(sleeps).toEqual([])
    })
})
