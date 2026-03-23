import { useEffect, useState } from 'react'
import { X, Cloud, Users, KeyRound, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore } from '@/store/useSyncStore'
import { getSyncStatusSummary } from '@/lib/collaboration'

interface SyncSetupDialogProps {
    open: boolean
    onClose: () => void
}

type Mode = 'choose' | 'create' | 'join'

export function SyncSetupDialog({ open, onClose }: SyncSetupDialogProps) {
    const auth = useAuthStore(s => s.auth)
    const [mode, setMode] = useState<Mode>('choose')
    const [workspaceName, setWorkspaceName] = useState('')
    const [inviteCode, setInviteCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successInfo, setSuccessInfo] = useState<{ inviteCode?: string; workspaceName?: string } | null>(null)

    const {
        config,
        status,
        workspaceInfo,
        workspaceInvite,
        createWorkspace,
        joinWorkspace,
        disconnect,
        loadWorkspaceInfo,
        loadWorkspaceInvite,
        rotateWorkspaceInvite,
        manualSync,
    } = useSyncStore()

    useEffect(() => {
        if (open && config?.configured) {
            loadWorkspaceInfo().catch(() => {})
        }
    }, [open, config?.configured, loadWorkspaceInfo])

    function reset() {
        setMode('choose')
        setWorkspaceName('')
        setInviteCode('')
        setError(null)
        setSuccessInfo(null)
        setLoading(false)
    }

    function handleClose() {
        reset()
        onClose()
    }

    const isConnectedWorkspace = !!config?.configured
    const isOwner = !!workspaceInfo?.canManageInvite
    const inviteMeta = workspaceInvite ?? null
    const syncSummary = getSyncStatusSummary({
        status,
        pendingCount: 0,
        error,
        workspaceName: workspaceInfo?.workspaceName ?? null,
    })

    async function handleCreate() {
        setError(null)
        setLoading(true)
        try {
            const result = await createWorkspace({
                workspaceName: workspaceName.trim(),
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
                inviteCode: inviteCode.trim().toUpperCase(),
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

    async function handleRevealInvite() {
        setError(null)
        setLoading(true)
        try {
            const result = await loadWorkspaceInvite()
            if (!result.ok) setError(result.error ?? 'Could not load invite code')
        } finally {
            setLoading(false)
        }
    }

    async function handleRotateInvite() {
        setError(null)
        setLoading(true)
        try {
            const result = await rotateWorkspaceInvite()
            if (!result.ok) {
                setError(result.error ?? 'Could not rotate invite code')
                return
            }
            navigator.clipboard.writeText((useSyncStore.getState().workspaceInvite?.inviteCode) ?? '').catch(() => {})
        } finally {
            setLoading(false)
        }
    }

    async function handleManualSync() {
        setError(null)
        setLoading(true)
        try {
            const result = await manualSync()
            if (!result.ok) setError(result.error ?? 'Manual sync failed')
        } finally {
            setLoading(false)
        }
    }

    async function handleDisconnect() {
        setError(null)
        setLoading(true)
        try {
            await disconnect()
            handleClose()
        } finally {
            setLoading(false)
        }
    }

    function formatInviteDate(value?: string | null) {
        if (!value) return 'Not set'
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
    }

    const accountSummary = (
        <div className="space-y-3">
            <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">Signed-In Account</p>
            <div className="rounded-xl border border-[#2D2D44] bg-[#161625] p-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-[#A78BFA]" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#E2E8F0]">{auth.user?.displayName ?? 'Signed-in user'}</p>
                        <p className="text-xs text-[#9CA3AF] mt-1">{auth.user?.email ?? 'Email unavailable'}</p>
                    </div>
                </div>
                {auth.usingOfflineSession && (
                    <p className="mt-3 text-xs text-amber-300">Using a cached offline session. Cloud calls may fail until network access is restored.</p>
                )}
            </div>
        </div>
    )

    return (
        <>
            <div
                className={cn(
                    'fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-200',
                    open ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                onClick={handleClose}
            />
            <div
                className={cn(
                    'fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 transition-all duration-200',
                    open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                )}
            >
                <div className="app-panel w-[480px] max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center gap-3 p-5 pb-4 border-b border-[#2D2D44]">
                        <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center shrink-0">
                            <Cloud className="h-4.5 w-4.5 text-[#A78BFA]" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#E2E8F0]">Cloud Sync Setup</p>
                            <p className="text-xs text-[#6B7280]">Manage workspace sync with your signed-in Supabase account</p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="ml-auto p-1 rounded-md text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#252535] transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="p-5 space-y-5">
                        {isConnectedWorkspace && !successInfo && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-[#2D2D44] bg-[#161625] p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-[#E2E8F0]">{workspaceInfo?.workspaceName || 'Connected Workspace'}</p>
                                            <p className="text-xs text-[#6B7280] mt-1">
                                                Role: <span className="text-[#9CA3AF]">{workspaceInfo?.currentUserRole || 'member'}</span>
                                            </p>
                                        </div>
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                                            {status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#9CA3AF]">Members: {workspaceInfo?.members?.length ?? 0}</p>
                                    <p className="text-xs text-[#9CA3AF]">{syncSummary.detail}</p>
                                    {workspaceInfo?.inviteCodeExpiresAt && (
                                        <p className="text-xs text-[#6B7280]">Invite expires: {formatInviteDate(workspaceInfo.inviteCodeExpiresAt)}</p>
                                    )}
                                </div>

                                {isOwner && (
                                    <div className="rounded-xl border border-[#2D2D44] bg-[#161625] p-4 space-y-3">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Owner Invite Controls</p>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={handleRevealInvite} disabled={loading} className="h-9 px-4 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13]">
                                                Reveal Invite
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleRotateInvite} disabled={loading} className="h-9 px-4 border-[#2D2D44] text-[#E2E8F0]">
                                                Rotate Invite
                                            </Button>
                                        </div>
                                        {inviteMeta && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#1A1A2E] border border-[#2D2D44]">
                                                    <span className="flex-1 font-mono text-sm font-bold text-[#A78BFA] tracking-widest text-center break-all">
                                                        {inviteMeta.inviteCode}
                                                    </span>
                                                    <button
                                                        className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors px-2 py-1 rounded border border-[#2D2D44] hover:border-[#4B5563]"
                                                        onClick={() => navigator.clipboard.writeText(inviteMeta.inviteCode)}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-[#6B7280]">
                                                    Rotated: {formatInviteDate(inviteMeta.inviteCodeRotatedAt)} · Expires: {formatInviteDate(inviteMeta.inviteCodeExpiresAt)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isOwner && (
                                    <div className="rounded-xl border border-[#2D2D44] bg-[#161625] p-4">
                                        <p className="text-xs text-[#9CA3AF]">Invite codes are only visible to workspace owners.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {!isConnectedWorkspace && mode === 'choose' && (
                            <>
                                <p className="text-xs text-[#9CA3AF] leading-relaxed">
                                    Cloud sync requires a fresh Supabase project bootstrapped with <code className="text-[#A78BFA] bg-[#1A1A2E] px-1 rounded">SUPABASE_SCHEMA.sql</code>. Follow the repo guide in <code className="text-[#A78BFA] bg-[#1A1A2E] px-1 rounded">SUPABASE_SETUP.md</code> before creating or joining a workspace.
                                </p>
                                <div className="rounded-xl border border-[#2D2D44] bg-[#161625] p-4 space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">What this unlocks</p>
                                    <p className="text-xs text-[#9CA3AF]">Shared handoffs, traceability, release queue status, and live collaboration presence for your QA/dev workflow.</p>
                                </div>
                                {accountSummary}
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
                                            <p className="text-xs text-[#6B7280] text-center mt-1">Start the shared workspace, become owner, and generate the first invite code</p>
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
                                            <p className="text-xs text-[#6B7280] text-center mt-1">Join an existing team workspace with an owner-provided invite code</p>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}

                        {!isConnectedWorkspace && mode === 'create' && !successInfo && (
                            <>
                                {accountSummary}
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
                            </>
                        )}

                        {!isConnectedWorkspace && mode === 'join' && !successInfo && (
                            <>
                                {accountSummary}
                                <div className="space-y-3">
                                    <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">Invite Code</p>
                                    <div>
                                        <label className="block text-xs text-[#9CA3AF] mb-1">Invite Code</label>
                                        <input
                                            className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors font-mono tracking-widest"
                                            placeholder="Paste invite code"
                                            value={inviteCode}
                                            onChange={e => setInviteCode(e.target.value)}
                                            maxLength={64}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

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
                                        <p className="text-xs text-[#9CA3AF] mt-0.5">
                                            {mode === 'create'
                                                ? 'You are the workspace owner. Share the invite code so your teammate can join.'
                                                : 'Sync is now active. Your role and shared workflow data will appear after the first refresh.'}
                                        </p>
                                    </div>
                                </div>

                                {mode === 'create' && successInfo.inviteCode && (
                                    <div>
                                        <p className="text-xs text-[#9CA3AF] mb-2">Share this invite code with your teammate:</p>
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#1A1A2E] border border-[#2D2D44]">
                                            <span className="flex-1 font-mono text-lg font-bold text-[#A78BFA] tracking-widest text-center break-all">
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

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-1">
                            {!isConnectedWorkspace && mode !== 'choose' && !successInfo && (
                                <button
                                    onClick={() => { setMode('choose'); setError(null) }}
                                    className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                                >
                                    Back
                                </button>
                            )}
                            <div className="flex-1" />
                            {isConnectedWorkspace && !successInfo ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={handleDisconnect} className="h-9 px-4 text-red-300 hover:text-red-200 font-semibold">
                                        Disconnect
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleManualSync}
                                        disabled={loading}
                                        className="h-9 px-5 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] disabled:opacity-50"
                                    >
                                        {loading ? 'Syncing...' : 'Sync Now'}
                                    </Button>
                                </>
                            ) : successInfo ? (
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
                                        disabled={loading || !workspaceName.trim() || auth.status !== 'signed_in'}
                                        className="h-9 px-5 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] disabled:opacity-50"
                                    >
                                        {loading ? 'Creating...' : 'Create Workspace'}
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
                                        disabled={loading || !inviteCode.trim() || auth.status !== 'signed_in'}
                                        className="h-9 px-5 font-bold bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] disabled:opacity-50"
                                    >
                                        {loading ? 'Joining...' : 'Join Workspace'}
                                    </Button>
                                </>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-[#9CA3AF] hover:text-[#E2E8F0] font-semibold">
                                    Close
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
