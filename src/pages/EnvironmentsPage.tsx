import { useState, useEffect } from "react"
import { useProjectStore, QaEnvironment, EnvironmentType } from "@/store/useProjectStore"

// Health entry shape returned from IPC
interface HealthEntry {
    status: 'unknown' | 'healthy' | 'unhealthy';
    lastChecked: string;
    latencyMs?: number;
}
import { Plus, Trash2, Save, Activity, Server, ShieldCheck, Globe, Database, Key, StickyNote, Star, Bug, Monitor, Lock, Unlock, AlertTriangle } from "lucide-react"
import { BugReportDialog } from "@/components/BugReportDialog"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { FullBleedHeader } from "@/components/ui/workspace"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
// No dropdown imports used in this version

const ENV_TYPES: { id: EnvironmentType; label: string }[] = [
    { id: 'development', label: 'Development' },
    { id: 'staging', label: 'Staging' },
    { id: 'production', label: 'Production' },
    { id: 'custom', label: 'Custom' },
]

type EditableEnvironment = QaEnvironment & {
    username?: string
    password?: string
}

type CredentialStorageStatus = Awaited<ReturnType<typeof window.electronAPI.getCredentialStorageStatus>>

export default function EnvironmentsPage() {
    const api = window.electronAPI
    const { projects, activeProjectId, addEnvironment, updateEnvironment, deleteEnvironment, setEnvironmentDefault } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const environments = activeProject?.environments || []

    const [selectedEnvId, setSelectedEnvId] = useState<string | null>(environments.length > 0 ? (environments.find(e => e.isDefault)?.id || environments[0].id) : null)
    const [localEnv, setLocalEnv] = useState<EditableEnvironment | null>(null)
    const [healthStatuses, setHealthStatuses] = useState<Record<string, HealthEntry>>({})
    const [bugDialogOpen, setBugDialogOpen] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [newEnvName, setNewEnvName] = useState("")
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [envToDelete, setEnvToDelete] = useState<string | null>(null)
    const [credentialStatus, setCredentialStatus] = useState<CredentialStorageStatus | null>(null)

    const selectedEnv = environments.find(e => e.id === selectedEnvId)

    useEffect(() => {
        const load = async () => {
            if (selectedEnv) {
                const username = await api.secureStoreGet(`Env_${selectedEnv.id}_Username`)
                const password = await api.secureStoreGet(`Env_${selectedEnv.id}_Password`)
                setLocalEnv({ ...selectedEnv, username: username || "", password: password || "" })
            } else {
                setLocalEnv(null)
            }
        }
        load()
    }, [selectedEnvId, environments])

    useEffect(() => {
        api.getCredentialStorageStatus?.().then(setCredentialStatus).catch(() => {})
    }, [api])

    const handleAdd = () => {
        setNewEnvName("")
        setIsAddModalOpen(true)
    }

    const handleConfirmAdd = async () => {
        if (!activeProjectId || !newEnvName.trim()) return
        await addEnvironment(activeProjectId, newEnvName.trim()).catch(console.error)
        setIsAddModalOpen(false)
        setNewEnvName("")
    }

    const handleSave = async () => {
        if (!activeProjectId || !localEnv) return
        const status = await api.getCredentialStorageStatus?.()
        setCredentialStatus(status ?? null)
        if (status?.canPersistSecrets === false && ((localEnv.username || '').trim() || (localEnv.password || '').trim())) {
            setTestStatus("Credential storage is blocked until insecure plaintext storage is explicitly allowed in Settings.")
            return
        }

        // Save to project store (exclude credentials from plain JSON)
        const { username, password, ...envData } = localEnv
        await updateEnvironment(activeProjectId, localEnv.id, envData).catch(console.error)

        // Save credentials securely
        if (username) await api.secureStoreSet(`Env_${localEnv.id}_Username`, username)
        else await api.secureStoreDelete(`Env_${localEnv.id}_Username`)

        if (password) await api.secureStoreSet(`Env_${localEnv.id}_Password`, password)
        else await api.secureStoreDelete(`Env_${localEnv.id}_Password`)
    }

    const handleDelete = (id: string) => {
        setEnvToDelete(id)
        setIsDeleteModalOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (!activeProjectId || !envToDelete) return
        await deleteEnvironment(activeProjectId, envToDelete).catch(console.error)
        if (selectedEnvId === envToDelete) setSelectedEnvId(null)
        setIsDeleteModalOpen(false)
        setEnvToDelete(null)
    }

    const handleCheckAll = async () => {
        if (!environments || environments.length === 0) return;
        try {
            const result: Record<string, HealthEntry> = await api.checkEnvironmentsHealth(environments);
            setHealthStatuses(result);
        } catch (e: any) {
            console.error('Health check failed', e);
        }
    }

    const [testStatus, setTestStatus] = useState("")
    const [isTesting, setIsTesting] = useState(false)

    const handleTestConnection = async () => {
        if (!localEnv?.baseUrl) {
            setTestStatus("Enter a Base URL to test.")
            return
        }
        setIsTesting(true)
        setTestStatus("Testing connection…")
        try {
            const res = await api.checkEnvironmentsHealth([localEnv])
            const status = res[localEnv.id]
            if (status?.status === 'healthy') {
                setTestStatus(`✓ Reachable — Latency: ${status.latencyMs}ms`)
            } else {
                setTestStatus("✗ Unreachable: Connection failed.")
            }
        } catch (e: any) {
            setTestStatus(`✗ Error: ${e.message}`)
        } finally {
            setIsTesting(false)
        }
    }

    const handleSwitchActive = () => {
        if (!activeProjectId || !localEnv) return
        setEnvironmentDefault(activeProjectId, localEnv.id)
    }

    // automatically start the periodic health service when env list changes
    useEffect(() => {
        if (environments && environments.length > 0) {
            api.startHealthService(environments, 30000);
            handleCheckAll();
        }
        return () => {
            api.stopHealthService();
        };
    }, [environments]);

    if (!activeProject) {
        return (
            <div className="h-full flex items-center justify-center bg-app p-10">
                <EmptyState
                    icon={Globe}
                    title="No project selected"
                    description="Select a project to manage environments."
                />
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 overflow-hidden bg-app">
            <FullBleedHeader
                icon={Server}
                title="Environments"
                description="Per-project endpoint registry"
                actions={
                    <>
                        <Button onClick={handleCheckAll} variant="outline" size="sm" className="gap-2">
                            <Activity className="h-3.5 w-3.5" /> Check all endpoints
                        </Button>
                        <Button onClick={handleAdd} size="sm" className="gap-2">
                            <Plus className="h-3.5 w-3.5" /> Add environment
                        </Button>
                    </>
                }
            />

            <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar: environment list */}
            <aside className="w-[300px] flex-none bg-panel border-r border-ui flex flex-col">
                <div className="p-4 border-b border-ui">
                    <p className="app-section-label">Environments</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {environments.map((env) => (
                        <div
                            key={env.id}
                            onClick={() => setSelectedEnvId(env.id)}
                            className={cn(
                                "group p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3",
                                selectedEnvId === env.id
                                    ? "bg-panel-muted border-qa-accent shadow-lg shadow-qa-accent/5"
                                    : "bg-transparent border-transparent hover:bg-surface-alt/50 hover:border-ui"
                            )}
                        >
                            <div className={cn("w-1 h-8 rounded-full flex-none", env.color || "bg-primary")} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-semibold text-foreground truncate">{env.name}</h4>
                                    {env.isDefault && <Star className="h-3 w-3 fill-state-warning text-state-warning flex-none" />}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {(() => {
                                        const health = healthStatuses[env.id]?.status
                                        const healthLabel = health === 'healthy' ? 'Healthy' : health === 'unhealthy' ? 'Unhealthy' : 'Status unknown'
                                        const checked = healthStatuses[env.id]
                                            ? `Last checked: ${healthStatuses[env.id].lastChecked}${healthStatuses[env.id].latencyMs != null ? ` (~${healthStatuses[env.id].latencyMs}ms)` : ''}`
                                            : 'Not checked yet'
                                        return (
                                            <div
                                                role="img"
                                                aria-label={`${healthLabel}. ${checked}`}
                                                title={`${healthLabel} — ${checked}`}
                                                className={cn("w-2 h-2 rounded-full flex-none",
                                                    health === 'healthy' ? "bg-state-success" :
                                                    health === 'unhealthy' ? "bg-state-danger" : "bg-line-strong"
                                                )} />
                                        )
                                    })()}
                                    <span className="text-xs text-muted-ui">
                                        {ENV_TYPES.find(t => t.id === env.type)?.label || 'Custom'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {environments.length === 0 && (
                        <div className="px-3 py-10 text-center text-muted-ui space-y-2">
                            <Server className="h-8 w-8 mx-auto opacity-40" strokeWidth={1.5} />
                            <p className="text-xs">No environments yet. Add one to get started.</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* Detail / Editor Panel */}
            <main className="flex-1 overflow-y-auto custom-scrollbar bg-app">
                {localEnv ? (
                    <div className="max-w-4xl mx-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                        {credentialStatus?.canPersistSecrets === false && (
                            <div className="rounded-2xl border border-state-warning/40 bg-state-warning-soft px-4 py-3 flex items-start gap-3">
                                <AlertTriangle className="h-4 w-4 text-state-warning mt-0.5 shrink-0" />
                                <p className="text-xs text-state-warning leading-relaxed">
                                    Environment credentials cannot be saved on this device until insecure plaintext storage is explicitly allowed in Settings.
                                </p>
                            </div>
                        )}
                        <header className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-14 h-14 rounded-2xl bg-panel-muted border border-ui flex items-center justify-center shrink-0">
                                    <Monitor className="h-7 w-7 text-brand" />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <h2 className="text-xl font-semibold tracking-tight text-foreground truncate">{localEnv.name}</h2>
                                    <p className="app-helper-text flex items-center gap-2">
                                        Target ID: <span className="text-brand truncate">{localEnv.id}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 flex-wrap shrink-0">
                                <Button onClick={handleSwitchActive} variant="outline" size="sm" className="h-10 px-4 border-state-success-border text-state-success hover:bg-state-success-soft gap-2">
                                    <Activity className="h-4 w-4" /> Switch active
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setBugDialogOpen(true)} className="h-10 px-4 border-state-danger-border text-state-danger hover:bg-state-danger-soft gap-2">
                                    <Bug className="h-4 w-4" /> Report bug
                                </Button>
                                <Button onClick={handleSave} className="h-10 px-6 gap-2">
                                    <Save className="h-4 w-4" /> Save changes
                                </Button>
                            </div>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            {/* Base Config Section */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 pb-3 border-b border-ui">
                                    <Globe className="h-4 w-4 text-qa-accent/70" />
                                    <h3 className="app-section-label">Connection details</h3>
                                </div>

                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Display title</Label>
                                        <Input
                                            value={localEnv.name}
                                            onChange={e => setLocalEnv({ ...localEnv, name: e.target.value })}
                                            className="h-11 bg-panel-muted border-ui text-foreground focus-visible:ring-qa-accent/30"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Classification</Label>
                                        <Select value={localEnv.type} onValueChange={(val: EnvironmentType) => setLocalEnv({ ...localEnv, type: val })}>
                                            <SelectTrigger className="h-11 bg-panel-muted border-ui text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-panel-muted border-ui text-foreground">
                                                {ENV_TYPES.map(type => (
                                                    <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Host base endpoint</Label>
                                        <Input
                                            value={localEnv.baseUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, baseUrl: e.target.value })}
                                            placeholder="https://..."
                                            className="h-11 bg-panel-muted border-ui text-foreground"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Heartbeat / health check</Label>
                                        <Input
                                            value={localEnv.healthCheckUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, healthCheckUrl: e.target.value })}
                                            placeholder="https://.../health"
                                            className="h-11 bg-panel-muted border-ui text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SAP Commerce Integration Section */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 pb-3 border-b border-ui">
                                    <Database className="h-4 w-4 text-qa-accent/70" />
                                    <h3 className="app-section-label">SAP Commerce cluster</h3>
                                </div>

                                <div className="bg-surface-alt/40 rounded-2xl border border-ui p-6 space-y-5">
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">HAC console</Label>
                                        <Input
                                            value={localEnv.hacUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, hacUrl: e.target.value })}
                                            className="h-10 bg-panel border-ui text-foreground text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Back office</Label>
                                        <Input
                                            value={localEnv.backOfficeUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, backOfficeUrl: e.target.value })}
                                            className="h-10 bg-panel border-ui text-foreground text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Storefront</Label>
                                        <Input
                                            value={localEnv.storefrontUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, storefrontUrl: e.target.value })}
                                            className="h-10 bg-panel border-ui text-foreground text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Solr admin</Label>
                                        <Input
                                            value={localEnv.solrAdminUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, solrAdminUrl: e.target.value })}
                                            className="h-10 bg-panel border-ui text-foreground text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">OCC root path</Label>
                                        <Input
                                            value={localEnv.occBasePath}
                                            onChange={e => setLocalEnv({ ...localEnv, occBasePath: e.target.value })}
                                            placeholder="/occ/v2"
                                            className="h-10 bg-panel border-ui text-foreground text-xs"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Security & Credentials */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="bg-state-success-soft rounded-2xl border border-state-success-border p-6 flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-lg", localEnv.ignoreSslErrors ? "bg-state-danger-soft text-state-danger" : "bg-state-success-soft text-state-success")}>
                                        <ShieldCheck className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-semibold text-foreground">Ignore SSL errors</h4>
                                        <p className="text-xs text-muted-ui leading-tight mt-0.5">Bypass validation for self-signed or internal certs (insecure).</p>
                                    </div>
                                    <Checkbox
                                        checked={localEnv.ignoreSslErrors}
                                        onCheckedChange={val => setLocalEnv({ ...localEnv, ignoreSslErrors: !!val })}
                                        className="h-5 w-5 border-ui data-[state=checked]:bg-state-danger"
                                    />
                                </div>
                            </div>

                            <div className="bg-surface-alt/40 rounded-2xl border border-ui p-6 space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-ui">
                                    <Key className="h-4 w-4 text-qa-accent/70" />
                                    <h3 className="app-section-label">HAC credentials</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="app-field-label px-1">Username</Label>
                                        <Input
                                            value={localEnv.username || ""}
                                            onChange={e => setLocalEnv({ ...localEnv, username: e.target.value })}
                                            className="h-10 bg-panel border-ui text-foreground text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2 relative">
                                        <Label className="app-field-label px-1">Password</Label>
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={localEnv.password || ""}
                                            onChange={e => setLocalEnv({ ...localEnv, password: e.target.value })}
                                            className="h-10 bg-panel border-ui text-foreground text-xs font-mono pr-10"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-8 text-muted-ui hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="app-helper-text">Credentials are stored securely.</p>
                                    <Button
                                        onClick={handleTestConnection}
                                        disabled={isTesting}
                                        variant="outline"
                                        size="sm"
                                        className="h-8 border-qa-accent/20 text-brand hover:bg-qa-accent/10"
                                    >
                                        {isTesting ? "Testing…" : "Test connection"}
                                    </Button>
                                </div>
                                {testStatus && (
                                    <p className={cn("text-xs font-medium", testStatus.startsWith('✓') ? "text-state-success" : "text-state-danger")}>
                                        {testStatus}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Deployment Notes */}
                        <div className="space-y-4 pt-4 border-t border-ui">
                            <div className="flex items-center justify-between">
                                <Label className="app-field-label mb-0 flex items-center gap-2">
                                    <StickyNote className="h-3.5 w-3.5 text-brand" /> Operational status & notes
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Checkbox checked={localEnv.isDefault} onCheckedChange={() => setEnvironmentDefault(activeProjectId!, localEnv.id)} className="h-4 w-4 border-ui data-[state=checked]:bg-qa-accent" />
                                    <span className="text-xs text-muted-ui">Set as project default</span>
                                </div>
                            </div>
                            <Textarea
                                rows={4}
                                value={localEnv.notes}
                                onChange={e => setLocalEnv({ ...localEnv, notes: e.target.value })}
                                placeholder="Add deployment logs, access requirements, or cluster info…"
                                className="h-32 bg-panel-muted border-ui text-foreground text-sm leading-relaxed p-4"
                            />
                        </div>

                        {/* Dangerous Actions */}
                        <div className="pt-6 flex items-center justify-between border-t border-ui">
                            <p className="app-helper-text text-state-danger">Danger zone</p>
                            <div className="flex gap-4">
                                <Button onClick={() => handleDelete(localEnv.id)} variant="outline" className="h-10 bg-state-danger-soft text-state-danger hover:bg-state-danger-soft border-state-danger-border gap-2">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete environment
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center p-10">
                        <EmptyState
                            icon={Server}
                            title="No environment selected"
                            description="Select an environment from the list, or add one to track development, staging, and production targets."
                            actions={
                                <Button onClick={handleAdd} className="gap-2">
                                    <Plus className="h-4 w-4" /> Add environment
                                </Button>
                            }
                        />
                    </div>
                )}
            </main>
            </div>

            <BugReportDialog
                open={bugDialogOpen}
                onOpenChange={setBugDialogOpen}
                defaultEnv={selectedEnv}
            />

            {/* Add Environment Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="bg-panel border-ui sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground text-sm font-semibold">Add environment</DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="app-field-label px-1">Environment name</Label>
                            <Input
                                autoFocus
                                value={newEnvName}
                                onChange={(e) => setNewEnvName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmAdd()
                                }}
                                placeholder="e.g. Production US"
                                className="h-11 bg-panel-muted border-ui text-foreground"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-panel">
                        <Button variant="ghost" onClick={() => setIsAddModalOpen(false)} className="text-muted-ui hover:text-foreground">Cancel</Button>
                        <Button onClick={handleConfirmAdd} disabled={!newEnvName.trim()} className="px-8">Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                <DialogContent className="bg-panel border-state-danger-border sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-state-danger text-sm font-semibold">Delete environment</DialogTitle>
                    </DialogHeader>
                    <div className="py-6">
                        <p className="text-sm text-foreground">Are you sure you want to delete this environment? This action cannot be undone.</p>
                    </div>
                    <DialogFooter className="bg-panel">
                        <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)} className="text-muted-ui hover:text-foreground">Cancel</Button>
                        <Button onClick={handleConfirmDelete} className="bg-state-danger text-primary-foreground hover:bg-state-danger px-8">Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
