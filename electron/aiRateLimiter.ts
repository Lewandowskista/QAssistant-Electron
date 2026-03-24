type SleepFn = (ms: number) => Promise<void>
type NowFn = () => number

async function defaultSleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}

export class AiRateLimiter {
    private readonly pendingByChannel = new Map<string, Promise<void>>()
    private readonly nextAvailableAt = new Map<string, number>()
    private readonly minIntervalMs: number
    private readonly now: NowFn
    private readonly sleep: SleepFn

    constructor(
        minIntervalMs: number,
        now: NowFn = () => Date.now(),
        sleep: SleepFn = defaultSleep,
    ) {
        this.minIntervalMs = minIntervalMs
        this.now = now
        this.sleep = sleep
    }

    async wait(channel: string): Promise<void> {
        const previous = this.pendingByChannel.get(channel) ?? Promise.resolve()
        let releaseCurrent!: () => void
        const current = new Promise<void>((resolve) => {
            releaseCurrent = resolve
        })

        this.pendingByChannel.set(channel, previous.then(() => current))

        await previous

        try {
            const now = this.now()
            const nextTime = this.nextAvailableAt.get(channel) ?? now
            const waitMs = Math.max(0, nextTime - now)
            if (waitMs > 0) {
                await this.sleep(waitMs)
            }
            this.nextAvailableAt.set(channel, this.now() + this.minIntervalMs)
        } finally {
            releaseCurrent()
            if (this.pendingByChannel.get(channel) === current) {
                this.pendingByChannel.delete(channel)
            }
        }
    }

    async run<T>(channel: string, task: () => Promise<T>): Promise<T> {
        await this.wait(channel)
        return await task()
    }
}
