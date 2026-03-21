import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthGate } from './AuthGate'

const mockUseAuthStore = vi.fn()

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: () => mockUseAuthStore(),
}))

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock('@/components/ui/input', () => ({
    Input: (props: any) => <input {...props} />,
}))

vi.mock('lucide-react', () => {
    const Icon = () => <span />
    return {
        AlertTriangle: Icon,
        CheckCircle2: Icon,
        Cloud: Icon,
        FlaskConical: Icon,
        Loader2: Icon,
        Lock: Icon,
        Minus: Icon,
        ShieldCheck: Icon,
        Square: Icon,
        X: Icon,
        Copy: Icon,
    }
})

describe('AuthGate', () => {
    it('does not render the old verification screen when auth is in error', () => {
        mockUseAuthStore.mockReturnValue({
            auth: {
                configured: true,
                status: 'error',
                user: null,
                error: 'Invalid login credentials',
                usingOfflineSession: false,
            },
            signIn: vi.fn(),
            signUp: vi.fn(),
        })

        const html = renderToStaticMarkup(<AuthGate />)

        expect(html).not.toContain('Verify Your Email')
        expect(html).toContain('Sign In')
    })

    it('shows only supported auth actions for desktop mode', () => {
        mockUseAuthStore.mockReturnValue({
            auth: {
                configured: true,
                status: 'signed_out',
                user: null,
                error: null,
                usingOfflineSession: false,
            },
            signIn: vi.fn(),
            signUp: vi.fn(),
        })

        const html = renderToStaticMarkup(<AuthGate />)

        expect(html).toContain('Create account')
        expect(html).not.toContain('Forgot your password?')
        expect(html).not.toContain('Resend Verification')
    })
})
