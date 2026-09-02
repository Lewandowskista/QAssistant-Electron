import { useEffect, useState } from 'react'
import { X, Cloud, Users, KeyRound, User } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
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
            <p className="text-xs text-muted-ui font-semibold uppercase tracking-wider">Signed-In Account</p>
            <div className="rounded-xl border border-ui bg-panel p-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-qa-accent/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-brand" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">{auth.user?.displayName ?? 'Signed-in user'}</p>
                        <p className="text-xs text-soft mt-1">{auth.user?.email ?? 'Email unavailable'}</p>
                    </div>
                </div>
                {auth.usingOfflineSession && (
                    <p className="mt-3 text-xs text-state-warning">Using a cached offline session. Cloud calls may fail until network access is restored.</p>
                )}
            </div>
        </div>
    )

    return (
        <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                    data-radix-dialog-overlay=""
                    className="fixed inset-0 z-layer-dialog bg-black/60 backdrop-blur-sm"
                />
                <DialogPrimitive.Content
                    data-radix-dialog-content=""
                    className="app-panel fixed left-1/2 top-1/2 z-layer-dialog w-[480px] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
                >
                    <div className="flex items-center gap-3 p-5 pb-4 border-b border-ui">
                        <div className="w-9 h-9 rounded-xl bg-qa-accent/10 flex items-center justify-center shrink-0">
                            <Cloud className="h-4.5 w-4.5 text-brand" />
                        </div>
                        <div>
                            <DialogPrimitive.Title className="text-sm font-bold text-foreground">Cloud sync setup</DialogPrimitive.Title>
                            <DialogPrimitive.Description className="text-xs text-muted-ui">Manage workspace sync with your signed-in Supabase account</DialogPrimitive.Description>
                        </div>
                        <DialogPrimitive.Close asChild>
                            <button
                                aria-label="Close"
                                className="ml-auto p-1 rounded-md text-muted-ui hover:text-foreground hover:bg-elevated transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </DialogPrimitive.Close>
                    </div>

                    <div className="p-5 space-y-5">
                        {auth.localMode ? (
                            <div className="rounded-xl border border-ui bg-panel p-4 space-y-2">
                                <p className="text-sm font-semibold text-foreground">Running in local mode</p>
                                <p className="text-xs text-soft leading-5">
                                    No cloud backend is configured, so workspace sync and collaboration are unavailable.
                                    All your projects and data are stored locally on this machine and remain fully usable.
                                </p>
                                <p className="text-xs text-muted-ui leading-5">
                                    To enable cloud sync, set <span className="font-mono text-brand">SUPABASE_URL</span> and{' '}
                                    <span className="font-mono text-brand">SUPABASE_ANON_KEY</span> for a live Supabase project, then restart the app.
                                </p>
                            </div>
                        ) : (
                        <>
                        {isConnectedWorkspace && !successInfo && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-ui bg-panel p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{workspaceInfo?.workspaceName || 'Connected Workspace'}</p>
                                            <p className="text-xs text-muted-ui mt-1">
                                                Role: <span className="text-soft">{workspaceInfo?.currentUserRole || 'member'}</span>
                                            </p>
                                        </div>
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-ui">
                                            {status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-soft">Members: {workspaceInfo?.members?.length ?? 0}</p>
                                    <p className="text-xs text-soft">{syncSummary.detail}</p>
                                    {workspaceInfo?.inviteCodeExpiresAt && (
                                        <p className="text-xs text-muted-ui">Invite expires: {formatInviteDate(workspaceInfo.inviteCodeExpiresAt)}</p>
                                    )}
                                </div>

                                {isOwner && (
                                    <div className="rounded-xl border border-ui bg-panel p-4 space-y-3">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-ui">Owner Invite Controls</p>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={handleRevealInvite} disabled={loading} className="h-9 px-4 font-bold bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground">
                                                Reveal Invite
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleRotateInvite} disabled={loading} className="h-9 px-4 border-ui text-foreground">
                                                Rotate Invite
                                            </Button>
                                        </div>
                                        {inviteMeta && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 p-3 rounded-lg bg-selected border border-ui">
                                                    <span className="flex-1 font-mono text-sm font-bold text-brand tracking-widest text-center break-all">
                                                        {inviteMeta.inviteCode}
                                                    </span>
                                                    <button
                                                        className="text-xs text-muted-ui hover:text-soft transition-colors px-2 py-1 rounded border border-ui hover:border-ui-strong"
                                                        onClick={() => navigator.clipboard.writeText(inviteMeta.inviteCode)}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-muted-ui">
                                                    Rotated: {formatInviteDate(inviteMeta.inviteCodeRotatedAt)} · Expires: {formatInviteDate(inviteMeta.inviteCodeExpiresAt)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isOwner && (
                                    <div className="rounded-xl border border-ui bg-panel p-4">
                                        <p className="text-xs text-soft">Invite codes are only visible to workspace owners.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {!isConnectedWorkspace && mode === 'choose' && (
                            <>
                                <p className="text-xs text-soft leading-relaxed">
                                    Cloud sync requires a fresh Supabase project bootstrapped with <code className="text-brand bg-selected px-1 rounded">SUPABASE_SCHEMA.sql</code>. Follow the repo guide in <code className="text-brand bg-selected px-1 rounded">SUPABASE_SETUP.md</code> before creating or joining a workspace.
                                </p>
                                <div className="rounded-xl border border-ui bg-panel p-4 space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-ui">What this unlocks</p>
                                    <p className="text-xs text-soft">Shared handoffs, traceability, release queue status, and live collaboration presence for your QA/dev workflow.</p>
                                </div>
                                {accountSummary}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setMode('create')}
                                        className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-ui hover:border-qa-accent/50 hover:bg-qa-accent/5 transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-qa-accent/10 flex items-center justify-center group-hover:bg-qa-accent/20 transition-colors">
                                            <Cloud className="h-5 w-5 text-brand" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground text-center">Create Workspace</p>
                                            <p className="text-xs text-muted-ui text-center mt-1">Start the shared workspace, become owner, and generate the first invite code</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setMode('join')}
                                        className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-ui hover:border-qa-accent/50 hover:bg-qa-accent/5 transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-qa-accent/10 flex items-center justify-center group-hover:bg-qa-accent/20 transition-colors">
                                            <Users className="h-5 w-5 text-brand" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground text-center">Join Workspace</p>
                                            <p className="text-xs text-muted-ui text-center mt-1">Join an existing team workspace with an owner-provided invite code</p>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}

                        {!isConnectedWorkspace && mode === 'create' && !successInfo && (
                            <>
                                {accountSummary}
                                <div className="space-y-3">
                                    <p className="text-xs text-muted-ui font-semibold uppercase tracking-wider">Workspace</p>
                                    <div>
                                        <label className="block text-xs text-soft mb-1">Workspace Name</label>
                                        <input
                                            className="w-full bg-selected border border-ui rounded-lg px-3 py-2 text-sm text-foreground placeholder-text-muted focus:outline-none focus:border-qa-accent transition-colors"
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
                                    <p className="text-xs text-muted-ui font-semibold uppercase tracking-wider">Invite Code</p>
                                    <div>
                                        <label className="block text-xs text-soft mb-1">Invite Code</label>
                                        <input
                                            className="w-full bg-selected border border-ui rounded-lg px-3 py-2 text-sm text-foreground placeholder-text-muted focus:outline-none focus:border-qa-accent transition-colors font-mono tracking-widest"
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
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-state-success-soft border border-state-success-border">
                                    <div className="w-8 h-8 rounded-lg bg-state-success/20 flex items-center justify-center shrink-0">
                                        <KeyRound className="h-4 w-4 text-state-success" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-state-success">
                                            {mode === 'create' ? 'Workspace created!' : `Joined "${successInfo.workspaceName}"!`}
                                        </p>
                                        <p className="text-xs text-soft mt-0.5">
                                            {mode === 'create'
                                                ? 'You are the workspace owner. Share the invite code so your teammate can join.'
                                                : 'Sync is now active. Your role and shared workflow data will appear after the first refresh.'}
                                        </p>
                                    </div>
                                </div>

                                {mode === 'create' && successInfo.inviteCode && (
                                    <div>
                                        <p className="text-xs text-soft mb-2">Share this invite code with your teammate:</p>
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-selected border border-ui">
                                            <span className="flex-1 font-mono text-lg font-bold text-brand tracking-widest text-center break-all">
                                                {successInfo.inviteCode}
                                            </span>
                                            <button
                                                className="text-xs text-muted-ui hover:text-soft transition-colors px-2 py-1 rounded border border-ui hover:border-ui-strong"
                                                onClick={() => navigator.clipboard.writeText(successInfo.inviteCode!)}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        </>
                        )}

                        {error && !auth.localMode && (
                            <div className="p-3 rounded-lg bg-state-danger-soft border border-state-danger-border text-xs text-state-danger">
                                {error}
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-1">
                            {!isConnectedWorkspace && mode !== 'choose' && !successInfo && (
                                <button
                                    onClick={() => { setMode('choose'); setError(null) }}
                                    className="text-xs text-muted-ui hover:text-soft transition-colors"
                                >
                                    Back
                                </button>
                            )}
                            <div className="flex-1" />
                            {isConnectedWorkspace && !successInfo ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={handleDisconnect} className="h-9 px-4 text-state-danger hover:text-state-danger font-semibold">
                                        Disconnect
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleManualSync}
                                        disabled={loading}
                                        className="h-9 px-5 font-bold bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground disabled:opacity-50"
                                    >
                                        {loading ? 'Syncing…' : 'Sync Now'}
                                    </Button>
                                </>
                            ) : successInfo ? (
                                <Button
                                    size="sm"
                                    onClick={handleClose}
                                    className="h-9 px-5 font-bold bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground"
                                >
                                    Done
                                </Button>
                            ) : mode === 'create' ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-soft hover:text-foreground font-semibold">
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleCreate}
                                        disabled={loading || !workspaceName.trim() || auth.status !== 'signed_in'}
                                        className="h-9 px-5 font-bold bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground disabled:opacity-50"
                                    >
                                        {loading ? 'Creating…' : 'Create Workspace'}
                                    </Button>
                                </>
                            ) : mode === 'join' ? (
                                <>
                                    <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-soft hover:text-foreground font-semibold">
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleJoin}
                                        disabled={loading || !inviteCode.trim() || auth.status !== 'signed_in'}
                                        className="h-9 px-5 font-bold bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground disabled:opacity-50"
                                    >
                                        {loading ? 'Joining...' : 'Join Workspace'}
                                    </Button>
                                </>
                            ) : (
                                <Button variant="ghost" size="sm" onClick={handleClose} className="h-9 px-4 text-soft hover:text-foreground font-semibold">
                                    Close
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
