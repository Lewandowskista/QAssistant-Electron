import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, FlaskConical, Loader2, Lock, Minus, ShieldCheck, Square, X, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/useAuthStore'

type Mode = 'sign_in' | 'sign_up'

export function AuthGate() {
    const { auth, signIn, signUp } = useAuthStore()
    const [mode, setMode] = useState<Mode>('sign_in')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busyAction, setBusyAction] = useState<string | null>(null)

    const heading = useMemo(() => {
        if (!auth.configured) return 'Supabase Configuration Required'
        if (mode === 'sign_up') return 'Create Your Account'
        return 'Sign In'
    }, [auth.configured, mode])

    async function run(label: string, action: () => Promise<void>) {
        setBusyAction(label)
        setError(null)
        setMessage(null)
        try {
            await action()
        } catch (e: any) {
            setError(e?.message ?? 'Unexpected error')
        } finally {
            setBusyAction(null)
        }
    }

    if (!auth.configured) {
        return (
            <AuthShell
                icon={<Cloud className="h-8 w-8 text-[#A78BFA]" />}
                title={heading}
                subtitle="This build does not have a Supabase URL and anon key configured yet."
            >
                <MessageCard
                    tone="warn"
                    title="App login is blocked"
                    body="Set SUPABASE_URL and SUPABASE_ANON_KEY in the desktop app configuration or settings file, then restart the app."
                />
            </AuthShell>
        )
    }

    if (auth.status === 'booting') {
        return (
            <AuthShell
                icon={<Loader2 className="h-8 w-8 animate-spin text-[#A78BFA]" />}
                title="Restoring Session"
                subtitle="Checking for a saved Supabase session before opening the app."
            />
        )
    }

    return (
        <AuthShell
            icon={<Lock className="h-8 w-8 text-[#A78BFA]" />}
            title={heading}
            subtitle={mode === 'sign_up' ? 'Create an account to get started.' : 'Sign in to access the desktop app.'}
        >
            <div className="space-y-4">
                {auth.error && <InlineError error={auth.error} />}
                {error && <InlineError error={error} />}
                {message && <InlineMessage message={message} />}

                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#2A2A3A] bg-[#11131A] p-1">
                    <ModeButton active={mode === 'sign_in'} label="Sign in" onClick={() => { setMode('sign_in'); setError(null); setMessage(null) }} />
                    <ModeButton active={mode === 'sign_up'} label="Create account" onClick={() => { setMode('sign_up'); setError(null); setMessage(null) }} />
                </div>

                <div className="space-y-3">
                    <Input
                        className="h-11 bg-[#11131A] border-[#2A2A3A] text-[#E2E8F0] placeholder:text-[#4A5568]"
                        placeholder="Email address"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                    {mode === 'sign_up' && (
                        <Input
                            className="h-11 bg-[#11131A] border-[#2A2A3A] text-[#E2E8F0] placeholder:text-[#4A5568]"
                            placeholder="Display name"
                            autoComplete="name"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                        />
                    )}
                    <Input
                        className="h-11 bg-[#11131A] border-[#2A2A3A] text-[#E2E8F0] placeholder:text-[#4A5568]"
                        placeholder="Password"
                        type="password"
                        autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && mode === 'sign_in' && email.trim() && password) {
                                run('sign_in', async () => {
                                    const next = await signIn({ email: email.trim(), password })
                                    if (next.status !== 'signed_in') {
                                        throw new Error(next.error ?? 'Sign-in failed')
                                    }
                                })
                            }
                        }}
                    />
                </div>

                {mode === 'sign_in' && (
                    <Button
                        className="w-full h-11 bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] font-bold"
                        disabled={busyAction !== null || !email.trim() || !password}
                        onClick={() => run('sign_in', async () => {
                            const next = await signIn({ email: email.trim(), password })
                            if (next.status !== 'signed_in') {
                                throw new Error(next.error ?? 'Sign-in failed')
                            }
                        })}
                    >
                        {busyAction === 'sign_in' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Sign In
                    </Button>
                )}

                {mode === 'sign_up' && (
                    <div className="space-y-3">
                        <Button
                            className="w-full h-11 bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] font-bold"
                            disabled={busyAction !== null || !email.trim() || !password || !displayName.trim()}
                            onClick={() => run('sign_up', async () => {
                                const next = await signUp({ email: email.trim(), password, displayName: displayName.trim() })
                                if (next.status !== 'signed_in') {
                                    throw new Error(next.error ?? 'Registration failed')
                                }
                            })}
                        >
                            {busyAction === 'sign_up' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create Account
                        </Button>
                        <p className="text-xs text-[#4A5568] leading-5">
                            By creating an account you agree to the terms of service. Your credentials are stored securely in Supabase.
                        </p>
                    </div>
                )}

                {auth.usingOfflineSession && (
                    <MessageCard
                        tone="warn"
                        title="Offline cached session"
                        body="You are signed in with a locally cached session. Cloud sync may remain unavailable until network access returns."
                    />
                )}
            </div>
        </AuthShell>
    )
}

