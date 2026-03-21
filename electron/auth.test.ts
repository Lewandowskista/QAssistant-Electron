import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockSupabaseClient = {
    auth: {
        onAuthStateChange: ReturnType<typeof vi.fn>
        signInWithPassword: ReturnType<typeof vi.fn>
        signUp: ReturnType<typeof vi.fn>
        signOut: ReturnType<typeof vi.fn>
        getUser: ReturnType<typeof vi.fn>
        setSession: ReturnType<typeof vi.fn>
    }
    from: ReturnType<typeof vi.fn>
}

const credentialStore = new Map<string, string>()
let mockClient: MockSupabaseClient

vi.mock('./credentialService', () => ({
    getCredential: vi.fn(async (key: string) => credentialStore.get(key) ?? null),
    setCredential: vi.fn(async (key: string, value: string) => {
        credentialStore.set(key, value)
    }),
    deleteCredential: vi.fn(async (key: string) => {
        credentialStore.delete(key)
    }),
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
}))

function createMockClient(): MockSupabaseClient {
    return {
        auth: {
            onAuthStateChange: vi.fn(() => ({
                data: {
                    subscription: {
                        unsubscribe: vi.fn(),
                    },
                },
            })),
            signInWithPassword: vi.fn(),
            signUp: vi.fn(),
            signOut: vi.fn().mockResolvedValue({ error: null }),
            getUser: vi.fn(),
            setSession: vi.fn(),
        },
        from: vi.fn(() => ({
            upsert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                        data: { display_name: 'Mock User' },
                        error: null,
                    }),
                })),
            })),
        })),
    }
}

async function loadAuthModule(settings: Record<string, unknown> = {}) {
    vi.resetModules()
    credentialStore.clear()
    mockClient = createMockClient()

    const auth = await import('./auth')
    auth.configureAuthIo({
        readSettings: async () => settings,
        writeSettings: async () => {},
    })

    return auth
}

beforeEach(() => {
    vi.useRealTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    credentialStore.clear()
})

describe('electron auth', () => {
    it('returns signed_in for correct credentials', async () => {
        const auth = await loadAuthModule({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
        })

        mockClient.auth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'user-1',
                    email: 'dev@example.com',
                    email_confirmed_at: '2026-03-21T12:00:00Z',
                    user_metadata: { display_name: 'Dev User' },
                },
                session: {
                    access_token: 'access',
                    refresh_token: 'refresh',
                    user: {
                        id: 'user-1',
                        email: 'dev@example.com',
                        email_confirmed_at: '2026-03-21T12:00:00Z',
                        user_metadata: { display_name: 'Dev User' },
                    },
                },
            },
            error: null,
        })

        const result = await auth.authSignIn('dev@example.com', 'correct-password')

        expect(result.status).toBe('signed_in')
        expect(result.user?.email).toBe('dev@example.com')
    })

    it('returns error for wrong password and never emits verification state', async () => {
        const auth = await loadAuthModule({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
        })

        mockClient.auth.signInWithPassword.mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials' },
        })

        const result = await auth.authSignIn('dev@example.com', 'wrong-password')

        expect(result.status).toBe('error')
        expect(result.error).toBe('Invalid login credentials')
    })

    it('returns duplicate-email error during sign-up', async () => {
        const auth = await loadAuthModule({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
        })

        mockClient.auth.signUp.mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'User already registered' },
        })

        const result = await auth.authSignUp('dev@example.com', 'password', 'Dev User')

        expect(result.status).toBe('error')
        expect(result.error).toBe('An account with this email already exists. Sign in instead.')
    })

    it('returns a deterministic SMTP/config error when sign-up needs confirmation', async () => {
        const auth = await loadAuthModule({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
        })

        mockClient.auth.signUp.mockResolvedValue({
            data: {
                user: {
                    id: 'user-1',
                    email: 'dev@example.com',
                    email_confirmed_at: null,
                    user_metadata: { display_name: 'Dev User' },
                },
                session: null,
            },
            error: null,
        })

        const result = await auth.authSignUp('dev@example.com', 'password', 'Dev User')

        expect(result.status).toBe('error')
        expect(result.error).toContain('requires email verification')
    })

    it('reports configured false when app auth config is missing', async () => {
        const auth = await loadAuthModule({})

        const status = await auth.authGetStatus()
        const errorStatus = auth.getAuthErrorStatus('Supabase app configuration is missing')

        expect(status.configured).toBe(false)
        expect(errorStatus.configured).toBe(false)
        expect(errorStatus.status).toBe('error')
    })

    it('times out stalled sign-up requests instead of hanging forever', async () => {
        vi.useFakeTimers()
        const auth = await loadAuthModule({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
        })

        mockClient.auth.signUp.mockImplementation(() => new Promise(() => {}))

        const resultPromise = auth.authSignUp('dev@example.com', 'password', 'Dev User')
            .catch((error: Error) => auth.getAuthErrorStatus(error.message))
        await vi.advanceTimersByTimeAsync(10000)
        const result = await resultPromise

        expect(result.status).toBe('error')
        expect(result.error).toContain('Sign-up timed out')
    })

    it('times out stalled profile refresh requests instead of hanging forever', async () => {
        vi.useFakeTimers()
        const auth = await loadAuthModule({
            supabaseUrl: 'https://example.supabase.co',
            supabaseAnonKey: 'anon-key',
        })

        mockClient.auth.signInWithPassword.mockResolvedValue({
            data: {
                user: {
                    id: 'user-1',
                    email: 'dev@example.com',
                    email_confirmed_at: '2026-03-21T12:00:00Z',
                    user_metadata: { display_name: 'Dev User' },
                },
                session: {
                    access_token: 'access',
                    refresh_token: 'refresh',
                    user: {
                        id: 'user-1',
                        email: 'dev@example.com',
                        email_confirmed_at: '2026-03-21T12:00:00Z',
                        user_metadata: { display_name: 'Dev User' },
                    },
                },
            },
            error: null,
        })

        await auth.authSignIn('dev@example.com', 'correct-password')
        mockClient.auth.getUser.mockImplementation(() => new Promise(() => {}))

        const resultPromise = auth.authRefreshProfile().catch((error: Error) => auth.getAuthErrorStatus(error.message))
        await vi.advanceTimersByTimeAsync(10000)
        const result = await resultPromise

        expect(result.status).toBe('error')
        expect(result.error).toContain('Profile refresh timed out')
    })
})
