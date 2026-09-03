/* cspell:disable-file */
/* cspell:words testplans ATATT aistudio Lewandowskista */
import { useState, useEffect, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
    Zap, Globe, Cpu, Share2, Database, Search,
    Plus, X, Edit2, Check, Copy, RefreshCw, ExternalLink,
    Eye, EyeOff, Trash2, Upload, Download, Bell, Sun, User, LogOut, AlertTriangle, BookOpen
} from "lucide-react"
import { useTheme } from "@/hooks/useTheme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useProjectStore } from "@/store/useProjectStore"
import { useUserStore } from "@/store/useUserStore"
import { useAuthStore } from "@/store/useAuthStore"
import { useSettingsStore } from "@/store/useSettingsStore"
import { LinearConnection, JiraConnection } from "@/types/project"
import type { AppUpdateState } from "@/types/update"
import type { UserRole, AuthProvider } from "@/types/user"
import { useConfirm } from "@/components/ConfirmDialog"
import { CompactPageHeader, InlineStatusSummary, PageScaffold, SettingsSectionNav, SurfaceBlock } from "@/components/ui/workspace"
import { toast } from "sonner"
import { sanitizeProjectForPersistence } from "@/lib/projectSanitization"
import type { LucideIcon } from "lucide-react"
import { safeInvoke } from "@/lib/safeInvoke"
import type { PerformanceMode } from "@/lib/performanceMode"

// ── tiny helpers ──────────────────────────────────────────────────────────────
type StatusState = { msg: string; ok: boolean } | null
type CredentialStorageStatus = Awaited<ReturnType<typeof window.electronAPI.getCredentialStorageStatus>>

const SETTINGS_GROUPS: Array<{ label: string; sections: Array<{ id: string; label: string; icon: LucideIcon }> }> = [
    {
        label: "Workspace",
        sections: [
            { id: "account", label: "Account", icon: User },
            { id: "appearance", label: "Appearance", icon: Sun },
            { id: "general", label: "General", icon: Database },
        ],
    },
    {
        label: "Integrations",
        sections: [
            { id: "linear", label: "Linear", icon: Zap },
            { id: "jira", label: "Jira", icon: Globe },
            { id: "sharing", label: "Project Sharing", icon: Upload },
            { id: "webhooks", label: "Webhooks", icon: Bell },
            { id: "automation", label: "Automation API", icon: Share2 },
        ],
    },
    {
        label: "AI",
        sections: [
            { id: "gemini", label: "Google AI Studio", icon: Cpu },
            { id: "nim", label: "NVIDIA NIM", icon: Cpu },
            { id: "ollama", label: "Ollama (Local)", icon: Cpu },
        ],
    },
    {
        label: "App",
        sections: [
            { id: "updates", label: "Updates", icon: Download },
            { id: "docs", label: "Documentation", icon: BookOpen },
            { id: "diagnostics", label: "Diagnostics", icon: Search },
        ],
    },
]

const SETTINGS_SECTIONS: Array<{ id: string; label: string; icon: LucideIcon }> =
    SETTINGS_GROUPS.flatMap((group) => group.sections)

function StatusBanner({ s }: { s: StatusState }) {
    if (!s) return null
    return (
        <div className={`mt-3 rounded-xl border px-4 py-2.5 text-xs font-semibold ${s.ok ? 'app-status-success' : 'app-status-danger'}`}>
            {s.msg}
        </div>
    )
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`app-panel p-6 ${className}`}>
            {children}
        </div>
    )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="app-section-label mb-4">{children}</p>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <Label className="app-field-label">{children}</Label>
}

const inp = "h-10 rounded-xl text-sm"

function formatUpdateStatus(state: AppUpdateState): string {
    switch (state.status) {
        case 'checking':
            return 'Checking for updates...'
        case 'available':
            return state.availableVersion ? `Version ${state.availableVersion} is available.` : 'An update is available.'
        case 'none':
            return 'You are running the latest version.'
        case 'downloading':
            return `Downloading update${state.downloadProgressPercent !== undefined ? ` (${Math.round(state.downloadProgressPercent)}%)` : ''}...`
        case 'downloaded':
            return state.availableVersion ? `Version ${state.availableVersion} is ready to install.` : 'Update downloaded and ready to install.'
        case 'error':
            return state.errorMessage || 'The update check failed.'
        case 'disabled':
            return 'Auto-update is unavailable for this build or platform.'
        default:
            return 'Check for updates to compare this install with the latest GitHub release.'
    }
}

function formatUpdateCheckTime(value?: number): string {
    if (!value) return 'Not checked yet'
    return new Date(value).toLocaleString()
}

// ── Components ────────────────────────────────────────────────────────────────
function Sec({ id, title, icon, children, activeSection }: { 
    id: string; title: string; icon: React.ReactNode; children: React.ReactNode;
    activeSection: string | null;
}) {
    const open = activeSection === id
    if (!open) return null
    return (
        <SectionCard className="space-y-5">
            <div className="flex items-center gap-3">
                <span className="text-primary opacity-90">{icon}</span>
                <div>
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    <p className="app-helper-text">Focused configuration for this area.</p>
                </div>
            </div>
            <div className="border-t app-divider pt-5 space-y-4">{children}</div>
        </SectionCard>
    )
}

function ConnCard({ label, subtitle, onEdit, onDelete }: { label: string; subtitle: string; onEdit: () => void; onDelete: () => void }) {
    return (
        <div className="app-panel-muted flex items-center justify-between px-4 py-3">
            <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-ui mt-0.5">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 px-3 text-primary hover:bg-primary/10 text-xs" onClick={onEdit}><Edit2 className="h-3 w-3 mr-1" />Edit</Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-ui hover:text-state-danger hover:bg-state-danger-soft" onClick={onDelete}><X className="h-3.5 w-3.5" /></Button>
            </div>
        </div>
    )
}