function AuthShell({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children?: React.ReactNode }) {
    const [isMac, setIsMac] = useState(() => {
        if (typeof navigator === 'undefined') return false
        return navigator.userAgent.toUpperCase().includes('MAC')
    })
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        const api = window.electronAPI
        if (!api) return

        let mounted = true
        api.getSystemInfo?.().then((info) => {
            if (mounted) {
                setIsMac(info.platform === 'darwin')
            }
        }).catch(() => {})

        const removeMaximizedListener = api.onMaximizedStatus?.((status: boolean) => {
            setIsMaximized(status)
        })

        return () => {
            mounted = false
            removeMaximizedListener?.()
        }
    }, [])

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1b1f2c_0%,#0b0d13_55%,#07080c_100%)] text-[#E2E8F0]">
            <header className={`h-14 flex items-center justify-between px-4 app-region-drag ${isMac ? 'pl-20' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-2xl bg-[#A78BFA]/12 border border-[#A78BFA]/20 flex items-center justify-center">
                        <FlaskConical className="h-4 w-4 text-[#A78BFA] stroke-[2.4]" />
                    </div>
                    <span className="text-sm font-semibold tracking-tight text-[#E2E8F0]">QAssistant</span>
                </div>

                {!isMac && (
                    <div className="flex items-center shrink-0 app-region-no-drag">
                        <button onClick={() => window.electronAPI?.minimize()} aria-label="Minimize window" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-colors">
                            <Minus className="h-4 w-4 text-[#8FB7D9]" />
                        </button>
                        <button onClick={() => window.electronAPI?.maximize()} aria-label={isMaximized ? 'Restore window' : 'Maximize window'} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-colors">
                            {isMaximized ? <Copy className="h-3.5 w-3.5 text-[#8FB7D9] rotate-180" /> : <Square className="h-3.5 w-3.5 text-[#8FB7D9]" />}
                        </button>
                        <button onClick={() => window.electronAPI?.close()} aria-label="Close window" className="w-11 h-10 flex items-center justify-center rounded-xl hover:bg-red-500 hover:text-white transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
            </header>

            <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-5xl items-center justify-center px-6 py-12">
                <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[28px] border border-[#2A2A3A] bg-[#0f1118]/90 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
                        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#A78BFA]/12">
                            {icon}
                        </div>
                        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
                        <p className="mt-3 max-w-lg text-sm leading-6 text-[#94A3B8]">{subtitle}</p>
                        <div className="mt-6">{children}</div>
                    </div>

                    <div className="rounded-[28px] border border-[#2A2A3A] bg-[#11131A]/85 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
                        <div className="space-y-6">
                            <Feature icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />} title="Enterprise login gate" body="The main shell stays locked until the Supabase session is valid and the desktop auth bootstrap finishes cleanly." />
                            <Feature icon={<Cloud className="h-4 w-4 text-[#A78BFA]" />} title="Cloud-ready identity" body="Workspace sync, invite-based collaboration, and user profile hydration all reuse the same authenticated session." />
                            <Feature icon={<CheckCircle2 className="h-4 w-4 text-sky-400" />} title="Local-first data stays local" body="Signing out clears cloud access while your local projects remain on disk for the next authenticated session." />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-[#222430] bg-[#0B0D13] p-4">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#171925]">{icon}</div>
                <div>
                    <p className="text-sm font-bold text-[#E2E8F0]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#94A3B8]">{body}</p>
                </div>
            </div>
        </div>
    )
}

function MessageCard({ tone, title, body }: { tone: 'success' | 'warn'; title: string; body: string }) {
    const toneClass = tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
    return (
        <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
            <p className="text-sm font-bold">{title}</p>
            <p className="mt-1 text-xs leading-5 opacity-90">{body}</p>
        </div>
    )
}

function InlineError({ error }: { error: string }) {
    return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
            </div>
        </div>
    )
}

function InlineMessage({ message }: { message: string }) {
    return (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {message}
        </div>
    )
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                active
                    ? 'bg-[#A78BFA] text-[#0F0F13]'
                    : 'text-[#94A3B8] hover:bg-[#1A1D28] hover:text-[#E2E8F0]'
            }`}
            onClick={onClick}
        >
            {label}
        </button>
    )
}
