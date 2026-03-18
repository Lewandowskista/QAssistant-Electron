/* cspell:disable-file */
/* cspell:words testplans ATATT aistudio Lewandowskista */
import { useState, useEffect, useCallback } from "react"
import {
    Zap, Globe, Cpu, Server, Share2, Database, Search,
    Plus, X, Edit2, Check, Copy, RefreshCw, ExternalLink,
    Eye, EyeOff, Trash2, Upload, Download, ChevronDown, ChevronUp, Bell, Sun, User, LogOut
} from "lucide-react"
import { useTheme } from "@/hooks/useTheme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProjectStore } from "@/store/useProjectStore"
import { useUserStore } from "@/store/useUserStore"
import { LinearConnection, JiraConnection } from "@/types/project"
import type { UserRole, AuthProvider } from "@/types/user"
import { useConfirm } from "@/components/ConfirmDialog"

// ── tiny helpers ──────────────────────────────────────────────────────────────
type StatusState = { msg: string; ok: boolean } | null

function StatusBanner({ s }: { s: StatusState }) {
    if (!s) return null
    return (
        <div className={`mt-3 rounded-xl border px-4 py-2.5 text-xs font-semibold ${s.ok ? 'app-status-success' : 'app-status-danger'}`}>
            {s.msg}
        </div>
    )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            className={`h-6 w-11 rounded-full border transition-colors flex-none ${on ? 'border-primary/30 bg-primary' : 'border-ui bg-panel-muted'}`}
        >
            <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform mx-1 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
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

// ── Components ────────────────────────────────────────────────────────────────
function Sec({ id, title, icon, children, activeSection, setActiveSection }: { 
    id: string; title: string; icon: React.ReactNode; children: React.ReactNode;
    activeSection: string | null; setActiveSection: (id: string | null) => void;
}) {
    const open = activeSection === id
    return (
        <SectionCard>
            <button
                className="w-full flex items-center justify-between group"
                onClick={() => setActiveSection(open ? null : id)}
            >
                <div className="flex items-center gap-3">
                    <span className="text-primary opacity-80 group-hover:opacity-100 transition-opacity">{icon}</span>
                    <span className="font-semibold text-foreground text-sm">{title}</span>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-muted-ui" /> : <ChevronDown className="h-4 w-4 text-muted-ui" />}
            </button>
            {open && <div className="mt-5 border-t app-divider pt-5 space-y-4">{children}</div>}
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
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-ui hover:text-red-400 hover:bg-red-500/10" onClick={onDelete}><X className="h-3.5 w-3.5" /></Button>
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
                <Button variant="ghost" size="sm" className="h-8 text-red-400 hover:bg-red-500/10" onClick={onCancel}>Cancel</Button>
            </div>
            <StatusBanner s={status} />
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const api = window.electronAPI as any
    const { projects, activeProjectId, updateProject, importProject } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)

    const [showSecrets, setShowSecrets] = useState(false)
    const [appVersion, setAppVersion] = useState('')
    const [dataPath, setDataPath] = useState('')
    const [sysInfo, setSysInfo] = useState<any>(null)
    const [activeSection, setActiveSection] = useState<string | null>('general')
    const { theme, toggleTheme } = useTheme()

    // ── Global settings state ─────────────────────────────────────────────────
    const [sapContext, setSapContext] = useState(false)
    const [minimizeToTray, setMinimizeToTray] = useState(false)

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
    const [geminiModel, setGeminiModel] = useState('gemini-3-flash-preview')
    const [geminiStatus, setGeminiStatus] = useState<StatusState>(null)
    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [modelsLoading, setModelsLoading] = useState(false)

    // ── CCv2 ─────────────────────────────────────────────────────────────────
    const [ccv2Sub, setCcv2Sub] = useState('')
    const [ccv2Token, setCcv2Token] = useState('')
    const [ccv2Status, setCcv2Status] = useState<StatusState>(null)
    const [ccv2Testing, setCcv2Testing] = useState(false)
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
    const [oauthConnecting, setOauthConnecting] = useState<AuthProvider | null>(null)
    const [oauthStatus, setOauthStatus] = useState<StatusState>(null)

    // ── Load user profile + OAuth listener ───────────────────────────────────
    useEffect(() => {
        if (!userLoaded) loadProfile()
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
        flash(setOauthStatus, `Opening ${provider === 'github' ? 'GitHub' : 'Linear'} authorization in your browser...`, true, 8000)
        const result = await window.electronAPI.oauthStart(provider)
        setOauthConnecting(null)
        if (!result.success) {
            flash(setOauthStatus, result.error || 'Failed to start authorization', false)
        }
    }

    const handleOAuthDisconnect = async (provider: AuthProvider) => {
        const name = provider === 'github' ? 'GitHub' : 'Linear'
        const confirmed = await confirmDialog(`Disconnect ${name}`, { description: `Remove your ${name} identity from QAssistant?`, destructive: true })
        if (!confirmed) return
        await window.electronAPI.oauthLogout(provider)
        await removeIdentity(provider)
        flash(setOauthStatus, `${name} identity removed.`, true)
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const settings = await api.readSettingsFile()
            setSapContext(!!settings.sapCommerceContext)
            setMinimizeToTray(!!settings.minimizeToTray)
            setApiEnabled(!!settings.automationApiEnabled)
            setApiPort(settings.automationPort || '5248')
            setWebhooks(settings.webhooks || [])

            const projectPrefix = activeProject ? `project:${activeProject.id}:` : ''

            const [storedKey, storedGemini, storedCcv2Sub, storedCcv2Token, ver, path, info] = await Promise.all([
                activeProject ? api.secureStoreGet(`${projectPrefix}automation_api_key`) : Promise.resolve(null),
                activeProject ? api.secureStoreGet(`${projectPrefix}gemini_api_key`) : Promise.resolve(null),
                activeProject ? api.secureStoreGet(`${projectPrefix}ccv2_subscription_code`) : Promise.resolve(null),
                activeProject ? api.secureStoreGet(`${projectPrefix}ccv2_api_token`) : Promise.resolve(null),
                api.getAppVersion(),
                api.getAppDataPath(),
                api.getSystemInfo(),
            ])
            if (storedKey) setApiKey(storedKey)
            if (storedGemini) setGeminiKey(storedGemini)
            if (activeProject?.geminiModel) setGeminiModel(activeProject.geminiModel)
            if (storedCcv2Sub) setCcv2Sub(storedCcv2Sub)
            if (storedCcv2Token) setCcv2Token(storedCcv2Token)
            setAppVersion(ver || '')
            setDataPath(path || '')
            setSysInfo(info)
        }
        load()
    }, [activeProjectId, activeProject?.geminiModel])

    const saveSetting = useCallback(async (patch: Record<string, any>) => {
        const cur = await api.readSettingsFile()
        await api.writeSettingsFile({ ...cur, ...patch })
        window.dispatchEvent(new Event('settings-updated'))
    }, [])

    const flash = (set: (s: StatusState) => void, msg: string, ok: boolean, ms = 3000) => {
        set({ msg, ok })
        setTimeout(() => set(null), ms)
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
        const newKey = crypto.randomUUID().replace(/-/g, '')
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreSet(`${prefix}automation_api_key`, newKey)
        setApiKey(newKey)
        if (apiEnabled) {
            await api.automationApiRestart(newKey, parseInt(apiPort))
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

    // ── CCv2 ─────────────────────────────────────────────────────────────────
    const saveCcv2 = async () => {
        if (!ccv2Sub.trim() || !ccv2Token.trim()) { flash(setCcv2Status, 'Fill in both Subscription Code and API Token.', false); return }
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreSet(`${prefix}ccv2_subscription_code`, ccv2Sub.trim())
        await api.secureStoreSet(`${prefix}ccv2_api_token`, ccv2Token.trim())
        flash(setCcv2Status, 'CCv2 credentials saved.', true)
    }
    const testCcv2 = async () => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        const sub = await api.secureStoreGet(`${prefix}ccv2_subscription_code`)
        const tok = await api.secureStoreGet(`${prefix}ccv2_api_token`)
        if (!sub || !tok) { flash(setCcv2Status, 'Save credentials first.', false); return }
        setCcv2Testing(true)
        try {
            const envs = await api.ccv2GetEnvironments({ subscriptionCode: sub, apiToken: tok })
            flash(setCcv2Status, `✓ Connected — ${Array.isArray(envs) ? envs.length : 0} environment(s) found.`, true)
        } catch (e: any) {
            flash(setCcv2Status, `Connection failed: ${e.message}`, false)
        } finally { setCcv2Testing(false) }
    }
    const disconnectCcv2 = async () => {
        const prefix = activeProject ? `project:${activeProject.id}:` : ''
        await api.secureStoreDelete(`${prefix}ccv2_subscription_code`)
        await api.secureStoreDelete(`${prefix}ccv2_api_token`)
        setCcv2Sub(''); setCcv2Token('')
        flash(setCcv2Status, 'CCv2 credentials removed.', true)
    }

    // ── Gemini ────────────────────────────────────────────────────────────────
    const saveGemini = async () => {
        if (!geminiKey.trim()) { flash(setGeminiStatus, 'Enter your API key.', false); return }
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
        flash(setGeminiStatus, 'Fetching available models...', true)
        try {
            const models = await api.aiListModels({ apiKey: geminiKey.trim() })
            if (models && models.length > 0) {
                // Filter to generative models only (exclude embedding, AQA, etc.)
                const generative = (models as string[]).filter((m: string) =>
                    m.includes('gemini') && !m.includes('embedding') && !m.includes('aqa')
                )
                setAvailableModels(generative.length > 0 ? generative : models)
                flash(setGeminiStatus, `${generative.length > 0 ? generative.length : models.length} models available — select one below.`, true, 6000)
            } else {
                flash(setGeminiStatus, 'No models found. Check your API key.', false)
            }
        } catch (e: any) {
            flash(setGeminiStatus, `Error: ${e.message}`, false)
        } finally {
            setModelsLoading(false)
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
        const content = JSON.stringify({ ...activeProject, linearConnections: activeProject.linearConnections, jiraConnections: activeProject.jiraConnections }, null, 2)
        await api.saveFileDialog({ defaultName: `${activeProject.name.replace(/\s+/g, '_')}_export.json`, content })
        flash(setShareStatus, 'Project exported. Credentials are not included and must be re-entered on the target machine.', true, 6000)
    }

    const importProjectFromFile = async () => {
        const filePath = await api.selectFile()
        if (!filePath) return
        try {
            const res = await api.readJsonFile(filePath)
            if (res.success && res.data) {
                await importProject(res.data)
                flash(setShareStatus, 'Project imported successfully.', true)
            } else {
                flash(setShareStatus, `Import failed: ${res.error || 'Invalid file format'}`, false)
            }
        } catch (e: any) {
            flash(setShareStatus, `Import failed: ${e.message}`, false)
        }
    }


    return (
        <>
        <div className="h-full flex flex-col bg-[#0F0F13] overflow-hidden">
            {/* Header */}
            <div className="flex-none px-8 py-5 border-b border-[#2A2A3A] flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[#E2E8F0] tracking-tight">Settings</h1>
                    {activeProject && (
                        <p className="text-xs text-[#A78BFA] font-semibold mt-0.5">Configuring for: {activeProject.name}</p>
                    )}
                </div>
                <Button variant="ghost" size="sm" className="gap-2 text-[#6B7280] hover:text-[#E2E8F0]" onClick={() => setShowSecrets(s => !s)}>
                    {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="text-xs font-bold">{showSecrets ? 'Hide secrets' : 'Reveal secrets'}</span>
                </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 custom-scrollbar">

                {/* ── ACCOUNT & IDENTITY ───────────────────────────────────── */}
                <Sec id="account" title="Account & Identity" icon={<User className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>Role</SectionLabel>
                    <div className="flex items-center gap-3">
                        {(['qa', 'dev'] as UserRole[]).map(r => (
                            <button
                                key={r}
                                onClick={() => setRole(r)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                    (profile?.activeRole ?? 'qa') === r
                                        ? 'bg-[#A78BFA] text-[#0F0F13] border-[#A78BFA]'
                                        : 'bg-transparent text-[#9CA3AF] border-[#2A2A3A] hover:border-[#A78BFA]/50'
                                }`}
                            >
                                {r === 'qa' ? 'QA Engineer' : 'Developer'}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1">Role controls which features are visible in the sidebar.</p>

                    <div className="mt-2 border-t border-[#2A2A3A] pt-4 space-y-3">
                        <SectionLabel>Connected Identities</SectionLabel>

                        {/* GitHub */}
                        {(() => {
                            const identity = profile?.identities.find(i => i.provider === 'github')
                            return identity ? (
                                <div className="flex items-center justify-between bg-[#0F0F13] border border-[#2A2A3A] rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        {identity.avatarUrl
                                            ? <img src={identity.avatarUrl} className="w-8 h-8 rounded-full" alt="avatar" />
                                            : <div className="w-8 h-8 rounded-full bg-[#2A2A3A] flex items-center justify-center"><User className="h-4 w-4 text-[#6B7280]" /></div>
                                        }
                                        <div>
                                            <p className="text-sm font-semibold text-[#E2E8F0]">GitHub · {identity.username}</p>
                                            {identity.email && <p className="text-xs text-[#6B7280]">{identity.email}</p>}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-8 text-red-400 hover:bg-red-950/30 font-bold" onClick={() => handleOAuthDisconnect('github')}>
                                        <LogOut className="h-3.5 w-3.5 mr-1" />Disconnect
                                    </Button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleOAuthConnect('github')}
                                    disabled={oauthConnecting === 'github'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#2A2A3A] text-sm text-[#9CA3AF] hover:border-[#A78BFA]/50 hover:text-[#E2E8F0] transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {oauthConnecting === 'github' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                    {oauthConnecting === 'github' ? 'Opening browser...' : 'Connect with GitHub'}
                                </button>
                            )
                        })()}

                        {/* Linear */}
                        {(() => {
                            const identity = profile?.identities.find(i => i.provider === 'linear')
                            return identity ? (
                                <div className="flex items-center justify-between bg-[#0F0F13] border border-[#2A2A3A] rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        {identity.avatarUrl
                                            ? <img src={identity.avatarUrl} className="w-8 h-8 rounded-full" alt="avatar" />
                                            : <div className="w-8 h-8 rounded-full bg-[#2A2A3A] flex items-center justify-center"><User className="h-4 w-4 text-[#6B7280]" /></div>
                                        }
                                        <div>
                                            <p className="text-sm font-semibold text-[#E2E8F0]">Linear · {identity.username}</p>
                                            {identity.email && <p className="text-xs text-[#6B7280]">{identity.email}</p>}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-8 text-red-400 hover:bg-red-950/30 font-bold" onClick={() => handleOAuthDisconnect('linear')}>
                                        <LogOut className="h-3.5 w-3.5 mr-1" />Disconnect
                                    </Button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleOAuthConnect('linear')}
                                    disabled={oauthConnecting === 'linear'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#2A2A3A] text-sm text-[#9CA3AF] hover:border-[#A78BFA]/50 hover:text-[#E2E8F0] transition-colors disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {oauthConnecting === 'linear' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                    {oauthConnecting === 'linear' ? 'Opening browser...' : 'Connect with Linear'}
                                </button>
                            )
                        })()}

                        <StatusBanner s={oauthStatus} />
                        <p className="text-xs text-[#4B5563] pt-1">
                            OAuth requires you to register a GitHub or Linear OAuth app and set <code className="bg-[#0F0F13] px-1 rounded">GITHUB_CLIENT_ID</code> / <code className="bg-[#0F0F13] px-1 rounded">LINEAR_CLIENT_ID</code> environment variables before building.
                        </p>
                    </div>
                </Sec>

                {/* ── APPEARANCE ───────────────────────────────────────────── */}
                <Sec id="appearance" title="Appearance" icon={<Sun className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>Theme</SectionLabel>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-[#E2E8F0]">Light Mode</p>
                            <p className="text-xs text-[#6B7280] mt-0.5">Switch between dark and light interface theme.</p>
                        </div>
                        <Toggle on={theme === 'light'} onToggle={toggleTheme} />
                    </div>
                </Sec>

                {/* ── GENERAL ─────────────────────────────────────────────── */}
                <Sec id="general" title="General" icon={<Database className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>App Behavior</SectionLabel>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-[#E2E8F0]">SAP Commerce Context</p>
                                <p className="text-xs text-[#6B7280] mt-0.5">Include SAP Hybris domain knowledge in AI prompts for platform-aware test generation.</p>
                            </div>
                            <Toggle on={sapContext} onToggle={async () => {
                                const next = !sapContext; setSapContext(next)
                                await saveSetting({ sapCommerceContext: next })
                            }} />
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#A78BFA]/5 border border-[#A78BFA]/10 rounded-xl">
                            <div>
                                <p className="text-sm font-semibold text-[#E2E8F0] flex items-center gap-2">
                                    Minimize to Tray
                                    <span className="text-[9px] px-1.5 py-0.5 bg-[#A78BFA]/20 text-[#A78BFA] rounded-md font-black uppercase tracking-wider">New</span>
                                </p>
                                <p className="text-xs text-[#6B7280] mt-0.5">When closing the window, keep the app running in the system tray.</p>
                            </div>
                            <Toggle on={minimizeToTray} onToggle={async () => {
                                const next = !minimizeToTray; setMinimizeToTray(next)
                                await saveSetting({ minimizeToTray: next })
                            }} />
                        </div>
                    </div>
                </Sec>

                {/* ── AUTOMATION API ───────────────────────────────────────── */}
                <Sec id="automation" title="Automation API" icon={<Share2 className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>REST API for CI/CD Integration</SectionLabel>

                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm font-semibold text-[#E2E8F0]">Enable Automation API</p>
                            <p className="text-xs text-[#6B7280] mt-0.5">Starts a local HTTP server your test runners can call.</p>
                        </div>
                        <Toggle on={apiEnabled} onToggle={handleApiToggle} />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>Port</FieldLabel>
                            <div className="flex gap-2">
                                <Input value={apiPort} onChange={e => setApiPort(e.target.value)} className={`${inp} w-28 font-mono text-center`} />
                                <Button variant="outline" size="sm" className="h-10 border-[#2A2A3A] text-[#9CA3AF] font-bold" onClick={handleSavePort}>Save Port</Button>
                            </div>
                            <p className="text-[10px] text-[#6B7280] mt-1">Default: 5248 · Restart or toggle to apply</p>
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
                                <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-[#6B7280]" onClick={() => setApiKeyVisible(v => !v)}>
                                    {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Button variant="ghost" size="sm" className="h-8 px-3 text-[#9CA3AF] gap-1.5 text-xs" onClick={handleCopyKey} disabled={!apiKey}>
                                    <Copy className="h-3 w-3" />Copy Key
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 px-3 text-red-400 gap-1.5 text-xs hover:bg-red-950/30" onClick={handleRegenerateKey}>
                                    <RefreshCw className="h-3 w-3" />Regenerate Key
                                </Button>
                            </div>
                            <p className="text-[10px] text-[#6B7280] mt-1">Header: <code className="font-mono bg-[#1A1A24] px-1 rounded">Authorization: Bearer &lt;key&gt;</code></p>
                        </div>
                    </div>

                    <StatusBanner s={automationStatus} />

                    <div className="mt-4 bg-[#0A0A0D] border border-[#2A2A3A] rounded-xl p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#6B7280] mb-2">Endpoints</p>
                        <pre className="text-[10px] font-mono text-[#9CA3AF] leading-5 whitespace-pre-wrap">{`GET  /api/projects
GET  /api/projects/{id}/testplans
GET  /api/projects/{id}/testcases
GET  /api/projects/{id}/testcases?planId={guid}
GET  /api/projects/{id}/testcases/{tcId}
GET  /api/projects/{id}/executions
POST /api/projects/{id}/executions
POST /api/projects/{id}/executions/batch`}</pre>
                        <p className="text-[10px] text-[#6B7280] mt-2">POST body: <code className="font-mono">{"{ testCaseDisplayId, result, actualResult, notes }"}</code></p>
                    </div>
                </Sec>

                {/* ── LINEAR ──────────────────────────────────────────────── */}
                <Sec id="linear" title="Linear" icon={<Zap className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <SectionLabel>Connections</SectionLabel>
                            <p className="text-xs text-[#6B7280] -mt-3 mb-4">
                                Use a Personal API Key, or{' '}
                                {profile?.identities.find(i => i.provider === 'linear')
                                    ? <span className="text-[#A78BFA] font-semibold">OAuth token from your connected Linear account</span>
                                    : <span>connect via <strong>Account &amp; Identity</strong> to use OAuth</span>
                                }.
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#A78BFA] font-bold text-xs" onClick={() => api.openUrl('https://linear.app/settings/api')}><ExternalLink className="h-3.5 w-3.5" />Get API Key</Button>
                    </div>

                    <div className="space-y-2">
                        {linearConns.length === 0 && <p className="text-xs text-[#6B7280] italic">No connections configured.</p>}
                        {linearConns.map(c => (
                            <ConnCard key={c.id} label={c.label} subtitle={`Team: ${c.teamId}`}
                                onEdit={() => openLinearEdit(c)} onDelete={() => deleteLinear(c.id)} />
                        ))}
                    </div>

                    {!linearForm.open && (
                        <Button variant="ghost" size="sm" className="mt-3 h-8 gap-1.5 text-[#A78BFA] font-bold text-xs" onClick={openLinearAdd}>
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
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#A78BFA]/40 text-xs text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors font-semibold"
                                        >
                                            <Zap className="h-3.5 w-3.5" />
                                            Use OAuth token from {profile.identities.find(i => i.provider === 'linear')?.username}
                                        </button>
                                    )}
                                    <div><FieldLabel>Label</FieldLabel>
                                        <Input value={linearForm.label} onChange={e => setLinearForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Frontend, Backend" className={inp} />
                                    </div>
                                    <div><FieldLabel>API Key {linearForm.editId && <span className="text-[#6B7280] font-normal">(leave blank to keep existing)</span>}</FieldLabel>
                                        <Input type={showSecrets ? 'text' : 'password'} value={linearForm.apiKey} onChange={e => setLinearForm(f => ({ ...f, apiKey: e.target.value }))} placeholder="lin_api_... or OAuth token" className={inp} />
                                    </div>
                                    <div><FieldLabel>Team ID</FieldLabel>
                                        <Input value={linearForm.teamId} onChange={e => setLinearForm(f => ({ ...f, teamId: e.target.value }))} placeholder="Your Linear Team ID" className={inp} />
                                        <p className="text-[10px] text-[#6B7280] mt-1">linear.app → Settings → Team → copy the ID from the URL</p>
                                    </div>
                                </div>
                            </FormPanel>
                        </div>
                    )}
                    {!linearForm.open && <StatusBanner s={linearStatus} />}
                </Sec>

                {/* ── JIRA ────────────────────────────────────────────────── */}
                <Sec id="jira" title="Atlassian Jira" icon={<Globe className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <SectionLabel>Connections</SectionLabel>
                            <p className="text-xs text-[#6B7280] -mt-3 mb-4">Get your API token from id.atlassian.com → Security → API tokens</p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#A78BFA] font-bold text-xs" onClick={() => api.openUrl('https://id.atlassian.com/manage-profile/security/api-tokens')}><ExternalLink className="h-3.5 w-3.5" />Get API Token</Button>
                    </div>

                    <div className="space-y-2">
                        {jiraConns.length === 0 && <p className="text-xs text-[#6B7280] italic">No connections configured.</p>}
                        {jiraConns.map(c => (
                            <ConnCard key={c.id} label={c.label} subtitle={`${c.domain}.atlassian.net · ${c.projectKey}`}
                                onEdit={() => openJiraEdit(c)} onDelete={() => deleteJira(c.id)} />
                        ))}
                    </div>

                    {!jiraForm.open && (
                        <Button variant="ghost" size="sm" className="mt-3 h-8 gap-1.5 text-[#A78BFA] font-bold text-xs" onClick={openJiraAdd}>
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
                                    <div><FieldLabel>API Token {jiraForm.editId && <span className="text-[#6B7280] font-normal">(leave blank to keep existing)</span>}</FieldLabel>
                                        <Input type={showSecrets ? 'text' : 'password'} value={jiraForm.apiToken} onChange={e => setJiraForm(f => ({ ...f, apiToken: e.target.value }))} placeholder="ATATT3xF..." className={inp} />
                                    </div>
                                    <div><FieldLabel>Project Key</FieldLabel>
                                        <Input value={jiraForm.projectKey} onChange={e => setJiraForm(f => ({ ...f, projectKey: e.target.value }))} placeholder="e.g. QA, DEV, PROJ" className={inp} />
                                        <p className="text-[10px] text-[#6B7280] mt-1">The short key shown before issue numbers e.g. QA-123</p>
                                    </div>
                                </div>
                            </FormPanel>
                        </div>
                    )}
                    {!jiraForm.open && <StatusBanner s={jiraStatus} />}
                </Sec>

                {/* ── GOOGLE AI ────────────────────────────────────────────── */}
                <Sec id="gemini" title="Google AI Studio" icon={<Cpu className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-[#6B7280]">Get your API key from aistudio.google.com → API Keys</p>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#A78BFA] font-bold text-xs" onClick={() => api.openUrl('https://aistudio.google.com/apikey')}><ExternalLink className="h-3.5 w-3.5" />Get API Key</Button>
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
                                        value={['gemini-3-flash-preview', 'gemini-2.5-flash'].includes(geminiModel) ? geminiModel : 'custom'}
                                        onChange={(e) => {
                                            if (e.target.value !== 'custom') setGeminiModel(e.target.value)
                                        }}
                                    >
                                        <option value="gemini-3-flash-preview">Gemini 3 Flash (Free)</option>
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Free)</option>
                                        <option value="custom">-- Custom / Other --</option>
                                    </select>
                                    {(!['gemini-3-flash-preview', 'gemini-2.5-flash'].includes(geminiModel)) && (
                                        <Input
                                            value={geminiModel}
                                            onChange={e => setGeminiModel(e.target.value)}
                                            placeholder="Model ID, e.g. gemini-3-flash-preview"
                                            className={`${inp} flex-1`}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" className="bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold h-9" onClick={saveGemini}>Save Gemini Settings</Button>
                        <Button variant="outline" size="sm" className="h-9 border-[#2A2A3A] text-[#9CA3AF] font-bold" onClick={checkGeminiModels} disabled={modelsLoading}>
                            {modelsLoading ? 'Fetching...' : availableModels.length > 0 ? 'Refresh Models' : 'Check Available Models'}
                        </Button>
                    </div>
                    <StatusBanner s={geminiStatus} />
                </Sec>

                {/* ── SAP CCv2 ─────────────────────────────────────────────── */}
                <Sec id="ccv2" title="SAP Commerce Cloud v2 (CCv2)" icon={<Server className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-[#6B7280] max-w-md">Enter your subscription code and Management API token to enable the CCv2 Deployments panel on the SAP page.</p>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#A78BFA] font-bold text-xs flex-none ml-4" onClick={() => api.openUrl('https://help.sap.com/docs/SAP_COMMERCE_CLOUD_PUBLIC_CLOUD')}><ExternalLink className="h-3.5 w-3.5" />API Docs</Button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <FieldLabel>Subscription Code</FieldLabel>
                            <Input value={ccv2Sub} onChange={e => setCcv2Sub(e.target.value)} placeholder="Your CCv2 subscription code" className={inp} />
                            <p className="text-[10px] text-[#6B7280] mt-1">Found in the SAP Commerce Cloud Portal under your project settings</p>
                        </div>
                        <div>
                            <FieldLabel>API Token</FieldLabel>
                            <Input type={showSecrets ? 'text' : 'password'} value={ccv2Token} onChange={e => setCcv2Token(e.target.value)} placeholder="Bearer token from the CCv2 portal" className={inp} />
                            <p className="text-[10px] text-[#6B7280] mt-1">Generate in Cloud Portal → API Token Management</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                        <Button size="sm" className="bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold h-9" onClick={saveCcv2}>Save Credentials</Button>
                        <Button variant="outline" size="sm" className="h-9 border-[#2A2A3A] text-[#9CA3AF] font-bold" onClick={testCcv2} disabled={ccv2Testing}>
                            {ccv2Testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Test Connection
                        </Button>
                        <Button variant="ghost" size="sm" className="h-9 text-red-400 hover:bg-red-950/30 font-bold" onClick={disconnectCcv2}>Disconnect</Button>
                    </div>
                    <StatusBanner s={ccv2Status} />
                </Sec>

                {/* ── PROJECT SHARING ──────────────────────────────────────── */}
                <Sec id="sharing" title="Project Sharing" icon={<Upload className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>Export / Import</SectionLabel>
                    <p className="text-xs text-[#6B7280] mb-4">Export the current project to a JSON file to share with teammates, or import a project from a shared file. Credentials are never exported — they must be re-entered on the receiving machine.</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="h-9 border-[#2A2A3A] text-[#9CA3AF] font-bold gap-2" onClick={exportProject} disabled={!activeProject}>
                            <Download className="h-3.5 w-3.5" />Export Project…
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 border-[#2A2A3A] text-[#9CA3AF] font-bold gap-2" onClick={importProjectFromFile}>
                            <Upload className="h-3.5 w-3.5" />Import Project…
                        </Button>
                    </div>
                    <StatusBanner s={shareStatus} />
                </Sec>

                {/* ── WEBHOOKS ─────────────────────────────────────────────── */}
                <Sec id="webhooks" title="Webhooks & Notifications" icon={<Bell className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>Outbound Webhooks</SectionLabel>
                    <p className="text-xs text-[#6B7280] -mt-3 mb-4">Send notifications to Slack, Microsoft Teams (via Power Automate Workflows), or any generic endpoint when key events occur.</p>

                    <div className="space-y-2 mb-3">
                        {webhooks.length === 0 && <p className="text-xs text-[#6B7280] italic">No webhooks configured.</p>}
                        {webhooks.map(wh => (
                            <div key={wh.id} className="flex items-center justify-between bg-[#0F0F13] border border-[#2A2A3A] rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${wh.isEnabled ? 'bg-[#10B981] animate-pulse' : 'bg-[#6B7280]'}`} />
                                    <div>
                                        <p className="text-sm font-semibold text-[#E2E8F0]">{wh.name}</p>
                                        <p className="text-xs text-[#6B7280] mt-0.5">{wh.type} · {wh.url.slice(0, 50)}{wh.url.length > 50 ? '…' : ''}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Toggle on={wh.isEnabled} onToggle={async () => {
                                        const updated = webhooks.map(w => w.id === wh.id ? { ...w, isEnabled: !w.isEnabled } : w)
                                        setWebhooks(updated)
                                        await saveSetting({ webhooks: updated })
                                    }} />
                                    <Button variant="ghost" size="sm" className="h-8 px-3 text-[#A78BFA] hover:bg-[#A78BFA]/10 text-xs font-bold" onClick={() => {
                                        setWebhookForm({ open: true, editId: wh.id, name: wh.name, url: wh.url, type: wh.type, notifyOnTestPlanFail: wh.notifyOnTestPlanFail, notifyOnHighPriorityDone: wh.notifyOnHighPriorityDone, notifyOnDueDate: wh.notifyOnDueDate, notifyOnAiAnalysis: wh.notifyOnAiAnalysis, notifyOnHandoffSent: !!wh.notifyOnHandoffSent, notifyOnReadyForQa: !!wh.notifyOnReadyForQa, notifyOnVerificationFailed: !!wh.notifyOnVerificationFailed, notifyOnPrLinkedToHandoff: !!wh.notifyOnPrLinkedToHandoff })
                                    }}><Edit2 className="h-3 w-3 mr-1" />Edit</Button>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#6B7280] hover:text-red-400 hover:bg-red-950/30" onClick={async () => {
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
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[#A78BFA] font-bold text-xs" onClick={() =>
                            setWebhookForm({ open: true, editId: null, name: '', url: '', type: 'Slack', notifyOnTestPlanFail: true, notifyOnHighPriorityDone: false, notifyOnDueDate: false, notifyOnAiAnalysis: false, notifyOnHandoffSent: true, notifyOnReadyForQa: true, notifyOnVerificationFailed: true, notifyOnPrLinkedToHandoff: true })
                        }>
                            <Plus className="h-3.5 w-3.5" /> Add Webhook
                        </Button>
                    )}

                    {webhookForm.open && (
                        <div className="mt-3 bg-[#0F0F13] border border-[#2A2A3A] rounded-xl p-4 space-y-3">
                            <p className="text-sm font-bold text-[#E2E8F0]">{webhookForm.editId ? 'Edit Webhook' : 'New Webhook'}</p>
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
                                    <p className="text-xs text-[#9CA3AF] mt-2">💡 Teams uses Power Automate Workflows (the old Incoming Webhooks connector is deprecated). Create a workflow in your Team Settings → Manage channel → Workflows → Incoming webhook.</p>
                                )}
                            </div>
                            <div className="border border-[#2A2A3A] rounded-xl p-3 space-y-2">
                                <p className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest mb-2">Notify On</p>
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
                                        <span className="text-xs text-[#9CA3AF]">{label}</span>
                                        <Toggle on={(webhookForm as any)[key]} onToggle={() => setWebhookForm(f => ({ ...f, [key]: !(f as any)[key] }))} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <Button size="sm" className="bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold h-8" onClick={async () => {
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
                                <Button variant="outline" size="sm" className="h-8 border-[#2A2A3A] text-[#9CA3AF] font-bold" disabled={webhookTesting || !webhookForm.url.trim()} onClick={async () => {
                                    setWebhookTesting(true)
                                    try {
                                        let testPayload: string
                                        if (webhookForm.type === 'Teams') {
                                            testPayload = JSON.stringify({
                                                type: 'message',
                                                attachments: [{
                                                    contentType: 'application/vnd.microsoft.card.adaptive',
                                                    content: {
                                                        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                                                        type: 'AdaptiveCard',
                                                        version: '1.4',
                                                        body: [
                                                            { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: '✅ Test Notification' },
                                                            { type: 'TextBlock', text: 'Webhook connection test from QAssistant.', wrap: true },
                                                        ],
                                                    },
                                                }],
                                            })
                                        } else if (webhookForm.type === 'Slack') {
                                            testPayload = JSON.stringify({
                                                attachments: [{
                                                    color: '#A78BFA',
                                                    title: '✅ Test Notification',
                                                    text: 'Webhook connection test from QAssistant.',
                                                    footer: 'QAssistant',
                                                    ts: Math.floor(Date.now() / 1000),
                                                }]
                                            })
                                        } else {
                                            testPayload = JSON.stringify({ title: '✅ Test Notification', message: 'Webhook connection test from QAssistant.', timestamp: new Date().toISOString() })
                                        }
                                        await fetch(webhookForm.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: testPayload })
                                        flash(setWebhookStatus, 'Test notification sent!', true)
                                    } catch (e: any) {
                                        flash(setWebhookStatus, `Test failed: ${e.message}`, false)
                                    } finally { setWebhookTesting(false) }
                                }}>{webhookTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Test</Button>
                                <Button variant="ghost" size="sm" className="h-8 text-red-400 hover:bg-red-950/30 font-bold" onClick={() => setWebhookForm(f => ({ ...f, open: false }))}>Cancel</Button>
                            </div>
                            <StatusBanner s={webhookStatus} />
                        </div>
                    )}
                    {!webhookForm.open && <StatusBanner s={webhookStatus} />}
                </Sec>

                {/* ── DIAGNOSTICS ──────────────────────────────────────────── */}
                <Sec id="diagnostics" title="Diagnostics" icon={<Search className="h-4 w-4" />} activeSection={activeSection} setActiveSection={setActiveSection}>
                    <SectionLabel>Storage & System Info</SectionLabel>
                    <div className="grid sm:grid-cols-2 gap-3 mb-4">
                        {[
                            { label: 'App Version', value: appVersion },
                            { label: 'Platform', value: sysInfo?.platform },
                            { label: 'Architecture', value: sysInfo?.arch },
                            { label: 'Electron', value: sysInfo?.electronVersion },
                            { label: 'Node.js', value: sysInfo?.nodeVersion },
                        ].filter(i => i.value).map(item => (
                            <div key={item.label} className="bg-[#0F0F13] border border-[#2A2A3A] rounded-xl px-4 py-3">
                                <p className="text-[10px] font-bold uppercase text-[#6B7280]">{item.label}</p>
                                <p className="text-sm font-semibold text-[#E2E8F0] mt-0.5">{item.value}</p>
                            </div>
                        ))}
                    </div>
                    {dataPath && (
                        <div className="bg-[#0F0F13] border border-[#2A2A3A] rounded-xl px-4 py-3 mb-4">
                            <p className="text-[10px] font-bold uppercase text-[#6B7280] mb-1">Data Storage Path</p>
                            <p className="text-[11px] font-mono text-[#A78BFA] break-all">{dataPath}</p>
                        </div>
                    )}
                    {/* Stored credentials for active project */}
                    {activeProject && (
                        <div className="bg-[#0F0F13] border border-[#2A2A3A] rounded-xl px-4 py-3 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold uppercase text-[#6B7280]">Stored Credentials</p>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-8 border-[#2A2A3A] text-[#9CA3AF] font-bold" onClick={refreshStoredCreds}>Refresh</Button>
                                </div>
                            </div>
                            {storedCreds.length === 0 && <p className="text-xs text-[#6B7280] italic">No stored secrets for this project.</p>}
                            <div className="space-y-2">
                                {storedCreds.map(k => (
                                    <div key={k} className="flex items-center justify-between bg-[#0A0A0D] border border-[#1F1F24] rounded-md px-3 py-2">
                                        <div className="text-sm text-[#E2E8F0]">{k}</div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" className="h-7 text-red-400" onClick={async () => {
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
                        <Button variant="outline" size="sm" className="h-9 border-[#2A2A3A] text-[#9CA3AF] font-bold gap-2" onClick={() => api.openFile(dataPath)}>
                            <Search className="h-3.5 w-3.5" />Open Data Folder
                        </Button>
                        <Button variant="ghost" size="sm" className="h-9 text-red-400 hover:bg-red-950/30 font-bold gap-2"
                            onClick={async () => {
                                const ok = await confirmDialog('Permanently delete all project data?', { description: 'This action cannot be undone. All projects, test cases, tasks, notes, and runs will be erased.', confirmLabel: 'Purge All Data', destructive: true })
                                if (ok) api.writeProjectsFile([])
                            }}>
                            <Trash2 className="h-3.5 w-3.5" />Purge All Data
                        </Button>
                    </div>
                    <div className="mt-6 pt-4 border-t border-[#2A2A3A] text-center">
                        <p className="text-[11px] text-[#4B5563] italic">© 2026 Lewandowskista · QAssistant</p>
                    </div>
                </Sec>

            </div>
        </div>
        {confirmDialogEl}
        </>
    )
}
