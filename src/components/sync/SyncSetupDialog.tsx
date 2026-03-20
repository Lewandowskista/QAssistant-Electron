import { useState } from 'react'
import { X, Cloud, Users, KeyRound, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSyncStore } from '@/store/useSyncStore'

interface SyncSetupDialogProps {
    open: boolean
    onClose: () => void
}

type Mode = 'choose' | 'create' | 'join'

const DEFAULT_SUPABASE_URL = ''
const DEFAULT_ANON_KEY = ''

export function SyncSetupDialog({ open, onClose }: SyncSetupDialogProps) {
    const [mode, setMode] = useState<Mode>('choose')
    const [supabaseUrl, setSupabaseUrl] = useState(DEFAULT_SUPABASE_URL)
    const [supabaseAnonKey, setSupabaseAnonKey] = useState(DEFAULT_ANON_KEY)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [workspaceName, setWorkspaceName] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [inviteCode, setInviteCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successInfo, setSuccessInfo] = useState<{ inviteCode?: string; workspaceName?: string } | null>(null)

    const { createWorkspace, joinWorkspace } = useSyncStore()

    function reset() {
        setMode('choose')
        setError(null)
        setSuccessInfo(null)
        setLoading(false)
    }

    function handleClose() {
        reset()
        onClose()
    }

    async function handleCreate() {
        setError(null)
        setLoading(true)
        try {
            const result = await createWorkspace({
                supabaseUrl: supabaseUrl.trim(),
                supabaseAnonKey: supabaseAnonKey.trim(),
                userEmail: email.trim(),
                userPassword: password,
                workspaceName: workspaceName.trim(),
                displayName: displayName.trim(),
            })
            if (result.ok) {
                setSuccessInfo({ inviteCode: result.inviteCode })
            } else {
                setError(result.error ?? 'Failed to create workspace')
            }
        } catch (e: any) {
            setError(e?.message ?? 'Unexpected error')
        } finally {
            setLoading(false)
        }
    }

    async function handleJoin() {
        setError(null)
        setLoading(true)
        try {
            const result = await joinWorkspace({
                supabaseUrl: supabaseUrl.trim(),
                supabaseAnonKey: supabaseAnonKey.trim(),
                userEmail: email.trim(),
                userPassword: password,
                inviteCode: inviteCode.trim().toUpperCase(),
                displayName: displayName.trim(),
            })
            if (result.ok) {
                setSuccessInfo({ workspaceName: result.workspaceName })
            } else {
                setError(result.error ?? 'Failed to join workspace')
            }
        } catch (e: any) {
            setError(e?.message ?? 'Unexpected error')
        } finally {
            setLoading(false)
        }
    }

    const supabaseFields = (
        <div className="space-y-3">
            <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">Supabase Project</p>
            <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Project URL</label>
                <input
                    className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors"
                    placeholder="https://xxxx.supabase.co"
                    value={supabaseUrl}
                    onChange={e => setSupabaseUrl(e.target.value)}
                    spellCheck={false}
                />
            </div>
            <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Anon / Public Key</label>
                <input
                    className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors font-mono text-xs"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={supabaseAnonKey}
                    onChange={e => setSupabaseAnonKey(e.target.value)}
                    spellCheck={false}
                />
            </div>
        </div>
    )

    const accountFields = (
        <div className="space-y-3">
            <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">Your Account</p>
            <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Email</label>
                <input
                    className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors"
                    placeholder="you@example.com"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
            </div>
            <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Password</label>
                <div className="relative">
                    <input
                        className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 pr-9 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors"
                        placeholder="••••••••"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#9CA3AF]"
                        onClick={() => setShowPassword(v => !v)}
                    >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Display Name</label>
                <input
                    className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors"
                    placeholder="Your name (visible to teammates)"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                />
            </div>
        </div>
    )

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-200',
                    open ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                onClick={handleClose}
            />
            {/* Dialog */}
            <div
                className={cn(
                    'fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 transition-all duration-200',
                    open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                )}
            >
                <div className="app-panel w-[480px] max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center gap-3 p-5 pb-4 border-b border-[#2D2D44]">
                        <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center shrink-0">
                            <Cloud className="h-4.5 w-4.5 text-[#A78BFA]" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#E2E8F0]">Cloud Sync Setup</p>
                            <p className="text-xs text-[#6B7280]">Connect your team for real-time collaboration</p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="ml-auto p-1 rounded-md text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#252535] transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-5 space-y-5">
                        {/* Mode: choose */}
                        {mode === 'choose' && (
                            <>
                                <p className="text-xs text-[#9CA3AF] leading-relaxed">
                                    Cloud sync requires a Supabase project. Run the{' '}
                                    <code className="text-[#A78BFA] bg-[#1A1A2E] px-1 rounded">SUPABASE_SCHEMA.sql</code>{' '}
                                    file in your project's SQL Editor first, then choose an option below.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setMode('create')}
                                        className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-[#2D2D44] hover:border-[#A78BFA]/50 hover:bg-[#A78BFA]/5 transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center group-hover:bg-[#A78BFA]/20 transition-colors">
                                            <Cloud className="h-5 w-5 text-[#A78BFA]" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-[#E2E8F0] text-center">Create Workspace</p>
                                            <p className="text-xs text-[#6B7280] text-center mt-1">Start a new shared workspace and invite your team</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setMode('join')}
                                        className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-[#2D2D44] hover:border-[#A78BFA]/50 hover:bg-[#A78BFA]/5 transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center group-hover:bg-[#A78BFA]/20 transition-colors">
                                            <Users className="h-5 w-5 text-[#A78BFA]" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-[#E2E8F0] text-center">Join Workspace</p>
                                            <p className="text-xs text-[#6B7280] text-center mt-1">Join an existing workspace using an invite code</p>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Mode: create */}
                        {mode === 'create' && !successInfo && (
                            <>
                                {supabaseFields}
                                <div className="space-y-3">
                                    <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">Workspace</p>
                                    <div>
                                        <label className="block text-xs text-[#9CA3AF] mb-1">Workspace Name</label>
                                        <input
                                            className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors"
                                            placeholder="e.g. ACME QA Team"
                                            value={workspaceName}
                                            onChange={e => setWorkspaceName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {accountFields}
                            </>
                        )}

                        {/* Mode: join */}
                        {mode === 'join' && !successInfo && (
                            <>
                                {supabaseFields}
                                <div className="space-y-3">
                                    <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">Invite Code</p>
                                    <div>
                                        <label className="block text-xs text-[#9CA3AF] mb-1">Invite Code</label>
                                        <input
                                            className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors font-mono tracking-widest"
                                            placeholder="XXXX-XXXX"
                                            value={inviteCode}
                                            onChange={e => setInviteCode(e.target.value)}
                                            maxLength={9}
                                        />
                                    </div>
                                </div>
                                {accountFields}
                            </>
                        )}

                        {/* Success state */}
                        {successInfo && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                        <KeyRound className="h-4 w-4 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-emerald-400">
                                            {mode === 'create' ? 'Workspace created!' : `Joined "${successInfo.workspaceName}"!`}
                                        </p>
                                        <p className="text-xs text-[#9CA3AF] mt-0.5">Sync is now active.</p>
                                    </div>
                                </div>

                                {mode === 'create' && successInfo.inviteCode && (
                                    <div>
                                        <p className="text-xs text-[#9CA3AF] mb-2">Share this invite code with your teammate:</p>
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#1A1A2E] border border-[#2D2D44]">
                                            <span className="flex-1 font-mono text-lg font-bold text-[#A78BFA] tracking-widest text-center">
                                                {successInfo.inviteCode}
                                            </span>
                                            <button
                                                className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors px-2 py-1 rounded border border-[#2D2D44] hover:border-[#4B5563]"
                                                onClick={() => navigator.clipboard.writeText(successInfo.inviteCode!)}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                                {error}
                            </div>
                        )}

                        {/* Footer actions */}
                        <div className="flex items-center gap-3 pt-1">
                            {mode !== 'choose' && !successInfo && (
                                <button
                                    onClick={() => { setMode('choose'); setError(null) }}
                                    className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                                >
                                    ← Back
                                </button>
                            )}
                            <div className="flex-1" />
                            {successInfo ? (
                                <Button
                                    size="sm"
                                    onClick={handleClose}
                                    className="h-9 px-5 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13]"
                                >
                                    Done
                                </Button>
                            ) : mode === 'create' ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-[#9CA3AF] hover:text-[#E2E8F0] font-semibold">
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleCreate}
                                        disabled={loading || !supabaseUrl || !supabaseAnonKey || !email || !password || !workspaceName || !displayName}
                                        className="h-9 px-5 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] disabled:opacity-50"
                                    >
                                        {loading ? 'Creating…' : 'Create Workspace'}
                                    </Button>
                                </>
                            ) : mode === 'join' ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-[#9CA3AF] hover:text-[#E2E8F0] font-semibold">
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleJoin}
                                        disabled={loading || !supabaseUrl || !supabaseAnonKey || !email || !password || !inviteCode || !displayName}
                                        className="h-9 px-5 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] disabled:opacity-50"
                                    >
                                        {loading ? 'Joining…' : 'Join Workspace'}
                                    </Button>
                                </>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-[#9CA3AF] hover:text-[#E2E8F0] font-semibold">
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