function FormPanel({ title, onSave, onTest, onCancel, children, status }: {
    title: string; onSave: () => void; onTest?: () => void; onCancel: () => void;
    children: React.ReactNode; status: StatusState
}) {
    return (
        <div className="app-panel-muted p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {children}
            <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="h-8" onClick={onSave}><Check className="h-3.5 w-3.5 mr-1" />Save</Button>
                {onTest && <Button variant="outline" size="sm" className="h-8" onClick={onTest}>Test</Button>}
                <Button variant="ghost" size="sm" className="h-8 text-state-danger hover:bg-state-danger-soft" onClick={onCancel}>Cancel</Button>
            </div>
            <StatusBanner s={status} />
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const api = window.electronAPI
    const saveSettingsStore = useSettingsStore(s => s.save)
    const performanceMode = useSettingsStore(s => s.settings.performanceMode ?? 'auto')
    const resolvedPerformanceMode = useSettingsStore(s => s.resolvedPerformanceMode)
    const respectReducedMotion = useSettingsStore(s => s.settings.respectReducedMotion === true)
    const { projects, activeProjectId, updateProject, importProject, purgeAllProjects } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const [showSecrets, setShowSecrets] = useState(false)
    const [appVersion, setAppVersion] = useState('')
    const [dataPath, setDataPath] = useState('')
    const [sysInfo, setSysInfo] = useState<any>(null)
    const [perfMetrics, setPerfMetrics] = useState<{ main: Record<string, number>; renderer: Record<string, number>; counters: Record<string, number> } | null>(null)
    const requestedSection = searchParams.get("section") ?? "account"
    const activeSection = SETTINGS_SECTIONS.some((section) => section.id === requestedSection) ? requestedSection : "account"
    const { theme, toggleTheme } = useTheme()

    // ── Global settings state ─────────────────────────────────────────────────
    const [sapContext, setSapContext] = useState(false)
    const [minimizeToTray, setMinimizeToTray] = useState(false)
    const [autoCheckForUpdates, setAutoCheckForUpdates] = useState(true)
    const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>({ status: 'idle', currentVersion: '' })

    // ── Automation API ────────────────────────────────────────────────────────
    const [apiEnabled, setApiEnabled] = useState(false)
    const [apiPort, setApiPort] = useState('5248')
    const [apiKey, setApiKey] = useState('')
    const [apiKeyVisible, setApiKeyVisible] = useState(false)
    const [automationStatus, setAutomationStatus] = useState<StatusState>(null)

    // ── Linear connections ────────────────────────────────────────────────────
    const linearConns: LinearConnection[] = activeProject?.linearConnections || []
    const [linearStatus, setLinearStatus] = useState<StatusState>(null)
    const [linearForm, setLinearForm] = useState<{
        open: boolean; editId: string | null; label: string; apiKey: string; teamId: string
    }>({ open: false, editId: null, label: '', apiKey: '', teamId: '' })

    // ── Jira connections ──────────────────────────────────────────────────────
    const jiraConns: JiraConnection[] = activeProject?.jiraConnections || []
    const [jiraStatus, setJiraStatus] = useState<StatusState>(null)
    const [jiraForm, setJiraForm] = useState<{
        open: boolean; editId: string | null; label: string; domain: string; email: string; apiToken: string; projectKey: string
    }>({ open: false, editId: null, label: '', domain: '', email: '', apiToken: '', projectKey: '' })

    // ── Gemini ────────────────────────────────────────────────────────────────
    const [geminiKey, setGeminiKey] = useState('')
    const [geminiModel, setGeminiModel] = useState('gemini-3.5-flash')
    const [geminiStatus, setGeminiStatus] = useState<StatusState>(null)
    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [modelsLoading, setModelsLoading] = useState(false)

    // ── Ollama (local) ────────────────────────────────────────────────────────
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState('')
    const [ollamaModel, setOllamaModel] = useState('')
    const [ollamaStatusMsg, setOllamaStatusMsg] = useState<StatusState>(null)
    const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null)
    const [ollamaModels, setOllamaModels] = useState<import('../types/electron').OllamaModelInfoEntry[]>([])
    const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false)
    const [ollamaHealthMap, setOllamaHealthMap] = useState<Record<string, { status: 'up' | 'degraded' | 'down'; latencyMs: number; error?: string }>>({})
    const [ollamaHealthLoading, setOllamaHealthLoading] = useState(false)

    // ── NVIDIA NIM ────────────────────────────────────────────────────────────
    const [nimKey, setNimKey] = useState('')
    const [nimModel, setNimModel] = useState('')
    const [nimStatus, setNimStatus] = useState<StatusState>(null)
    const [nimAvailableModels, setNimAvailableModels] = useState<string[]>([])
    const [nimModelsLoading, setNimModelsLoading] = useState(false)
    const [nimHealthMap, setNimHealthMap] = useState<Record<string, { status: 'up' | 'degraded' | 'down'; latencyMs: number; error?: string }>>({})
    const [nimHealthLoading, setNimHealthLoading] = useState(false)
    const [nimModelMeta, setNimModelMeta] = useState<Record<string, import('../types/electron').NimModelMetaEntry>>({})
    const [nimSuggestedModel, setNimSuggestedModel] = useState<string | null>(null)

    const [storedCreds, setStoredCreds] = useState<string[]>([])

    // ── Project sharing ───────────────────────────────────────────────────────
    const [shareStatus, setShareStatus] = useState<StatusState>(null)

    // ── Webhook ───────────────────────────────────────────────────────────────
    interface WebhookConfig { id: string; name: string; url: string; type: 'Slack' | 'Teams' | 'Generic'; isEnabled: boolean; notifyOnTestPlanFail: boolean; notifyOnHighPriorityDone: boolean; notifyOnDueDate: boolean; notifyOnAiAnalysis: boolean; notifyOnHandoffSent?: boolean; notifyOnReadyForQa?: boolean; notifyOnVerificationFailed?: boolean; notifyOnPrLinkedToHandoff?: boolean; }
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
    const [webhookForm, setWebhookForm] = useState<{ open: boolean; editId: string | null; name: string; url: string; type: WebhookConfig['type']; notifyOnTestPlanFail: boolean; notifyOnHighPriorityDone: boolean; notifyOnDueDate: boolean; notifyOnAiAnalysis: boolean; notifyOnHandoffSent: boolean; notifyOnReadyForQa: boolean; notifyOnVerificationFailed: boolean; notifyOnPrLinkedToHandoff: boolean; }>({ open: false, editId: null, name: '', url: '', type: 'Slack', notifyOnTestPlanFail: true, notifyOnHighPriorityDone: false, notifyOnDueDate: false, notifyOnAiAnalysis: false, notifyOnHandoffSent: true, notifyOnReadyForQa: true, notifyOnVerificationFailed: true, notifyOnPrLinkedToHandoff: true })
    const [webhookStatus, setWebhookStatus] = useState<StatusState>(null)
    const [webhookTesting, setWebhookTesting] = useState(false)
    const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirm()

    // ── User / Identity ───────────────────────────────────────────────────────
    const { profile, isLoaded: userLoaded, loadProfile, setRole, addIdentity, removeIdentity } = useUserStore()
    const auth = useAuthStore(s => s.auth)
    const signOut = useAuthStore(s => s.signOut)
    const [oauthConnecting, setOauthConnecting] = useState<AuthProvider | null>(null)
    const [oauthStatus, setOauthStatus] = useState<StatusState>(null)

    // ── Credential storage status ─────────────────────────────────────────────
    const [credStorageStatus, setCredStorageStatus] = useState<CredentialStorageStatus | null>(null)
    const [allowInsecureCredentialStorage, setAllowInsecureCredentialStorage] = useState(false)

    // ── Orphaned attachments ──────────────────────────────────────────────────
    type OrphanEntry = { filePath: string; fileName: string; fileSizeBytes: number }
    const [orphanScanResult, setOrphanScanResult] = useState<{ orphaned: OrphanEntry[]; totalSize: number } | null>(null)
    const [orphanScanning, setOrphanScanning] = useState(false)
    const [orphanDeleting, setOrphanDeleting] = useState(false)

    const handleSectionChange = useCallback((sectionId: string) => {
        const next = new URLSearchParams(searchParams)
        if (sectionId === "account") next.delete("section")
        else next.set("section", sectionId)
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const handleScanOrphans = useCallback(async () => {
        setOrphanScanning(true)
        setOrphanScanResult(null)
        try {
            const referencedPaths: string[] = []
            for (const project of projects) {
                project.files.forEach(f => referencedPaths.push(f.filePath))
                project.notes.forEach(n => n.attachments.forEach(a => referencedPaths.push(a.filePath)))
            }
            const result = await api.scanOrphanedAttachments(referencedPaths)
            setOrphanScanResult(result)
        } finally {
            setOrphanScanning(false)
        }
    }, [api, projects])

    const handleDeleteOrphans = useCallback(async () => {
        if (!orphanScanResult || orphanScanResult.orphaned.length === 0) return
        setOrphanDeleting(true)
        try {
            const { deleted } = await api.deleteOrphanedAttachments(orphanScanResult.orphaned.map(o => o.filePath))
            toast.success(`Deleted ${deleted} orphaned file${deleted !== 1 ? 's' : ''}.`)
            setOrphanScanResult(null)
        } finally {
            setOrphanDeleting(false)
        }
    }, [api, orphanScanResult])

    // ── Load user profile + OAuth listener ───────────────────────────────────
    useEffect(() => {
        if (!userLoaded) loadProfile()
        api.getCredentialStorageStatus?.().then(s => setCredStorageStatus(s))
    }, [])

    useEffect(() => {
        const unsub = window.electronAPI.onOAuthComplete(async ({ provider, userInfo }) => {
            setOauthConnecting(null)
            await addIdentity({
                provider: provider as AuthProvider,
                providerId: userInfo.providerId,
                username: userInfo.username,
                email: userInfo.email,
                avatarUrl: userInfo.avatarUrl,
                connectedAt: Date.now(),
            })
            flash(setOauthStatus, `Connected to ${provider === 'github' ? 'GitHub' : 'Linear'} as ${userInfo.username}`, true)
        })
        return unsub
    }, [addIdentity])

    const handleOAuthConnect = async (provider: AuthProvider) => {
        setOauthConnecting(provider)
        flash(setOauthStatus, `Opening ${provider === 'github' ? 'GitHub' : 'Linear'} authorization in your browser…`, true, 8000)
        const result = await safeInvoke(
            () => window.electronAPI.oauthStart(provider),
            'Failed to start authorization'
        )
        setOauthConnecting(null)
        if (result && !result.success) {
            flash(setOauthStatus, result.error || 'Failed to start authorization', false)
        }
    }

    const handleOAuthDisconnect = async (provider: AuthProvider) => {
        const name = provider === 'github' ? 'GitHub' : 'Linear'
        const confirmed = await confirmDialog(`Disconnect ${name}`, { description: `Remove your ${name} identity from QAssistant?`, destructive: true })
        if (!confirmed) return
        await safeInvoke(
            () => window.electronAPI.oauthLogout(provider),
            `Failed to disconnect ${name}`
        )
        await removeIdentity(provider)
        flash(setOauthStatus, `${name} identity removed.`, true)
    }

    const handleSupabaseSignOut = async () => {
        const confirmed = await confirmDialog('Sign out', {
            description: 'Sign out of the Supabase-backed desktop session? Local projects stay on disk.',
            destructive: true,
        })
        if (!confirmed) return
        await signOut()
        // AppAuthBoundary detects the signed_out status and shows AuthGate automatically
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const settings = await api.readSettingsFile()
            setSapContext(!!settings.sapCommerceContext)
            setMinimizeToTray(!!settings.minimizeToTray)
            setAutoCheckForUpdates(settings.autoCheckForUpdates !== false)
            setAllowInsecureCredentialStorage(settings.allowInsecureCredentialStorage === true)
            setApiEnabled(!!settings.automationApiEnabled)
            setApiPort(settings.automationPort || '5248')
            setWebhooks(settings.webhooks || [])

            const projectPrefix = activeProject ? `project:${activeProject.id}:` : ''

            const [storedKey, storedGemini, storedNim, ver, path, info, updateState, perfSnapshot] = await Promise.all([
                activeProject ? api.secureStoreGet(`${projectPrefix}automation_api_key`) : Promise.resolve(null),
                activeProject ? api.secureStoreGet(`${projectPrefix}gemini_api_key`) : Promise.resolve(null),
                activeProject ? api.secureStoreGet(`${projectPrefix}nim_api_key`) : Promise.resolve(null),
                api.getAppVersion(),
                api.getAppDataPath(),
                api.getSystemInfo(),
                api.getAppUpdateState(),
                api.getPerformanceMetrics?.() ?? Promise.resolve(null),
            ])
            if (storedKey) setApiKey(storedKey)
            if (storedGemini) setGeminiKey(storedGemini)
            if (activeProject?.geminiModel) setGeminiModel(activeProject.geminiModel)
            if (storedNim) setNimKey(storedNim)
            if (activeProject?.nimModel) setNimModel(activeProject.nimModel)
            if (activeProject?.ollamaBaseUrl) setOllamaBaseUrl(activeProject.ollamaBaseUrl)
            if (activeProject?.ollamaModel) setOllamaModel(activeProject.ollamaModel)
            setAppVersion(ver || '')
            setDataPath(path || '')
            setSysInfo(info)
            setAppUpdateState(updateState)
            if (perfSnapshot) {
                setPerfMetrics({
                    main: perfSnapshot.main || {},
                    renderer: perfSnapshot.renderer || {},
                    counters: perfSnapshot.counters || {},
                })
            }
        }
        load()
    }, [activeProjectId, activeProject?.geminiModel, activeProject?.nimModel])

    useEffect(() => {
        const unsub = api.onAppUpdateStatus((state) => {
            setAppUpdateState(state)
            if (state.status === 'available' && state.availableVersion && state.availableVersion !== appVersion) {
                const deferredVersion = useSettingsStore.getState().settings.deferredVersion
                if (deferredVersion !== state.availableVersion) {
                    toast.info(`Update ${state.availableVersion} is available.`)
                }
            }
            if (state.status === 'downloaded' && state.availableVersion) {
                toast.success(`Update ${state.availableVersion} is ready to install.`)
            }
            if (state.status === 'error' && state.errorMessage) {
                toast.error(state.errorMessage)
            }
        })
        return unsub
    }, [api, appVersion])

    const saveSetting = useCallback(async (patch: Record<string, unknown>) => {
        await saveSettingsStore(patch)
    }, [saveSettingsStore])

    const refreshCredentialStorageStatus = useCallback(async () => {
        const status = await api.getCredentialStorageStatus?.()
        if (status) setCredStorageStatus(status)
        return status
    }, [api])

    const ensureCredentialWritesAllowed = useCallback(async (setStatus: (s: StatusState) => void, blockedMessage?: string) => {
        const status = await refreshCredentialStorageStatus()
        if (status?.canPersistSecrets === false) {
            flash(setStatus, blockedMessage || 'Credential storage is blocked until insecure plaintext storage is explicitly allowed in Settings.', false, 6000)
            return false
        }
        return true
    }, [refreshCredentialStorageStatus])

    const flash = (set: (s: StatusState) => void, msg: string, ok: boolean, ms = 3000) => {
        set({ msg, ok })
        setTimeout(() => set(null), ms)
    }

    const handleAutoCheckForUpdatesToggle = async () => {
        const next = !autoCheckForUpdates
        setAutoCheckForUpdates(next)
        await saveSetting({ autoCheckForUpdates: next })
    }

    const handleCheckForUpdates = async () => {
        const state = await api.checkForAppUpdate()
        setAppUpdateState(state)
    }

    const handleDownloadUpdate = async () => {
        const state = await api.downloadAppUpdate()
        setAppUpdateState(state)
    }

    const handleInstallUpdate = async () => {
        await api.installAppUpdate()
    }

    const handleLaterUpdate = async () => {
        if (!appUpdateState.availableVersion) return
        await api.dismissAppUpdate(appUpdateState.availableVersion)
        await saveSetting({ deferredVersion: appUpdateState.availableVersion })
        toast.info(`QAssistant will remind you about ${appUpdateState.availableVersion} later.`)
    }

    // ── Automation API helpers ────────────────────────────────────────────────
    const handleApiToggle = async () => {
        const next = !apiEnabled
        setApiEnabled(next)
        await saveSetting({ automationApiEnabled: next })

        if (next) {
            await api.automationApiStart({ apiKey, port: parseInt(apiPort) })
            flash(setAutomationStatus, `Automation API started on port ${apiPort}`, true)
        } else {
            await api.automationApiStop()
            flash(setAutomationStatus, 'Automation API stopped.', true)
        }
    }

    const handleSavePort = async () => {
        const p = parseInt(apiPort)
        if (isNaN(p) || p < 1024 || p > 65535) {
            flash(setAutomationStatus, 'Invalid port. Use 1024–65535.', false); return
        }
        await saveSetting({ automationPort: apiPort })

        if (apiEnabled) {
            await api.automationApiRestart({ apiKey, port: p })
            flash(setAutomationStatus, `API restarted on port ${p}.`, true)
        } else {
            flash(setAutomationStatus, `Port ${p} saved. Toggle API to apply.`, true)
        }
    }

    const handleRegenerateKey = async () => {
        if (!(await ensureCredentialWritesAllowed(setAutomationStatus, 'Automation API keys cannot be saved until insecure plaintext storage is explicitly allowed in Settings.'))) return
        const newKey = crypto.randomUUID().replace(/-/g, '')
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreSet(`${prefix}automation_api_key`, newKey)
        setApiKey(newKey)
        if (apiEnabled) {
            await api.automationApiRestart({ apiKey: newKey, port: parseInt(apiPort) })
            flash(setAutomationStatus, 'API key regenerated and API restarted. Update your test runners.', true)
        } else {
            flash(setAutomationStatus, 'API key regenerated. Update your test runners.', true)
        }
    }

    const handleCopyKey = () => {
        navigator.clipboard.writeText(apiKey)
        flash(setAutomationStatus, 'API key copied to clipboard.', true)
    }

    // ── Linear helpers ────────────────────────────────────────────────────────
    const openLinearAdd = () => setLinearForm({ open: true, editId: null, label: '', apiKey: '', teamId: '' })

    const fillLinearFromOAuth = async () => {
        const token = await api.secureStoreGet('oauth_linear_access_token')
        if (!token) {
            flash(setLinearStatus, 'No Linear OAuth token found. Connect via Account & Identity first.', false)
            return
        }
        // Check expiry - the credential is stored as epoch ms by oauth.ts
        const expiresAtStr = await api.secureStoreGet('oauth_linear_expires_at')
        if (expiresAtStr) {
            const expiresAt = Number(expiresAtStr)
            if (!isNaN(expiresAt) && expiresAt < Date.now()) {
                flash(setLinearStatus, 'Your Linear OAuth token has expired. Please reconnect via Account & Identity.', false)
                return
            }
        }
        const identity = profile?.identities.find(i => i.provider === 'linear')
        setLinearForm(f => ({
            ...f,
            apiKey: token,
            label: f.label || (identity?.username ? `${identity.username}'s Linear` : 'Linear (OAuth)'),
        }))
        flash(setLinearStatus, 'OAuth token loaded. Add your Team ID and save.', true)
    }
    const openLinearEdit = async (c: LinearConnection) => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const storedKey = await api.secureStoreGet(`${prefix}linear_api_key_${c.id}`) || ''
        setLinearForm({ open: true, editId: c.id, label: c.label, apiKey: storedKey, teamId: c.teamId })
    }
    const cancelLinear = () => { setLinearForm(f => ({ ...f, open: false })); setLinearStatus(null) }

    const saveLinear = async () => {
        const { editId, label, apiKey: key, teamId } = linearForm
        if (!label.trim() || !teamId.trim()) { flash(setLinearStatus, 'Label and Team ID are required.', false); return }
        if (!editId && !key.trim()) { flash(setLinearStatus, 'API Key is required for a new connection.', false); return }
        if (!activeProject) return
        if (key.trim() && !(await ensureCredentialWritesAllowed(setLinearStatus, 'Linear API keys cannot be saved until insecure plaintext storage is explicitly allowed in Settings.'))) return

        let conns = [...linearConns]
        if (!editId) {
            const conn: LinearConnection = { id: crypto.randomUUID(), label: label.trim(), teamId: teamId.trim() }
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            await api.secureStoreSet(`${prefix}linear_api_key_${conn.id}`, key.trim())
            conns = [...conns, conn]
        } else {
            conns = conns.map(c => c.id === editId ? { ...c, label: label.trim(), teamId: teamId.trim() } : c)
            if (key.trim()) {
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                await api.secureStoreSet(`${prefix}linear_api_key_${editId}`, key.trim())
            }
        }
        await updateProject(activeProject.id, { linearConnections: conns })
        setLinearForm(f => ({ ...f, open: false }))
        flash(setLinearStatus, 'Connection saved.', true)
    }

    const deleteLinear = async (id: string) => {
        if (!activeProject) return
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreDelete(`${prefix}linear_api_key_${id}`)
        await updateProject(activeProject.id, { linearConnections: linearConns.filter(c => c.id !== id) })
        flash(setLinearStatus, 'Connection removed.', true)
    }

    const testLinear = async () => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const key = linearForm.apiKey || (linearForm.editId ? await api.secureStoreGet(`${prefix}linear_api_key_${linearForm.editId}`) : '')
        if (!key) { flash(setLinearStatus, 'Enter an API Key first.', false); return }
        flash(setLinearStatus, 'Testing connection…', true)
        try {
            const teams = await api.testLinearConnection({ apiKey: key })
            flash(setLinearStatus, `Connected successfully. Found ${Array.isArray(teams) ? teams.length : 0} team(s).`, true)
        } catch (e: any) {
            flash(setLinearStatus, `Connection failed: ${e.message}`, false)
        }
    }

    // ── Jira helpers ─────────────────────────────────────────────────────────
    const openJiraAdd = () => setJiraForm({ open: true, editId: null, label: '', domain: '', email: '', apiToken: '', projectKey: '' })
    const openJiraEdit = async (c: JiraConnection) => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const token = await api.secureStoreGet(`${prefix}jira_api_token_${c.id}`) || ''
        setJiraForm({ open: true, editId: c.id, label: c.label, domain: c.domain, email: c.email, apiToken: token, projectKey: c.projectKey })
    }
    const cancelJira = () => { setJiraForm(f => ({ ...f, open: false })); setJiraStatus(null) }

    const saveJira = async () => {
        const { editId, label, domain, email, apiToken, projectKey } = jiraForm
        if (!label.trim() || !domain.trim() || !email.trim() || !projectKey.trim()) {
            flash(setJiraStatus, 'Label, Domain, Email and Project Key are required.', false); return
        }
        if (!editId && !apiToken.trim()) { flash(setJiraStatus, 'API Token is required for a new connection.', false); return }
        if (!activeProject) return
        if (apiToken.trim() && !(await ensureCredentialWritesAllowed(setJiraStatus, 'Jira API tokens cannot be saved until insecure plaintext storage is explicitly allowed in Settings.'))) return

        let conns = [...jiraConns]
        if (!editId) {
            const conn: JiraConnection = { id: crypto.randomUUID(), label: label.trim(), domain: domain.trim(), email: email.trim(), projectKey: projectKey.trim() }
            const prefix = activeProject ? `project:${activeProject.id}:` : ''
            await api.secureStoreSet(`${prefix}jira_api_token_${conn.id}`, apiToken.trim())
            conns = [...conns, conn]
        } else {
            conns = conns.map(c => c.id === editId ? { ...c, label: label.trim(), domain: domain.trim(), email: email.trim(), projectKey: projectKey.trim() } : c)
            if (apiToken.trim()) {
                const prefix = activeProject ? `project:${activeProject.id}:` : ''
                await api.secureStoreSet(`${prefix}jira_api_token_${editId}`, apiToken.trim())
            }
        }
        await updateProject(activeProject.id, { jiraConnections: conns })
        setJiraForm(f => ({ ...f, open: false }))
        flash(setJiraStatus, 'Connection saved.', true)
    }

    const deleteJira = async (id: string) => {
        if (!activeProject) return
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreDelete(`${prefix}jira_api_token_${id}`)
        await updateProject(activeProject.id, { jiraConnections: jiraConns.filter(c => c.id !== id) })
        flash(setJiraStatus, 'Connection removed.', true)
    }

    const testJira = async () => {
        const { domain, email, apiToken, editId } = jiraForm
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const token = apiToken || (editId ? await api.secureStoreGet(`${prefix}jira_api_token_${editId}`) : '')
        if (!domain || !email || !token) { flash(setJiraStatus, 'Fill in Domain, Email and API Token first.', false); return }
        flash(setJiraStatus, 'Testing connection…', true)
        try {
            const projects = await api.testJiraConnection({ domain, email, apiToken: token })
            flash(setJiraStatus, `Connected! Found ${Array.isArray(projects) ? projects.length : 0} accessible project(s).`, true)
        } catch (e: any) {
            flash(setJiraStatus, `Connection failed: ${e.message}`, false)
        }
    }


    // ── Gemini ────────────────────────────────────────────────────────────────
    const saveGemini = async () => {
        if (!geminiKey.trim()) { flash(setGeminiStatus, 'Enter your API key.', false); return }
        if (!(await ensureCredentialWritesAllowed(setGeminiStatus, 'Gemini API keys cannot be saved until insecure plaintext storage is explicitly allowed in Settings.'))) return
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreSet(`${prefix}gemini_api_key`, geminiKey.trim())
        if (activeProject) {
            await updateProject(activeProject.id, { geminiModel })
        }
        flash(setGeminiStatus, 'Google AI Studio settings saved.', true)
    }

    const checkGeminiModels = async () => {
        if (!geminiKey.trim()) { flash(setGeminiStatus, 'Enter your API key first.', false); return }
        setModelsLoading(true)
        flash(setGeminiStatus, 'Fetching available models…', true)
        try {
            const models = await api.aiListModels({ apiKey: geminiKey.trim() })
            if (models && models.length > 0) {
                setAvailableModels(models)
                flash(setGeminiStatus, `${models.length} models available — select one below.`, true, 6000)
            } else {
                flash(setGeminiStatus, 'No models found. Check your API key.', false)
            }
        } catch (e: any) {
            flash(setGeminiStatus, `Error: ${e.message}`, false)
        } finally {
            setModelsLoading(false)
        }
    }

    // ── Ollama (local) ────────────────────────────────────────────────────────
    // No credential to store: Ollama runs unauthenticated on localhost, so the whole config is
    // the (optional) base URL plus which installed model to prefer.
    const saveOllama = async () => {
        if (activeProject) {
            await updateProject(activeProject.id, {
                ollamaBaseUrl: ollamaBaseUrl.trim() || undefined,
                ollamaModel: ollamaModel || undefined,
                aiProvider: 'ollama',
            })
        }
        flash(setOllamaStatusMsg, 'Ollama settings saved. This project now runs AI fully locally.', true)
    }

    const checkOllama = async () => {
        setOllamaModelsLoading(true)
        flash(setOllamaStatusMsg, 'Contacting Ollama…', true)
        try {
            const res: any = await api.ollamaStatus({ baseUrl: ollamaBaseUrl.trim() || undefined })
            if (res?.__isError) throw new Error(res.message)
            setOllamaReachable(!!res.reachable)
            if (!res.reachable) {
                setOllamaModels([])
                flash(setOllamaStatusMsg, 'Ollama is not reachable. Is the daemon running?', false, 8000)
                return
            }
            const installed: any = await api.ollamaInstalledModels({ baseUrl: ollamaBaseUrl.trim() || undefined })
            const list = Array.isArray(installed) ? installed : []
            setOllamaModels(list)
            if (list.length === 0) {
                flash(setOllamaStatusMsg, 'Ollama is running but has no chat models. Pull one, e.g. `ollama pull gpt-oss:20b`.', false, 10000)
                return
            }
            if (!ollamaModel || !res.models?.includes(ollamaModel)) setOllamaModel(res.models?.[0] || list[0].name)
            flash(setOllamaStatusMsg, `Connected — ${list.length} local model${list.length === 1 ? '' : 's'} available.`, true, 6000)
        } catch (e: any) {
            setOllamaReachable(false)
            flash(setOllamaStatusMsg, `Error: ${e.message}`, false, 8000)
        } finally {
            setOllamaModelsLoading(false)
        }
    }

    const checkOllamaHealth = async () => {
        if (ollamaModels.length === 0) return
        setOllamaHealthLoading(true)
        flash(setOllamaStatusMsg, 'Probing local models — the first response loads the model from disk and can take a while…', true, 10000)
        try {
            const names = ollamaModels.map(m => m.name)
            const res: any = await api.ollamaProbeModels({ baseUrl: ollamaBaseUrl.trim() || undefined, models: names })
            if (res?.__isError) throw new Error(res.message)
            setOllamaHealthMap(res || {})
            const up = Object.values(res || {}).filter((h: any) => h.status === 'up').length
            flash(setOllamaStatusMsg, `${up}/${names.length} model${names.length === 1 ? '' : 's'} responding.`, true, 6000)
        } catch (e: any) {
            flash(setOllamaStatusMsg, `Error: ${e.message}`, false, 8000)
        } finally {
            setOllamaHealthLoading(false)
        }
    }

    // ── NVIDIA NIM ────────────────────────────────────────────────────────────
    const saveNim = async () => {
        if (!nimKey.trim()) { flash(setNimStatus, 'Enter your NIM API key.', false); return }
        if (!(await ensureCredentialWritesAllowed(setNimStatus, 'NIM API keys cannot be saved until insecure plaintext storage is explicitly allowed in Settings.'))) return
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreSet(`${prefix}nim_api_key`, nimKey.trim())
        if (activeProject) {
            await updateProject(activeProject.id, { nimModel: nimModel || undefined, aiProvider: 'nim' })
        }
        flash(setNimStatus, 'NVIDIA NIM settings saved. This project is now using NIM as the AI provider.', true)
    }

    const checkNimModels = async () => {
        if (!nimKey.trim()) { flash(setNimStatus, 'Enter your NIM API key first.', false); return }
        setNimModelsLoading(true)
        flash(setNimStatus, 'Fetching available NIM models…', true)
        try {
            const [models, meta] = await Promise.all([
                api.nimListModels({ apiKey: nimKey.trim() }),
                api.nimGetModelMetadata(),
            ])
            if (models && models.length > 0) {
                setNimAvailableModels(models)
                setNimModelMeta(meta ?? {})
                if (!nimModel) setNimModel(models[0])
                flash(setNimStatus, `${models.length} text models available — select one below.`, true, 6000)
            } else {
                flash(setNimStatus, 'No models found. Check your API key.', false)
            }
        } catch (e: any) {
            flash(setNimStatus, `Error: ${e.message}`, false)
        } finally {
            setNimModelsLoading(false)
        }
    }

    const checkNimHealth = async () => {
        const models = nimAvailableModels.length > 0 ? nimAvailableModels : []
        if (models.length === 0) { flash(setNimStatus, 'Fetch available models first.', false); return }
        if (!nimKey.trim()) { flash(setNimStatus, 'Enter your NIM API key first.', false); return }
        setNimHealthLoading(true)
        flash(setNimStatus, 'Probing model health (this may take a moment)…', true)
        try {
            const map = await api.nimProbeModels({ apiKey: nimKey.trim(), models })
            setNimHealthMap(map)

            // Sort: up first by latency asc, then degraded by latency asc, then down
            const statusOrder = { up: 0, degraded: 1, down: 2 }
            const sorted = [...models].sort((a, b) => {
                const ha = map[a], hb = map[b]
                const sa = ha ? statusOrder[ha.status] : 2
                const sb = hb ? statusOrder[hb.status] : 2
                if (sa !== sb) return sa - sb
                return (ha?.latencyMs ?? 99999) - (hb?.latencyMs ?? 99999)
            })
            setNimAvailableModels(sorted)

            // Compute suggestion: best QA score among up/degraded models
            const liveModels = sorted.filter(m => map[m]?.status !== 'down')
            let best: string | null = null
            let bestScore = -1
            for (const m of liveModels) {
                const meta = nimModelMeta[m]
                if (meta && meta.qaScore > bestScore) { bestScore = meta.qaScore; best = m }
            }
            setNimSuggestedModel(best)

            const up = Object.values(map).filter(e => e.status === 'up').length
            const degraded = Object.values(map).filter(e => e.status === 'degraded').length
            flash(setNimStatus, `Health check complete — ${up} up, ${degraded} degraded, ${models.length - up - degraded} down.`, true, 8000)
        } catch (e: any) {
            flash(setNimStatus, `Error: ${e.message}`, false)
        } finally {
            setNimHealthLoading(false)
        }
    }

    const refreshStoredCreds = async () => {
        if (!activeProject) { setStoredCreds([]); return }
        const all = await api.secureStoreList()
        const prefix = `project:${activeProject.id}:`
        const filtered = (all || []).map((c: any) => typeof c === 'string' ? c : c.account).filter((a: string) => a.startsWith(prefix))
        setStoredCreds(filtered.map((a: string) => a.replace(prefix, '')))
    }

    useEffect(() => {
        refreshStoredCreds()
    }, [activeProjectId])

    // ── Project sharing ───────────────────────────────────────────────────────
    const exportProject = async () => {
        if (!activeProject) { flash(setShareStatus, 'No project selected.', false); return }
        const content = JSON.stringify(sanitizeProjectForPersistence(activeProject), null, 2)
        await api.saveFileDialog({ defaultName: `${activeProject.name.replace(/\s+/g, '_')}_export.json`, content })
        flash(setShareStatus, 'Project exported. Environment passwords, API keys, and tokens were stripped and must be re-entered on the target machine.', true, 6000)
    }

    const importProjectFromFile = async () => {
        const filePath = await api.selectFile()
        if (!filePath) return
        try {
            const res = await api.readJsonFile(filePath)
            if (res.success && res.data) {
                await importProject(res.data)
                flash(setShareStatus, 'Project imported successfully. Embedded environment credentials were stripped for safety.', true)
            } else {
                flash(setShareStatus, `Import failed: ${res.error || 'Invalid file format'}`, false)
            }
        } catch (e: any) {
            flash(setShareStatus, `Import failed: ${e.message}`, false)
        }
    }


    return (
        <>
        <div className="flex h-full flex-col overflow-hidden bg-background">
            <PageScaffold className="flex min-h-0 flex-1 max-w-none flex-col">
                <CompactPageHeader
                    eyebrow="Workspace preferences"
                    title="Settings"
                    description={activeProject ? `Configuring ${activeProject.name}` : "Account, app behavior, integrations, and diagnostics"}
                    summary={(
                        <InlineStatusSummary
                            items={[
                                activeSection ? SETTINGS_SECTIONS.find((section) => section.id === activeSection)?.label : null,
                                theme === "dark" ? "dark theme" : "light theme",
                                activeProject ? activeProject.name : "no active project",
                            ]}
                        />
                    )}
                    actions={(
                        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setShowSecrets(s => !s)}>
                            {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span>{showSecrets ? 'Hide secrets' : 'Reveal secrets'}</span>
                        </Button>
                    )}
                />

                {credStorageStatus?.encrypted === false && (
                    <SurfaceBlock className="flex-none border-state-warning/40 bg-state-warning-soft px-4 py-3">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-state-warning" />
                            <div className="flex-1 space-y-3">
                                <p className="text-xs leading-relaxed text-state-warning">
                                    <span className="font-bold">Credentials are stored unencrypted.</span> Your OS keyring and Electron safeStorage are both unavailable on this system. API keys and tokens can only be written to disk in plaintext.
                                </p>
                                <div className="flex items-center justify-between gap-4">
                                    <p className="text-[11px] leading-relaxed text-state-warning/90">
                                        {credStorageStatus?.acknowledged
                                            ? 'Plaintext fallback is currently allowed on this device. Secret fields remain in a degraded security mode.'
                                            : 'Plaintext fallback is blocked until you explicitly allow this degraded mode.'}
                                    </p>
                                    <Switch
                                        on={allowInsecureCredentialStorage}
                                        onToggle={async () => {
                                            const next = !allowInsecureCredentialStorage
                                            setAllowInsecureCredentialStorage(next)
                                            await saveSetting({ allowInsecureCredentialStorage: next })
                                            await refreshCredentialStorageStatus()
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </SurfaceBlock>
                )}

                <div className="settings-layout min-h-0 flex-1">
                    <div className="min-h-0 overflow-y-auto custom-scrollbar pr-1">
                        <div className="sticky top-0 space-y-3">
                            {SETTINGS_GROUPS.map((group) => (
                                <div key={group.label}>
                                    <div className="app-section-label px-3 pb-1.5">{group.label}</div>
                                    <SettingsSectionNav
                                        items={group.sections.map((section) => ({
                                            id: section.id,
                                            label: section.label,
                                            icon: section.icon,
                                        }))}
                                        value={activeSection}
                                        onChange={handleSectionChange}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-0 overflow-y-auto custom-scrollbar pr-1">
                        <div className="space-y-4">

                {/* ── ACCOUNT & IDENTITY ───────────────────────────────────── */}
                <Sec id="account" title="Account & Identity" icon={<User className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>{auth.localMode ? 'Local Session' : 'Supabase Session'}</SectionLabel>
                    <div className="flex items-center justify-between rounded-xl border border-ui bg-app px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-foreground">{auth.user?.displayName ?? 'Signed-in user'}</p>
                            <p className="text-xs text-muted-ui mt-1">
                                {auth.localMode
                                    ? 'Running locally · no cloud backend configured'
                                    : `${auth.user?.email ?? 'Email unavailable'} · ${auth.usingOfflineSession ? 'offline cached session' : 'verified session'}`}
                            </p>
                        </div>
                        {!auth.localMode && (
                            <Button variant="ghost" size="sm" className="h-8 text-state-danger hover:bg-state-danger-soft font-bold" onClick={handleSupabaseSignOut}>
                                <LogOut className="h-3.5 w-3.5 mr-1" />Sign Out
                            </Button>
                        )}
                    </div>

                    <SectionLabel>Role</SectionLabel>
                    <div className="flex items-center gap-3">
                        {(['qa', 'dev'] as UserRole[]).map(r => (
                            <button
                                key={r}
                                onClick={() => setRole(r)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                    (profile?.activeRole ?? 'qa') === r
                                        ? 'bg-primary text-primary-foreground border-qa-accent'
                                        : 'bg-transparent text-soft border-ui hover:border-qa-accent/50'
                                }`}
                            >
                                {r === 'qa' ? 'QA Engineer' : 'Developer'}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-ui mt-1">Role controls which features are visible in the sidebar.</p>

                    <div className="mt-2 border-t border-ui pt-4 space-y-3">
                        <SectionLabel>Connected Identities</SectionLabel>

                        {/* GitHub */}
                        {(() => {
                            const identity = profile?.identities.find(i => i.provider === 'github')
                            return identity ? (
                                <div className="flex items-center justify-between bg-app border border-ui rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        {identity.avatarUrl
                                            ? <img src={identity.avatarUrl} className="w-8 h-8 rounded-full" alt="avatar" />
                                            : <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center"><User className="h-4 w-4 text-muted-ui" /></div>
                                        }
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">GitHub · {identity.username}</p>
                                            {identity.email && <p className="text-xs text-muted-ui">{identity.email}</p>}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-8 text-state-danger hover:bg-state-danger-soft font-bold" onClick={() => handleOAuthDisconnect('github')}>
                                        <LogOut className="h-3.5 w-3.5 mr-1" />Disconnect
                                    </Button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleOAuthConnect('github')}
                                    disabled={oauthConnecting === 'github'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-ui text-sm text-soft hover:border-qa-accent/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {oauthConnecting === 'github' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                    {oauthConnecting === 'github' ? 'Opening browser…' : 'Connect with GitHub'}
                                </button>
                            )
                        })()}

                        {/* Linear */}
                        {(() => {
                            const identity = profile?.identities.find(i => i.provider === 'linear')
                            return identity ? (
                                <div className="flex items-center justify-between bg-app border border-ui rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        {identity.avatarUrl
                                            ? <img src={identity.avatarUrl} className="w-8 h-8 rounded-full" alt="avatar" />
                                            : <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center"><User className="h-4 w-4 text-muted-ui" /></div>
                                        }
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">Linear · {identity.username}</p>
                                            {identity.email && <p className="text-xs text-muted-ui">{identity.email}</p>}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-8 text-state-danger hover:bg-state-danger-soft font-bold" onClick={() => handleOAuthDisconnect('linear')}>
                                        <LogOut className="h-3.5 w-3.5 mr-1" />Disconnect
                                    </Button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleOAuthConnect('linear')}
                                    disabled={oauthConnecting === 'linear'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-ui text-sm text-soft hover:border-qa-accent/50 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {oauthConnecting === 'linear' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                    {oauthConnecting === 'linear' ? 'Opening browser…' : 'Connect with Linear'}
                                </button>
                            )
                        })()}

                        <StatusBanner s={oauthStatus} />
                        <p className="text-xs text-muted-ui pt-1">
                            OAuth requires you to register a GitHub or Linear OAuth app and set <code className="bg-app px-1 rounded">GITHUB_CLIENT_ID</code> / <code className="bg-app px-1 rounded">LINEAR_CLIENT_ID</code> environment variables before building.
                        </p>
                    </div>
                </Sec>

                {/* ── APPEARANCE ───────────────────────────────────────────── */}
                <Sec id="appearance" title="Appearance" icon={<Sun className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>Theme</SectionLabel>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Light Mode</p>
                            <p className="text-xs text-muted-ui mt-0.5">Switch between dark and light interface theme.</p>
                        </div>
                        <Switch on={theme === 'light'} onToggle={toggleTheme} />
                    </div>
                    <div className="mt-4 space-y-3">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Performance Profile</p>
                            <p className="text-xs text-muted-ui mt-0.5">Auto uses a lighter visual mode on macOS Intel. Balanced preserves the current look, while Performance reduces blur, shadows, and non-essential animation.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { value: 'auto', label: 'Auto' },
                                { value: 'balanced', label: 'Balanced' },
                                { value: 'performance', label: 'Performance' },
                            ] as Array<{ value: PerformanceMode; label: string }>).map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => { void saveSetting({ performanceMode: option.value }) }}
                                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                                        performanceMode === option.value
                                            ? 'border-qa-accent/40 bg-qa-accent/10 text-foreground'
                                            : 'border-ui text-soft hover:border-qa-accent/30 hover:text-foreground'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-ui">
                            Resolved for this machine: <span className="text-foreground font-semibold capitalize">{resolvedPerformanceMode}</span>
                        </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Respect System Reduced Motion</p>
                            <p className="text-xs text-muted-ui mt-0.5">When on, honor your OS &ldquo;reduce motion&rdquo; setting and disable animations. Off (default) keeps the app&rsquo;s designed motion regardless of the system preference.</p>
                        </div>
                        <Switch
                            on={respectReducedMotion}
                            label="Respect system reduced-motion setting"
                            onToggle={() => { void saveSetting({ respectReducedMotion: !respectReducedMotion }) }}
                        />
                    </div>
                </Sec>

                {/* ── GENERAL ─────────────────────────────────────────────── */}
                <Sec id="general" title="General" icon={<Database className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>App Behavior</SectionLabel>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">SAP Commerce Context</p>
                                <p className="text-xs text-muted-ui mt-0.5">Include SAP Hybris domain knowledge in AI prompts for platform-aware test generation.</p>
                            </div>
                            <Switch on={sapContext} onToggle={async () => {
                                const next = !sapContext; setSapContext(next)
                                await saveSetting({ sapCommerceContext: next })
                            }} />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-qa-accent/5 border border-qa-accent/10 rounded-xl">
                            <div>
                                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    Minimize to Tray
                                    <span className="text-[11px] px-1.5 py-0.5 bg-qa-accent/20 text-brand rounded-md font-black uppercase tracking-wider">New</span>
                                </p>
                                <p className="text-xs text-muted-ui mt-0.5">When closing the window, keep the app running in the system tray.</p>
                            </div>
                            <Switch on={minimizeToTray} onToggle={async () => {
                                const next = !minimizeToTray; setMinimizeToTray(next)
                                await saveSetting({ minimizeToTray: next })
                            }} />
                        </div>
                    </div>
                </Sec>

                {/* ── AUTOMATION API ───────────────────────────────────────── */}
                <Sec id="automation" title="Automation API" icon={<Share2 className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>REST API for CI/CD Integration</SectionLabel>

                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm font-semibold text-foreground">Enable Automation API</p>
                            <p className="text-xs text-muted-ui mt-0.5">Starts a local HTTP server your test runners can call.</p>
                        </div>
                        <Switch on={apiEnabled} onToggle={handleApiToggle} />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>Port</FieldLabel>
                            <div className="flex gap-2">
                                <Input value={apiPort} onChange={e => setApiPort(e.target.value)} className={`${inp} w-28 font-mono text-center`} />
                                <Button variant="outline" size="sm" className="h-10 border-ui text-soft font-bold" onClick={handleSavePort}>Save Port</Button>
                            </div>
                            <p className="text-[11px] text-muted-ui mt-1">Default: 5248 · Restart or toggle to apply</p>
                        </div>
                        <div>
                            <FieldLabel>API Key</FieldLabel>
                            <div className="flex gap-2">
                                <Input
                                    type={apiKeyVisible ? 'text' : 'password'}
                                    readOnly
                                    value={apiKey}
                                    className={`${inp} font-mono text-[11px] flex-1`}
                                    placeholder="Click Regenerate to create a key"
                                />
                                <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-muted-ui" onClick={() => setApiKeyVisible(v => !v)}>
                                    {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Button variant="ghost" size="sm" className="h-8 px-3 text-soft gap-1.5 text-xs" onClick={handleCopyKey} disabled={!apiKey}>
                                    <Copy className="h-3 w-3" />Copy Key
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 px-3 text-state-danger gap-1.5 text-xs hover:bg-state-danger-soft" onClick={handleRegenerateKey}>
                                    <RefreshCw className="h-3 w-3" />Regenerate Key
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-ui mt-1">Header: <code className="font-mono bg-panel-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code></p>
                        </div>
                    </div>

                    <StatusBanner s={automationStatus} />

                    <div className="mt-4 bg-background border border-ui rounded-xl p-4">
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-ui mb-2">Endpoints</p>
                        <pre className="text-[11px] font-mono text-soft leading-5 whitespace-pre-wrap">{`GET  /api/projects
GET  /api/projects/{id}/testplans
GET  /api/projects/{id}/testcases
GET  /api/projects/{id}/testcases?planId={guid}
GET  /api/projects/{id}/testcases/{tcId}
GET  /api/projects/{id}/executions
POST /api/projects/{id}/executions
POST /api/projects/{id}/executions/batch`}</pre>
                        <p className="text-[11px] text-muted-ui mt-2">POST body: <code className="font-mono">{"{ testCaseDisplayId, result, actualResult, notes }"}</code></p>
                    </div>
                </Sec>

                {/* ── LINEAR ──────────────────────────────────────────────── */}
                <Sec id="linear" title="Linear" icon={<Zap className="h-4 w-4" />} activeSection={activeSection}>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <SectionLabel>Connections</SectionLabel>
                            <p className="text-xs text-muted-ui -mt-3 mb-4">
                                Use a Personal API Key, or{' '}
                                {profile?.identities.find(i => i.provider === 'linear')
                                    ? <span className="text-brand font-semibold">OAuth token from your connected Linear account</span>
                                    : <span>connect via <strong>Account &amp; Identity</strong> to use OAuth</span>
                                }.
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-brand font-bold text-xs" onClick={() => api.openUrl('https://linear.app/settings/api')}><ExternalLink className="h-3.5 w-3.5" />Get API Key</Button>
                    </div>

                    <div className="space-y-2">
                        {linearConns.length === 0 && <p className="text-xs text-muted-ui italic">No connections configured.</p>}
                        {linearConns.map(c => (
                            <ConnCard key={c.id} label={c.label} subtitle={`Team: ${c.teamId}`}
                                onEdit={() => openLinearEdit(c)} onDelete={() => deleteLinear(c.id)} />
                        ))}
                    </div>

                    {!linearForm.open && (
                        <Button variant="ghost" size="sm" className="mt-3 h-8 gap-1.5 text-brand font-bold text-xs" onClick={openLinearAdd}>
                            <Plus className="h-3.5 w-3.5" /> Add Connection
                        </Button>
                    )}

                    {linearForm.open && (
                        <div className="mt-3">
                            <FormPanel
                                title={linearForm.editId ? `Edit: ${linearForm.label}` : 'New Connection'}
                                onSave={saveLinear} onTest={testLinear} onCancel={cancelLinear} status={linearStatus}
                            >
                                <div className="space-y-2">
                                    {profile?.identities.find(i => i.provider === 'linear') && !linearForm.editId && (
                                        <button
                                            type="button"
                                            onClick={fillLinearFromOAuth}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-qa-accent/40 text-xs text-brand hover:bg-qa-accent/10 transition-colors font-semibold"
                                        >
                                            <Zap className="h-3.5 w-3.5" />
                                            Use OAuth token from {profile.identities.find(i => i.provider === 'linear')?.username}
                                        </button>
                                    )}
                                    <div><FieldLabel>Label</FieldLabel>
                                        <Input value={linearForm.label} onChange={e => setLinearForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Frontend, Backend" className={inp} />
                                    </div>
                                    <div><FieldLabel>API Key {linearForm.editId && <span className="text-muted-ui font-normal">(leave blank to keep existing)</span>}</FieldLabel>
                                        <Input type={showSecrets ? 'text' : 'password'} value={linearForm.apiKey} onChange={e => setLinearForm(f => ({ ...f, apiKey: e.target.value }))} placeholder="lin_api_... or OAuth token" className={inp} />
                                    </div>
                                    <div><FieldLabel>Team ID</FieldLabel>
                                        <Input value={linearForm.teamId} onChange={e => setLinearForm(f => ({ ...f, teamId: e.target.value }))} placeholder="Your Linear Team ID" className={inp} />
                                        <p className="text-[11px] text-muted-ui mt-1">linear.app → Settings → Team → copy the ID from the URL</p>
                                    </div>
                                </div>
                            </FormPanel>
                        </div>
                    )}
                    {!linearForm.open && <StatusBanner s={linearStatus} />}
                </Sec>

                {/* ── JIRA ────────────────────────────────────────────────── */}
                <Sec id="jira" title="Atlassian Jira" icon={<Globe className="h-4 w-4" />} activeSection={activeSection}>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <SectionLabel>Connections</SectionLabel>
                            <p className="text-xs text-muted-ui -mt-3 mb-4">Get your API token from id.atlassian.com → Security → API tokens</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-brand font-bold text-xs" onClick={() => api.openUrl('https://id.atlassian.com/manage-profile/security/api-tokens')}><ExternalLink className="h-3.5 w-3.5" />Get API Token</Button>
                    </div>

                    <div className="space-y-2">
                        {jiraConns.length === 0 && <p className="text-xs text-muted-ui italic">No connections configured.</p>}
                        {jiraConns.map(c => (
                            <ConnCard key={c.id} label={c.label} subtitle={`${c.domain}.atlassian.net · ${c.projectKey}`}
                                onEdit={() => openJiraEdit(c)} onDelete={() => deleteJira(c.id)} />
                        ))}
                    </div>

                    {!jiraForm.open && (
                        <Button variant="ghost" size="sm" className="mt-3 h-8 gap-1.5 text-brand font-bold text-xs" onClick={openJiraAdd}>
                            <Plus className="h-3.5 w-3.5" /> Add Connection
                        </Button>
                    )}

                    {jiraForm.open && (
                        <div className="mt-3">
                            <FormPanel
                                title={jiraForm.editId ? `Edit: ${jiraForm.label}` : 'New Connection'}
                                onSave={saveJira} onTest={testJira} onCancel={cancelJira} status={jiraStatus}
                            >
                                <div className="space-y-2">
                                    <div><FieldLabel>Label</FieldLabel>
                                        <Input value={jiraForm.label} onChange={e => setJiraForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Frontend, Backend OMS" className={inp} />
                                    </div>
                                    <div><FieldLabel>Domain</FieldLabel>
                                        <Input value={jiraForm.domain} onChange={e => setJiraForm(f => ({ ...f, domain: e.target.value }))} placeholder="your-company (from your-company.atlassian.net)" className={inp} />
                                    </div>
                                    <div><FieldLabel>Email</FieldLabel>
                                        <Input type="email" value={jiraForm.email} onChange={e => setJiraForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" className={inp} />
                                    </div>
                                    <div><FieldLabel>API Token {jiraForm.editId && <span className="text-muted-ui font-normal">(leave blank to keep existing)</span>}</FieldLabel>
                                        <Input type={showSecrets ? 'text' : 'password'} value={jiraForm.apiToken} onChange={e => setJiraForm(f => ({ ...f, apiToken: e.target.value }))} placeholder="ATATT3xF..." className={inp} />
                                    </div>
                                    <div><FieldLabel>Project Key</FieldLabel>
                                        <Input value={jiraForm.projectKey} onChange={e => setJiraForm(f => ({ ...f, projectKey: e.target.value }))} placeholder="e.g. QA, DEV, PROJ" className={inp} />
                                        <p className="text-[11px] text-muted-ui mt-1">The short key shown before issue numbers e.g. QA-123</p>
                                    </div>
                                </div>
                            </FormPanel>
                        </div>
                    )}
                    {!jiraForm.open && <StatusBanner s={jiraStatus} />}
                </Sec>

                {/* ── GOOGLE AI ────────────────────────────────────────────── */}
                <Sec id="gemini" title="Google AI Studio" icon={<Cpu className="h-4 w-4" />} activeSection={activeSection}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-muted-ui">Get your API key from aistudio.google.com → API Keys</p>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-brand font-bold text-xs" onClick={() => api.openUrl('https://aistudio.google.com/apikey')}><ExternalLink className="h-3.5 w-3.5" />Get API Key</Button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>API Key</FieldLabel>
                            <Input type={showSecrets ? 'text' : 'password'} value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." className={inp} />
                        </div>
                        <div>
                            <FieldLabel>Preferred Model</FieldLabel>
                            {availableModels.length > 0 ? (
                                <select
                                    className={`${inp} w-full appearance-none px-3 cursor-pointer`}
                                    value={availableModels.includes(geminiModel) ? geminiModel : '__custom__'}
                                    onChange={(e) => {
                                        if (e.target.value !== '__custom__') setGeminiModel(e.target.value)
                                    }}
                                >
                                    {availableModels.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                    {!availableModels.includes(geminiModel) && (
                                        <option value="__custom__">{geminiModel} (current)</option>
                                    )}
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <select
                                        className={`${inp} flex-1 appearance-none px-3 cursor-pointer`}
                                        value={['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3-flash-preview'].includes(geminiModel) ? geminiModel : 'custom'}
                                        onChange={(e) => {
                                            if (e.target.value !== 'custom') setGeminiModel(e.target.value)
                                        }}
                                    >
                                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (recommended)</option>
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                        <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                                        <option value="custom">-- Custom / Other --</option>
                                    </select>
                                    {(!['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3-flash-preview'].includes(geminiModel)) && (
                                        <Input
                                            value={geminiModel}
                                            onChange={e => setGeminiModel(e.target.value)}
                                            placeholder="Model ID, e.g. gemini-3.5-flash"
                                            className={`${inp} flex-1`}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold h-9" onClick={saveGemini}>Save Gemini Settings</Button>
                        <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold" onClick={checkGeminiModels} disabled={modelsLoading}>
                            {modelsLoading ? 'Fetching…' : availableModels.length > 0 ? 'Refresh Models' : 'Check Available Models'}
                        </Button>
                    </div>
                    <StatusBanner s={geminiStatus} />
                </Sec>

                {/* ── NVIDIA NIM ───────────────────────────────────────────── */}
                <Sec id="nim" title="NVIDIA NIM" icon={<Cpu className="h-4 w-4" />} activeSection={activeSection}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-muted-ui">Use NVIDIA NIM hosted models as your project's AI backend. Only text/instruction models are shown.</p>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-brand font-bold text-xs" onClick={() => api.openUrl('https://build.nvidia.com/explore/discover')}><ExternalLink className="h-3.5 w-3.5" />Get API Key</Button>
                    </div>
                    <div className={`grid gap-4 ${nimAvailableModels.length > 0 ? '' : 'sm:grid-cols-2'}`}>
                        <div className={nimAvailableModels.length > 0 ? 'sm:max-w-xs' : ''}>
                            <FieldLabel>API Key</FieldLabel>
                            <Input type={showSecrets ? 'text' : 'password'} value={nimKey} onChange={e => setNimKey(e.target.value)} placeholder="nvapi-..." className={inp} />
                        </div>
                        <div>
                            <FieldLabel>Preferred Model</FieldLabel>
                            {nimAvailableModels.length > 0 ? (
                                <>
                                <select
                                    className={`${inp} w-full appearance-none px-3 cursor-pointer`}
                                    value={nimAvailableModels.includes(nimModel) ? nimModel : (nimAvailableModels[0] || '')}
                                    onChange={e => setNimModel(e.target.value)}
                                >
                                    {nimAvailableModels.map(m => {
                                        const health = nimHealthMap[m]
                                        const meta = nimModelMeta[m]
                                        const dot = health ? (health.status === 'up' ? '🟢' : health.status === 'degraded' ? '🟡' : '🔴') : '⚪'
                                        const latency = health ? ` ${health.latencyMs}ms` : ''
                                        const scores = meta ? ` | QA:${meta.qaScore} I:${meta.instruction} R:${meta.reasoning} C:${meta.coding}` : ''
                                        const ctx = meta ? ` ${meta.contextK}K ctx` : ''
                                        return <option key={m} value={m}>{dot} {m}{latency}{ctx}{scores}</option>
                                    })}
                                </select>
                                {/* Score legend */}
                                {Object.keys(nimModelMeta).length > 0 && (
                                    <p className="text-[11px] text-muted-ui mt-1 leading-tight">
                                        QA = composite QA score &nbsp;·&nbsp; I = instruction-following &nbsp;·&nbsp; R = reasoning &nbsp;·&nbsp; C = coding (0–100)
                                    </p>
                                )}
                                {/* Suggestion banner — shown after health check */}
                                {nimSuggestedModel && (
                                    <div className="mt-2 rounded-md border border-qa-accent/40 bg-qa-accent/8 px-3 py-2 flex items-start gap-2">
                                        <span className="text-brand text-xs font-bold shrink-0 mt-0.5">✦ Best for QA</span>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[11px] text-foreground font-semibold break-all">{nimSuggestedModel}</span>
                                            {nimModelMeta[nimSuggestedModel] && (
                                                <span className="ml-2 text-[11px] text-soft">
                                                    QA:{nimModelMeta[nimSuggestedModel].qaScore}&nbsp;
                                                    {nimHealthMap[nimSuggestedModel]?.latencyMs ? `· ${nimHealthMap[nimSuggestedModel].latencyMs}ms` : ''}
                                                    {nimModelMeta[nimSuggestedModel].notes ? ` · ${nimModelMeta[nimSuggestedModel].notes}` : ''}
                                                </span>
                                            )}
                                            <button
                                                className="ml-2 text-[11px] text-brand underline hover:text-qa-accent cursor-pointer"
                                                onClick={() => setNimModel(nimSuggestedModel)}
                                                type="button"
                                            >Use this</button>
                                        </div>
                                    </div>
                                )}
                                </>
                            ) : (
                                <Input
                                    value={nimModel}
                                    onChange={e => setNimModel(e.target.value)}
                                    placeholder="e.g. meta/llama-3.1-70b-instruct"
                                    className={inp}
                                />
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <Button size="sm" className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold h-9" onClick={saveNim}>Save NIM Settings</Button>
                        <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold" onClick={checkNimModels} disabled={nimModelsLoading}>
                            {nimModelsLoading ? 'Fetching…' : nimAvailableModels.length > 0 ? 'Refresh Models' : 'Check Available Models'}
                        </Button>
                        {nimAvailableModels.length > 0 && (
                            <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold" onClick={checkNimHealth} disabled={nimHealthLoading}>
                                {nimHealthLoading ? 'Probing...' : 'Check Model Health'}
                            </Button>
                        )}
                        {activeProject?.aiProvider === 'nim' && (
                            <span className="text-xs text-state-success font-semibold ml-1">✓ Active provider for this project</span>
                        )}
                        {activeProject?.aiProvider !== 'nim' && nimKey && (
                            <Button variant="ghost" size="sm" className="h-9 text-muted-ui text-xs" onClick={async () => {
                                if (activeProject) await updateProject(activeProject.id, { aiProvider: 'gemini' })
                            }}>Switch back to Gemini</Button>
                        )}
                    </div>
                    <StatusBanner s={nimStatus} />
                </Sec>

                {/* ── Ollama (local) ───────────────────────────────────────── */}
                <Sec id="ollama" title="Ollama (Local Models)" icon={<Cpu className="h-4 w-4" />} activeSection={activeSection}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-muted-ui max-w-md">Run AI entirely on this machine — no API key, and no project data leaves your device. Requires the Ollama daemon with at least one chat model pulled.</p>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-brand font-bold text-xs flex-none ml-4" onClick={() => api.openUrl('https://ollama.com/download')}><ExternalLink className="h-3.5 w-3.5" />Install Ollama</Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <FieldLabel>Host</FieldLabel>
                            <Input
                                value={ollamaBaseUrl}
                                onChange={e => setOllamaBaseUrl(e.target.value)}
                                placeholder="http://localhost:11434"
                                className={inp}
                            />
                            <p className="text-xs text-muted-ui mt-1">Leave blank for the local default (http://localhost:11434).</p>
                        </div>
                        <div>
                            <FieldLabel>Preferred Model</FieldLabel>
                            {ollamaModels.length > 0 ? (
                                <select
                                    className={`${inp} w-full appearance-none px-3 cursor-pointer`}
                                    value={ollamaModels.some(m => m.name === ollamaModel) ? ollamaModel : (ollamaModels[0]?.name || '')}
                                    onChange={e => setOllamaModel(e.target.value)}
                                >
                                    {ollamaModels.map(m => {
                                        const health = ollamaHealthMap[m.name]
                                        const dot = health ? (health.status === 'up' ? '🟢' : health.status === 'degraded' ? '🟡' : '🔴') : '⚪'
                                        const gb = m.sizeBytes ? ` ${(m.sizeBytes / 1e9).toFixed(1)}GB` : ''
                                        const params = m.parameterSize ? ` · ${m.parameterSize}` : ''
                                        const quant = m.quantization ? ` ${m.quantization}` : ''
                                        const latency = health?.status === 'up' ? ` · ${(health.latencyMs / 1000).toFixed(1)}s` : ''
                                        return <option key={m.name} value={m.name}>{dot} {m.name}{gb}{params}{quant}{latency}</option>
                                    })}
                                </select>
                            ) : (
                                <Input
                                    value={ollamaModel}
                                    onChange={e => setOllamaModel(e.target.value)}
                                    placeholder="e.g. gpt-oss:20b"
                                    className={inp}
                                />
                            )}
                            <p className="text-xs text-muted-ui mt-1">gpt-oss:20b is recommended — a mixture-of-experts model that generates fast on Apple silicon.</p>
                        </div>
                    </div>
                    {ollamaReachable === false && (
                        <div className="mt-3 rounded-md border border-state-warning-border bg-state-warning-soft px-3 py-2">
                            <p className="text-xs text-foreground leading-relaxed">
                                Ollama is not responding. Start it, then run <span className="font-mono text-brand">ollama pull gpt-oss:20b</span> if you have not pulled a model yet.
                            </p>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <Button size="sm" className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold h-9" onClick={saveOllama}>Save Ollama Settings</Button>
                        <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold" onClick={checkOllama} disabled={ollamaModelsLoading}>
                            {ollamaModelsLoading ? 'Checking…' : ollamaModels.length > 0 ? 'Refresh Models' : 'Check Connection'}
                        </Button>
                        {ollamaModels.length > 0 && (
                            <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold" onClick={checkOllamaHealth} disabled={ollamaHealthLoading}>
                                {ollamaHealthLoading ? 'Probing…' : 'Check Model Health'}
                            </Button>
                        )}
                        {activeProject?.aiProvider === 'ollama' && (
                            <span className="text-xs text-state-success font-semibold ml-1">✓ Active provider for this project</span>
                        )}
                        {activeProject?.aiProvider !== 'ollama' && (
                            <span className="text-xs text-muted-ui ml-1">Saving switches this project to local AI.</span>
                        )}
                    </div>
                    <StatusBanner s={ollamaStatusMsg} />
                </Sec>

                {/* ── PROJECT SHARING ──────────────────────────────────────── */}
                <Sec id="sharing" title="Project Sharing" icon={<Upload className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>Export / Import</SectionLabel>
                    <p className="text-xs text-muted-ui mb-4">Export the current project to a JSON file to share with teammates, or import a project from a shared file. API keys and tokens are stripped during export and import and must be re-entered on the receiving machine.</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold gap-2" onClick={exportProject} disabled={!activeProject}>
                            <Download className="h-3.5 w-3.5" />Export Project…
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold gap-2" onClick={importProjectFromFile}>
                            <Upload className="h-3.5 w-3.5" />Import Project…
                        </Button>
                    </div>
                    <StatusBanner s={shareStatus} />
                </Sec>

                {/* ── WEBHOOKS ─────────────────────────────────────────────── */}
                <Sec id="webhooks" title="Webhooks & Notifications" icon={<Bell className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>Outbound Webhooks</SectionLabel>
                    <p className="text-xs text-muted-ui -mt-3 mb-4">Send notifications to Slack, Microsoft Teams (via Power Automate Workflows), or any generic endpoint when key events occur.</p>

                    <div className="space-y-2 mb-3">
                        {webhooks.length === 0 && <p className="text-xs text-muted-ui italic">No webhooks configured.</p>}
                        {webhooks.map(wh => (
                            <div key={wh.id} className="flex items-center justify-between bg-app border border-ui rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${wh.isEnabled ? 'bg-state-success animate-pulse' : 'bg-line-strong'}`} />
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{wh.name}</p>
                                        <p className="text-xs text-muted-ui mt-0.5">{wh.type} · {wh.url.slice(0, 50)}{wh.url.length > 50 ? '…' : ''}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch on={wh.isEnabled} onToggle={async () => {
                                        const updated = webhooks.map(w => w.id === wh.id ? { ...w, isEnabled: !w.isEnabled } : w)
                                        setWebhooks(updated)
                                        await saveSetting({ webhooks: updated })
                                    }} />
                                    <Button variant="ghost" size="sm" className="h-8 px-3 text-brand hover:bg-qa-accent/10 text-xs font-bold" onClick={() => {
                                        setWebhookForm({ open: true, editId: wh.id, name: wh.name, url: wh.url, type: wh.type, notifyOnTestPlanFail: wh.notifyOnTestPlanFail, notifyOnHighPriorityDone: wh.notifyOnHighPriorityDone, notifyOnDueDate: wh.notifyOnDueDate, notifyOnAiAnalysis: wh.notifyOnAiAnalysis, notifyOnHandoffSent: !!wh.notifyOnHandoffSent, notifyOnReadyForQa: !!wh.notifyOnReadyForQa, notifyOnVerificationFailed: !!wh.notifyOnVerificationFailed, notifyOnPrLinkedToHandoff: !!wh.notifyOnPrLinkedToHandoff })
                                    }}><Edit2 className="h-3 w-3 mr-1" />Edit</Button>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-ui hover:text-state-danger hover:bg-state-danger-soft" onClick={async () => {
                                        const updated = webhooks.filter(w => w.id !== wh.id)
                                        setWebhooks(updated)
                                        await saveSetting({ webhooks: updated })
                                        flash(setWebhookStatus, 'Webhook deleted.', true)
                                    }}><X className="h-3.5 w-3.5" /></Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {!webhookForm.open && (
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-brand font-bold text-xs" onClick={() =>
                            setWebhookForm({ open: true, editId: null, name: '', url: '', type: 'Slack', notifyOnTestPlanFail: true, notifyOnHighPriorityDone: false, notifyOnDueDate: false, notifyOnAiAnalysis: false, notifyOnHandoffSent: true, notifyOnReadyForQa: true, notifyOnVerificationFailed: true, notifyOnPrLinkedToHandoff: true })
                        }>
                            <Plus className="h-3.5 w-3.5" /> Add Webhook
                        </Button>
                    )}

                    {webhookForm.open && (
                        <div className="mt-3 bg-app border border-ui rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-foreground">{webhookForm.editId ? 'Edit Webhook' : 'New Webhook'}</p>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                    <FieldLabel>Name</FieldLabel>
                                    <Input value={webhookForm.name} onChange={e => setWebhookForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. QA Alerts Slack" className={inp} />
                                </div>
                                <div>
                                    <FieldLabel>Type</FieldLabel>
                                    <select className={`${inp} w-full appearance-none px-3 cursor-pointer`} value={webhookForm.type} onChange={e => setWebhookForm(f => ({ ...f, type: e.target.value as any }))}>
                                        <option value="Slack">Slack</option>
                                        <option value="Teams">Microsoft Teams (Workflows)</option>
                                        <option value="Generic">Generic JSON</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <FieldLabel>Webhook URL</FieldLabel>
                                <Input value={webhookForm.url} onChange={e => setWebhookForm(f => ({ ...f, url: e.target.value }))} placeholder={webhookForm.type === 'Teams' ? 'https://<region>.logic.azure.com/workflows/...' : 'https://hooks.slack.com/services/...'} className={inp} />
                                {webhookForm.type === 'Teams' && (
                                    <p className="text-xs text-soft mt-2">💡 Teams uses Power Automate Workflows (the old Incoming Webhooks connector is deprecated). Create a workflow in your Team Settings → Manage channel → Workflows → Incoming webhook.</p>
                                )}
                            </div>
                            <div className="border border-ui rounded-xl p-3 space-y-2">
                                <p className="text-[11px] font-black text-muted-ui uppercase tracking-widest mb-2">Notify On</p>
                                {[
                                    { key: 'notifyOnTestPlanFail', label: 'Test Plan Run Failure' },
                                    { key: 'notifyOnHighPriorityDone', label: 'High-Priority Task Completed' },
                                    { key: 'notifyOnDueDate', label: 'Due Date Reminders' },
                                    { key: 'notifyOnAiAnalysis', label: 'AI Analysis Complete' },
                                    { key: 'notifyOnHandoffSent', label: 'Handoff Sent to Developer' },
                                    { key: 'notifyOnReadyForQa', label: 'Fix Ready for QA' },
                                    { key: 'notifyOnVerificationFailed', label: 'QA Verification Failed' },
                                    { key: 'notifyOnPrLinkedToHandoff', label: 'PR Linked to Handoff' },
                                ].map(({ key, label }) => (
                                    <div key={key} className="flex items-center justify-between">
                                        <span className="text-xs text-soft">{label}</span>
                                        <Switch on={(webhookForm as any)[key]} onToggle={() => setWebhookForm(f => ({ ...f, [key]: !(f as any)[key] }))} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <Button size="sm" className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold h-8" onClick={async () => {
                                    if (!webhookForm.name.trim() || !webhookForm.url.trim()) { flash(setWebhookStatus, 'Name and URL are required.', false); return }
                                    const { open: _, editId, ...rest } = webhookForm
                                    let updated: WebhookConfig[]
                                    if (!editId) {
                                        updated = [...webhooks, { ...rest, id: crypto.randomUUID(), isEnabled: true }]
                                    } else {
                                        updated = webhooks.map(w => w.id === editId ? { ...w, ...rest } : w)
                                    }
                                    setWebhooks(updated)
                                    await saveSetting({ webhooks: updated })
                                    setWebhookForm(f => ({ ...f, open: false }))
                                    flash(setWebhookStatus, 'Webhook saved.', true)
                                }}><Check className="h-3.5 w-3.5 mr-1" />Save</Button>
                                <Button variant="outline" size="sm" className="h-8 border-ui text-soft font-bold" disabled={webhookTesting || !webhookForm.url.trim()} onClick={async () => {
                                    setWebhookTesting(true)
                                    try {
                                        const result = await api.sendWebhook({
                                            url: webhookForm.url,
                                            type: webhookForm.type,
                                            isEnabled: true,
                                        }, '✅ Test Notification', 'Webhook connection test from QAssistant.', '#0481BE')
                                        if (!result.success) throw new Error(result.error || 'Webhook test failed.')
                                        flash(setWebhookStatus, 'Test notification sent!', true)
                                    } catch (e: any) {
                                        flash(setWebhookStatus, `Test failed: ${e.message}`, false)
                                    } finally { setWebhookTesting(false) }
                                }}>{webhookTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Test</Button>
                                <Button variant="ghost" size="sm" className="h-8 text-state-danger hover:bg-state-danger-soft font-bold" onClick={() => setWebhookForm(f => ({ ...f, open: false }))}>Cancel</Button>
                            </div>
                            <StatusBanner s={webhookStatus} />
                        </div>
                    )}
                    {!webhookForm.open && <StatusBanner s={webhookStatus} />}
                </Sec>

                {/* ── APPLICATION UPDATES ─────────────────────────────────── */}
                <Sec id="updates" title="Application Updates" icon={<Download className="h-4 w-4" />} activeSection={activeSection}>
                    <div className="bg-app border border-ui rounded-xl px-4 py-4 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm font-semibold text-foreground">GitHub Release Updates</p>
                                <p className="text-xs text-muted-ui mt-1 max-w-xl">
                                    QAssistant checks published GitHub Releases for newer packaged versions. Updates only install after you confirm.
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] font-bold uppercase text-muted-ui">Current Version</p>
                                <p className="text-sm font-semibold text-foreground mt-1">{appUpdateState.currentVersion || appVersion || 'Unknown'}</p>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="bg-background border border-ui-subtle rounded-xl px-4 py-3">
                                <p className="text-[11px] font-bold uppercase text-muted-ui">Status</p>
                                <p className="text-sm font-semibold text-foreground mt-1">{formatUpdateStatus(appUpdateState)}</p>
                            </div>
                            <div className="bg-background border border-ui-subtle rounded-xl px-4 py-3">
                                <p className="text-[11px] font-bold uppercase text-muted-ui">Last Check</p>
                                <p className="text-sm font-semibold text-foreground mt-1">{formatUpdateCheckTime(appUpdateState.lastCheckedAt)}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-background border border-ui-subtle rounded-xl px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Check automatically on startup</p>
                                <p className="text-[11px] text-muted-ui mt-1">Recommended for release builds. You can still check manually below.</p>
                            </div>
                            <Switch on={autoCheckForUpdates} onToggle={handleAutoCheckForUpdatesToggle} />
                        </div>

                        {appUpdateState.downloadProgressPercent !== undefined && (
                            <div>
                                <div className="flex items-center justify-between text-[11px] text-soft mb-2">
                                    <span>Download progress</span>
                                    <span>{Math.round(appUpdateState.downloadProgressPercent)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-panel-muted overflow-hidden">
                                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, appUpdateState.downloadProgressPercent))}%` }} />
                                </div>
                            </div>
                        )}

                        {appUpdateState.releaseNotes && (
                            <div className="bg-background border border-ui-subtle rounded-xl px-4 py-3">
                                <p className="text-[11px] font-bold uppercase text-muted-ui mb-2">Release Notes</p>
                                <p className="text-xs text-soft whitespace-pre-wrap">{appUpdateState.releaseNotes}</p>
                            </div>
                        )}

                        {sysInfo?.platform === 'darwin' && (
                            <div className="rounded-xl border border-state-warning-border bg-state-warning-soft px-4 py-3 text-xs text-state-warning">
                                macOS release artifacts can be published, but production in-app auto-update still requires Apple signing and notarization to be fully reliable.
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold h-9"
                                onClick={handleCheckForUpdates}
                                disabled={appUpdateState.status === 'checking' || appUpdateState.status === 'downloading'}
                            >
                                {appUpdateState.status === 'checking' ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                                Check for Updates
                            </Button>

                            {appUpdateState.status === 'available' && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 border-ui text-soft font-bold"
                                        onClick={handleDownloadUpdate}
                                    >
                                        Download Update
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 text-state-warning hover:bg-state-warning-soft font-bold"
                                        onClick={handleLaterUpdate}
                                    >
                                        Later
                                    </Button>
                                </>
                            )}

                            {appUpdateState.status === 'downloaded' && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 border-ui text-soft font-bold"
                                        onClick={handleInstallUpdate}
                                    >
                                        Install and Restart
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 text-state-warning hover:bg-state-warning-soft font-bold"
                                        onClick={handleLaterUpdate}
                                    >
                                        Later
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </Sec>

                {/* ── HELP & DOCUMENTATION ────────────────────────────────── */}
                <Sec id="docs" title="Help & Documentation" icon={<BookOpen className="h-4 w-4" />} activeSection={activeSection}>
                    <p className="text-xs text-muted-ui mb-4">Complete documentation for every feature, integration, and keyboard shortcut in QAssistant.</p>
                    <Button size="sm" className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold h-9 gap-2" onClick={() => navigate('/docs')}>
                        <BookOpen className="h-3.5 w-3.5" /> Open Documentation
                    </Button>
                    <p className="text-[11px] text-muted-ui mt-2">Tip: Press F1 anywhere to open docs.</p>
                </Sec>

                {/* ── DIAGNOSTICS ──────────────────────────────────────────── */}
                <Sec id="diagnostics" title="Diagnostics" icon={<Search className="h-4 w-4" />} activeSection={activeSection}>
                    <SectionLabel>Storage & System Info</SectionLabel>
                    <div className="grid sm:grid-cols-2 gap-3 mb-4">
                        {[
                            { label: 'App Version', value: appVersion },
                            { label: 'Platform', value: sysInfo?.platform },
                            { label: 'Architecture', value: sysInfo?.arch },
                            { label: 'Performance Mode', value: resolvedPerformanceMode },
                            { label: 'Electron', value: sysInfo?.electronVersion },
                            { label: 'Node.js', value: sysInfo?.nodeVersion },
                        ].filter(i => i.value).map(item => (
                            <div key={item.label} className="bg-app border border-ui rounded-xl px-4 py-3">
                                <p className="text-[11px] font-bold uppercase text-muted-ui">{item.label}</p>
                                <p className="text-sm font-semibold text-foreground mt-0.5">{item.value}</p>
                            </div>
                        ))}
                    </div>
                    {perfMetrics && (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                            {[
                                { label: 'App Ready', value: perfMetrics.main.appWhenReadyMs, unit: 'ms' },
                                { label: 'Window Ready', value: perfMetrics.main.windowReadyToShowMs, unit: 'ms' },
                                { label: 'Deferred Startup', value: perfMetrics.main.deferredStartupMs, unit: 'ms' },
                                { label: 'First Route Interactive', value: perfMetrics.renderer.firstRouteInteractiveMs, unit: 'ms' },
                                { label: 'Project Load', value: perfMetrics.renderer.projectLoadMs, unit: 'ms' },
                                { label: 'Sync Init', value: perfMetrics.renderer.syncInitMs, unit: 'ms' },
                                { label: 'Focus Sync', value: perfMetrics.main.focusSyncMs, unit: 'ms' },
                                { label: 'Idle CPU', value: perfMetrics.main.idleCpuPercent, unit: '%' },
                                { label: 'Full Project Writes', value: perfMetrics.counters.fullProjectWrites, unit: '' },
                                { label: 'Sync Fallback Reloads', value: perfMetrics.counters.syncFallbackReloads, unit: '' },
                                { label: 'Granular Note Writes', value: perfMetrics.counters.granularNoteWrites, unit: '' },
                                { label: 'Granular Task Writes', value: perfMetrics.counters.granularTaskWrites, unit: '' },
                                { label: 'Granular Handoff Writes', value: perfMetrics.counters.granularHandoffWrites, unit: '' },
                            ].filter(item => item.value !== undefined).map(item => (
                                <div key={item.label} className="bg-app border border-ui rounded-xl px-4 py-3">
                                    <p className="text-[11px] font-bold uppercase text-muted-ui">{item.label}</p>
                                    <p className="text-sm font-semibold text-foreground mt-0.5">
                                        {typeof item.value === 'number' ? Math.round(item.value * 100) / 100 : item.value}{item.unit ? ` ${item.unit}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                    {dataPath && (
                        <div className="bg-app border border-ui rounded-xl px-4 py-3 mb-4">
                            <p className="text-[11px] font-bold uppercase text-muted-ui mb-1">Data Storage Path</p>
                            <p className="text-[11px] font-mono text-brand break-all">{dataPath}</p>
                        </div>
                    )}
                    <div className="bg-app border border-ui rounded-xl px-4 py-3 mb-4">
                        <p className="text-[11px] font-bold uppercase text-muted-ui mb-2">Intel Mac Profiling Checklist</p>
                        <ol className="space-y-1 text-xs text-soft list-decimal ml-4">
                            <li>Cold-launch the packaged macOS x64 app and capture App Ready, Window Ready, and First Route Interactive.</li>
                            <li>Swipe between macOS Spaces with the app visible and watch for dropped-frame jank.</li>
                            <li>Type in Notes for 20-30 seconds and verify the caret stays smooth while autosave runs.</li>
                            <li>Repeat in Tasks while opening the details sidebar and changing filters.</li>
                            <li>Open Settings and AI Copilot once, then leave the app idle for two minutes and compare Idle CPU plus sync counters.</li>
                        </ol>
                    </div>
                    {/* Stored credentials for active project */}
                    {activeProject && (
                        <div className="bg-app border border-ui rounded-xl px-4 py-3 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] font-bold uppercase text-muted-ui">Stored Credentials</p>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-8 border-ui text-soft font-bold" onClick={refreshStoredCreds}>Refresh</Button>
                                </div>
                            </div>
                            {storedCreds.length === 0 && <p className="text-xs text-muted-ui italic">No stored secrets for this project.</p>}
                            <div className="space-y-2">
                                {storedCreds.map(k => (
                                    <div key={k} className="flex items-center justify-between bg-background border border-ui-subtle rounded-md px-3 py-2">
                                        <div className="text-sm text-foreground">{k}</div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" className="h-7 text-state-danger" onClick={async () => {
                                                const prefix = `project:${activeProject.id}:`
                                                await api.secureStoreDelete(`${prefix}${k}`)
                                                refreshStoredCreds()
                                            }}>Delete</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-9 border-ui text-soft font-bold gap-2" onClick={() => api.openFile(dataPath)}>
                            <Search className="h-3.5 w-3.5" />Open Data Folder
                        </Button>
                        <Button variant="ghost" size="sm" className="h-9 text-state-danger hover:bg-state-danger-soft font-bold gap-2"
                            onClick={async () => {
                                const ok = await confirmDialog('Permanently delete all project data?', { description: 'This action cannot be undone. All projects, test cases, tasks, notes, and runs will be erased.', confirmLabel: 'Purge All Data', destructive: true })
                                if (!ok) return
                                const { ok: purged, deleted } = await purgeAllProjects()
                                if (purged) toast.success(deleted === 1 ? 'Deleted 1 project.' : `Deleted ${deleted} projects.`)
                                else toast.error('Some projects could not be deleted. The list has been reloaded.')
                            }}>
                            <Trash2 className="h-3.5 w-3.5" />Purge All Data
                        </Button>
                    </div>

                    {/* Orphaned attachment cleanup */}
                    <div className="mt-4 bg-app border border-ui rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase text-muted-ui">Orphaned Attachments</p>
                                <p className="text-[11px] text-muted-ui mt-0.5">Files in the attachments folder no longer referenced by any project.</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-ui text-soft font-bold"
                                onClick={handleScanOrphans}
                                disabled={orphanScanning}
                            >
                                {orphanScanning ? 'Scanning…' : 'Scan'}
                            </Button>
                        </div>
                        {orphanScanResult && (
                            orphanScanResult.orphaned.length === 0 ? (
                                <p className="text-xs text-state-success font-medium">No orphaned files found.</p>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-state-warning font-medium">
                                        {orphanScanResult.orphaned.length} orphaned file{orphanScanResult.orphaned.length !== 1 ? 's' : ''} — {(orphanScanResult.totalSize / 1024).toFixed(1)} KB total
                                    </p>
                                    <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                                        {orphanScanResult.orphaned.map(o => (
                                            <div key={o.filePath} className="flex items-center justify-between text-[11px] text-soft bg-background border border-ui-subtle rounded px-2 py-1">
                                                <span className="truncate flex-1">{o.fileName}</span>
                                                <span className="ml-2 flex-none text-muted-ui">{(o.fileSizeBytes / 1024).toFixed(1)} KB</span>
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-state-danger hover:bg-state-danger-soft font-bold gap-2"
                                        onClick={handleDeleteOrphans}
                                        disabled={orphanDeleting}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        {orphanDeleting ? 'Deleting…' : `Delete ${orphanScanResult.orphaned.length} File${orphanScanResult.orphaned.length !== 1 ? 's' : ''}`}
                                    </Button>
                                </div>
                            )
                        )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-ui text-center">
                        <p className="text-[11px] text-muted-ui italic">© 2026 Lewandowskista · QAssistant</p>
                    </div>
                </Sec>

                        </div>
                    </div>
                </div>
            </PageScaffold>
        </div>
        {confirmDialogEl}
        </>
    )
}
