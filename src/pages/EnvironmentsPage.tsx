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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
        setTestStatus("Testing connection...")
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
            <div className="h-full flex flex-col items-center justify-center bg-[#0F0F13] gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-[#1A1A24] flex items-center justify-center opacity-40">
                    <Globe className="h-9 w-9 text-[#6B7280]" strokeWidth={1} />
                </div>
                <div className="opacity-60 space-y-1">
                    <p className="text-sm font-bold text-[#E2E8F0] uppercase tracking-widest">No Project Selected</p>
                    <p className="text-xs text-[#6B7280]">Select a project to manage environments.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex animate-in fade-in duration-500 overflow-hidden bg-[#0F0F13]">
            {/* Sidebar: environment list */}
            <aside className="w-[300px] flex-none bg-[#13131A] border-r border-[#2A2A3A] flex flex-col">
                <div className="p-4 border-b border-[#2A2A3A] space-y-1">
                    <h3 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">ENVIRONMENTS</h3>
                    <p className="text-[11px] text-[#6B7280] leading-tight">Per-project endpoint registry</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {environments.map((env) => (
                        <div
                            key={env.id}
                            onClick={() => setSelectedEnvId(env.id)}
                            className={cn(
                                "group p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3",
                                selectedEnvId === env.id
                                    ? "bg-[#1A1A24] border-[#A78BFA] shadow-lg shadow-[#A78BFA]/5"
                                    : "bg-transparent border-transparent hover:bg-[#1A1A24]/50 hover:border-[#2A2A3A]"
                            )}
                        >
                            <div className={cn("w-1 h-8 rounded-full flex-none", env.color || "bg-[#A78BFA]")} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-bold text-[#E2E8F0] truncate">{env.name}</h4>
                                    {env.isDefault && <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B] flex-none" />}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <div
                                        title={
                                            healthStatuses[env.id]
                                                ? `Last checked: ${healthStatuses[env.id].lastChecked}${healthStatuses[env.id].latencyMs != null ? ` (~${healthStatuses[env.id].latencyMs}ms)` : ''}`
                                                : ''
                                        }
                                        className={cn("w-2 h-2 rounded-full",
                                            healthStatuses[env.id]?.status === 'healthy' ? "bg-[#10B981]" :
                                            healthStatuses[env.id]?.status === 'unhealthy' ? "bg-[#EF4444]" : "bg-[#6B7280]"
                                        )} />
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                                        {ENV_TYPES.find(t => t.id === env.type)?.label || 'Custom'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {environments.length === 0 && (
                        <div className="py-10 text-center opacity-20 flex flex-col items-center gap-2">
                            <Server className="h-10 w-10" strokeWidth={1} />
                            <span className="text-xs font-bold uppercase tracking-widest">No Environments</span>
                        </div>
                    )}
                </div>

                <div className="p-3 bg-[#0F0F13] border-t border-[#2A2A3A] space-y-2">
                    <Button onClick={handleCheckAll} variant="outline" className="w-full h-10 border-[#2A2A3A] bg-[#1A1A24] text-[#E2E8F0] font-bold text-xs gap-2">
                        <Activity className="h-3.5 w-3.5" /> Check All Endpoints
                    </Button>
                    <Button onClick={handleAdd} className="w-full h-10 bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 font-bold text-xs gap-2">
                        <Plus className="h-3.5 w-3.5" /> ADD ENVIRONMENT
                    </Button>
                </div>
            </aside>

            {/* Detail / Editor Panel */}
            <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0F0F13]">
                {localEnv ? (
                    <div className="max-w-4xl mx-auto p-10 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                        {credentialStatus?.canPersistSecrets === false && (
                            <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 flex items-start gap-3">
                                <AlertTriangle className="h-4 w-4 text-yellow-300 mt-0.5 shrink-0" />
                                <p className="text-xs text-yellow-200 leading-relaxed">
                                    Environment credentials cannot be saved on this device until insecure plaintext storage is explicitly allowed in Settings.
                                </p>
                            </div>
                        )}
                        <header className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-14 h-14 rounded-2xl bg-[#1A1A24] border border-[#2A2A3A] flex items-center justify-center shadow-2xl shrink-0">
                                    <Monitor className="h-7 w-7 text-[#A78BFA]" />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <h2 className="text-2xl font-black text-[#E2E8F0] truncate">{localEnv.name}</h2>
                                    <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                                        Target ID: <span className="text-[#A78BFA] truncate">{localEnv.id}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 flex-wrap shrink-0">
                                <Button onClick={handleSwitchActive} variant="outline" size="sm" className="h-10 px-4 border-[#10B981]/20 text-[#10B981] hover:bg-[#10B981]/10 font-bold text-xs gap-2">
                                    <Activity className="h-4 w-4" /> Switch Active
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setBugDialogOpen(true)} className="h-10 px-4 border-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/10 font-bold text-xs gap-2">
                                    <Bug className="h-4 w-4" /> Report Bug
                                </Button>
                                <Button onClick={handleSave} className="h-10 px-6 bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD] font-black text-xs gap-2 shadow-xl shadow-[#A78BFA]/10">
                                    <Save className="h-4 w-4" /> SAVE CHANGES
                                </Button>
                            </div>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            {/* Base Config Section */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 pb-3 border-b border-[#2A2A3A]">
                                    <Globe className="h-4 w-4 text-[#A78BFA]/70" />
                                    <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-[#6B7280]">Connection Details</h3>
                                </div>

                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest px-1">Display Title</Label>
                                        <Input
                                            value={localEnv.name}
                                            onChange={e => setLocalEnv({ ...localEnv, name: e.target.value })}
                                            className="h-11 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0] focus-visible:ring-[#A78BFA]/30"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest px-1">Classification</Label>
                                        <Select value={localEnv.type} onValueChange={(val: EnvironmentType) => setLocalEnv({ ...localEnv, type: val })}>
                                            <SelectTrigger className="h-11 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                                {ENV_TYPES.map(type => (
                                                    <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest px-1">Host Base Endpoint</Label>
                                        <Input
                                            value={localEnv.baseUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, baseUrl: e.target.value })}
                                            placeholder="https://..."
                                            className="h-11 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest px-1">Heartbeat / Health Check</Label>
                                        <Input
                                            value={localEnv.healthCheckUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, healthCheckUrl: e.target.value })}
                                            placeholder="https://.../health"
                                            className="h-11 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SAP Commerce Integration Section */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 pb-3 border-b border-[#2A2A3A]">
                                    <Database className="h-4 w-4 text-[#A78BFA]/70" />
                                    <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-[#6B7280]">SAP Commerce Cluster</h3>
                                </div>

                                <div className="bg-[#1A1A24]/40 rounded-2xl border border-[#2A2A3A] p-6 space-y-5">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">HAC Console</Label>
                                        <Input
                                            value={localEnv.hacUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, hacUrl: e.target.value })}
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Back Office</Label>
                                        <Input
                                            value={localEnv.backOfficeUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, backOfficeUrl: e.target.value })}
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Storefront</Label>
                                        <Input
                                            value={localEnv.storefrontUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, storefrontUrl: e.target.value })}
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Solr Admin</Label>
                                        <Input
                                            value={localEnv.solrAdminUrl}
                                            onChange={e => setLocalEnv({ ...localEnv, solrAdminUrl: e.target.value })}
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">OCC Root Path</Label>
                                        <Input
                                            value={localEnv.occBasePath}
                                            onChange={e => setLocalEnv({ ...localEnv, occBasePath: e.target.value })}
                                            placeholder="/occ/v2"
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Security & Credentials */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="bg-[#1A3A2A]/10 rounded-2xl border border-[#10B981]/20 p-6 flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn("p-2 rounded-lg", localEnv.ignoreSslErrors ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#10B981]/10 text-[#10B981]")}>
                                        <ShieldCheck className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-[#E2E8F0]">Ignore SSL Errors</h4>
                                        <p className="text-[10px] text-[#6B7280] font-medium leading-tight mt-0.5">Bypass validation for self-signed or internal certs (Insecure).</p>
                                    </div>
                                    <Checkbox
                                        checked={localEnv.ignoreSslErrors}
                                        onCheckedChange={val => setLocalEnv({ ...localEnv, ignoreSslErrors: !!val })}
                                        className="h-5 w-5 border-[#2A2A3A] data-[state=checked]:bg-[#EF4444]"
                                    />
                                </div>
                            </div>

                            <div className="bg-[#1A1A24]/40 rounded-2xl border border-[#2A2A3A] p-6 space-y-4">
                                <div className="flex items-center gap-2 pb-2 border-b border-[#2A2A3A]">
                                    <Key className="h-4 w-4 text-[#A78BFA]/70" />
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">HAC Credentials</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Username</Label>
                                        <Input
                                            value={localEnv.username || ""}
                                            onChange={e => setLocalEnv({ ...localEnv, username: e.target.value })}
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2 relative">
                                        <Label className="text-[10px] font-bold text-[#6B7280] uppercase px-1">Password</Label>
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={localEnv.password || ""}
                                            onChange={e => setLocalEnv({ ...localEnv, password: e.target.value })}
                                            className="h-10 bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0] text-xs font-mono pr-10"
                                        />
                                        <button
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-8 text-[#6B7280] hover:text-[#E2E8F0] transition-colors"
                                        >
                                            {showPassword ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-[#6B7280] font-medium leading-tight italic">Securely stored credentials.</p>
                                    <Button 
                                        onClick={handleTestConnection} 
                                        disabled={isTesting}
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 border-[#A78BFA]/20 text-[#A78BFA] hover:bg-[#A78BFA]/10 text-[10px] font-bold"
                                    >
                                        {isTesting ? "Testing..." : "Test Connection"}
                                    </Button>
                                </div>
                                {testStatus && (
                                    <p className={cn("text-[10px] font-bold", testStatus.startsWith('✓') ? "text-[#10B981]" : "text-[#EF4444]")}>
                                        {testStatus}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Deployment Notes */}
                        <div className="space-y-4 pt-4 border-t border-[#2A2A3A]">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold uppercase text-[#6B7280] flex items-center gap-2">
                                    <StickyNote className="h-3.5 w-3.5 text-[#A78BFA]" /> Operational Status & Notes
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Checkbox checked={localEnv.isDefault} onCheckedChange={() => setEnvironmentDefault(activeProjectId!, localEnv.id)} className="h-4 w-4 border-[#2A2A3A] data-[state=checked]:bg-[#A78BFA]" />
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase">Set as project default</span>
                                </div>
                            </div>
                            <Textarea
                                rows={4}
                                value={localEnv.notes}
                                onChange={e => setLocalEnv({ ...localEnv, notes: e.target.value })}
                                placeholder="Add deployment logs, access requirements, or cluster info..."
                                className="h-32 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0] text-sm leading-relaxed p-4"
                            />
                        </div>

                        {/* Dangerous Actions */}
                        <div className="pt-6 flex items-center justify-between border-t border-[#2A2A3A]">
                            <p className="text-[10px] font-black text-[#EF4444] uppercase tracking-widest opacity-40">Security Subsystem: Critical Controls</p>
                            <div className="flex gap-4">
                                <Button onClick={() => handleDelete(localEnv.id)} className="h-10 bg-[#3F1A1A] text-[#EF4444] hover:bg-[#522525] border border-[#EF4444]/20 font-bold text-xs gap-2">
                                    <Trash2 className="h-3.5 w-3.5" /> DELETE ENVIRONMENT
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center h-full p-24 text-center space-y-6">
                        <div className="w-24 h-24 rounded-full bg-[#1A1A24] flex items-center justify-center animate-pulse">
                            <Server className="h-10 w-10 text-[#6B7280]/30" strokeWidth={1} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-black text-[#E2E8F0]">Target Selection Required</h3>
                            <p className="text-sm text-[#6B7280] max-w-sm mx-auto font-medium">Link separate targets like Development, UAT, and Production to monitor operational integrity.</p>
                        </div>
                        <Button onClick={handleAdd} className="h-11 px-8 bg-[#A78BFA] text-[#0F0F13] font-black">
                            <Plus className="h-5 w-5 mr-2" /> CREATE ENDPOINT
                        </Button>
                    </div>
                )}
            </main>

            <BugReportDialog
                open={bugDialogOpen}
                onOpenChange={setBugDialogOpen}
                defaultEnv={selectedEnv}
            />

            {/* Add Environment Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="bg-[#13131A] border-[#2A2A3A] sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-[#E2E8F0] uppercase tracking-widest text-sm">Add New Endpoint</DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider px-1">Environment Name</Label>
                            <Input
                                autoFocus
                                value={newEnvName}
                                onChange={(e) => setNewEnvName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmAdd()
                                }}
                                placeholder="e.g. Production US"
                                className="h-11 bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-[#13131A]">
                        <Button variant="ghost" onClick={() => setIsAddModalOpen(false)} className="text-[#6B7280] hover:text-[#E2E8F0]">CANCEL</Button>
                        <Button onClick={handleConfirmAdd} disabled={!newEnvName.trim()} className="bg-[#A78BFA] text-[#0F0F13] font-bold px-8">CREATE</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                <DialogContent className="bg-[#13131A] border-[#EF4444]/30 sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-[#EF4444] uppercase tracking-widest text-sm">Destructive Action</DialogTitle>
                    </DialogHeader>
                    <div className="py-6">
                        <p className="text-sm text-[#E2E8F0]">Are you sure you want to delete this environment? This action cannot be undone.</p>
                    </div>
                    <DialogFooter className="bg-[#13131A]">
                        <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)} className="text-[#6B7280] hover:text-[#E2E8F0]">CANCEL</Button>
                        <Button onClick={handleConfirmDelete} className="bg-[#EF4444] text-white hover:bg-[#DC2626] font-bold px-8">DELETE</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
