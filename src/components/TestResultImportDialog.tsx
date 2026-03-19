import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/store/useProjectStore'
import { Upload, Loader2, CheckCircle2, XCircle, AlertCircle, FileCode2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ParsedSuite {
    name: string
    cases: Array<{
        externalId: string
        title: string
        result: string
        actualResult: string
        durationSeconds?: number
    }>
}

interface TestResultImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function TestResultImportDialog({ open, onOpenChange }: TestResultImportDialogProps) {
    const { projects, activeProjectId, addTestPlan, batchAddTestCasesToPlan, addTestRunSession } = useProjectStore()
    const activeProject = projects.find(p => p.id === activeProjectId)
    const api = window.electronAPI

    const [loading, setLoading] = useState(false)
    const [suites, setSuites] = useState<ParsedSuite[]>([])
    const [format, setFormat] = useState<string>('')
    const [fileName, setFileName] = useState<string>('')
    const [selectedSuiteIdxs, setSelectedSuiteIdxs] = useState<Set<number>>(new Set())
    const [selectedEnvId, setSelectedEnvId] = useState<string>(activeProject?.environments.find(e => e.isDefault)?.id || '')
    const [importing, setImporting] = useState(false)

    const environments = activeProject?.environments || []

    const handleSelectFile = async () => {
        const filePath = await api.selectFile([
            { name: 'Test Results', extensions: ['xml', 'json'] },
        ])
        if (!filePath) return
        setLoading(true)
        setSuites([])
        setSelectedSuiteIdxs(new Set())
        try {
            const result = await api.importTestResults({ filePath })
            if (!result.success) { toast.error(result.error || 'Parse failed'); return }
            setSuites(result.suites || [])
            setFormat(result.format || '')
            setFileName((filePath as string).split(/[\\/]/).pop() || filePath as string)
            setSelectedSuiteIdxs(new Set((result.suites || []).map((_: any, i: number) => i)))
        } catch (err: any) {
            toast.error('Import failed: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const toggleSuite = (idx: number) => {
        setSelectedSuiteIdxs(prev => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx); else next.add(idx)
            return next
        })
    }

    const handleImport = async () => {
        if (!activeProjectId || selectedSuiteIdxs.size === 0) return
        setImporting(true)
        try {
            const env = environments.find(e => e.id === selectedEnvId)
            const selectedSuites = suites.filter((_, i) => selectedSuiteIdxs.has(i))
            const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

            const planExecutions = []
            for (const suite of selectedSuites) {
                const planId = await addTestPlan(activeProjectId, suite.name, `Imported from ${fileName} · ${ts}`, false, 'manual')
                await batchAddTestCasesToPlan(activeProjectId, planId, suite.cases.map(c => ({
                    title: c.title,
                    preConditions: '',
                    steps: '',
                    testData: '',
                    expectedResult: '',
                    actualResult: c.actualResult,
                    priority: 'medium' as const,
                    status: c.result as any,
                    sourceIssueId: c.externalId,
                })))

                // Build caseExecutions snapshot — we need plan's testCases to get real IDs
                const updatedProject = useProjectStore.getState().projects.find(p => p.id === activeProjectId)
                const plan = updatedProject?.testPlans.find(tp => tp.id === planId)
                const caseExecutions = (plan?.testCases || []).map((tc, i) => {
                    const src = suite.cases[i]
                    return {
                        id: crypto.randomUUID(),
                        testCaseId: tc.id,
                        result: (src?.result || 'not-run') as any,
                        actualResult: src?.actualResult || '',
                        notes: '',
                        snapshotTestCaseTitle: tc.title,
                        snapshotPreConditions: '',
                        snapshotSteps: '',
                        snapshotTestData: '',
                        snapshotExpectedResult: '',
                        snapshotPriority: tc.priority,
                        durationSeconds: src?.durationSeconds,
                        environmentId: selectedEnvId || undefined,
                        environmentName: env?.name,
                    }
                })
                planExecutions.push({
                    id: crypto.randomUUID(),
                    testPlanId: planId,
                    snapshotTestPlanName: suite.name,
                    caseExecutions,
                })
            }

            await addTestRunSession(activeProjectId, {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                planExecutions,
                environmentId: selectedEnvId || undefined,
                environmentName: environments.find(e => e.id === selectedEnvId)?.name,
            })

            toast.success(`Imported ${selectedSuites.length} suite${selectedSuites.length !== 1 ? 's' : ''} from ${fileName}`)
            onOpenChange(false)
            setSuites([])
            setFileName('')
        } catch (err: any) {
            toast.error('Import failed: ' + err.message)
        } finally {
            setImporting(false)
        }
    }

    const getResultIcon = (result: string) => {
        if (result === 'passed') return <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
        if (result === 'failed') return <XCircle className="h-3 w-3 text-[#EF4444]" />
        if (result === 'skipped') return <AlertCircle className="h-3 w-3 text-[#6B7280]" />
        return null
    }

    const totalCases = suites.filter((_, i) => selectedSuiteIdxs.has(i)).reduce((sum, s) => sum + s.cases.length, 0)
    const totalPassed = suites.filter((_, i) => selectedSuiteIdxs.has(i)).reduce((sum, s) => sum + s.cases.filter(c => c.result === 'passed').length, 0)
    const totalFailed = suites.filter((_, i) => selectedSuiteIdxs.has(i)).reduce((sum, s) => sum + s.cases.filter(c => c.result === 'failed').length, 0)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[680px] bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCode2 className="h-5 w-5 text-[#A78BFA]" />
                        Import Test Results
                    </DialogTitle>
                    <DialogDescription className="text-[#6B7280]">
                        Import JUnit XML (Selenium, TestNG, Maven) or Playwright JSON results as a new test run session.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* File selector */}
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={handleSelectFile}
                            disabled={loading}
                            variant="outline"
                            className="border-[#2A2A3A] text-[#A78BFA] hover:bg-[#A78BFA]/10 gap-2"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {loading ? 'Parsing...' : 'Select File'}
                        </Button>
                        {fileName && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-[#9CA3AF]">{fileName}</span>
                                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#A78BFA]/10 text-[#A78BFA]">{format}</span>
                            </div>
                        )}
                    </div>

                    {suites.length > 0 && (
                        <>
                            {/* Environment */}
                            <div className="flex items-center gap-3">
                                <Label className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest shrink-0">Environment</Label>
                                <select
                                    value={selectedEnvId}
                                    onChange={e => setSelectedEnvId(e.target.value)}
                                    className="h-8 rounded-md bg-[#0F0F13] border border-[#2A2A3A] px-2 text-xs text-[#E2E8F0] focus:outline-none"
                                >
                                    <option value="">None</option>
                                    {environments.map(env => (
                                        <option key={env.id} value={env.id}>{env.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Summary bar */}
                            <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-[#0F0F13] border border-[#2A2A3A] text-xs font-bold">
                                <span className="text-[#6B7280]">{totalCases} cases</span>
                                <span className="text-[#10B981]">{totalPassed} passed</span>
                                <span className="text-[#EF4444]">{totalFailed} failed</span>
                                <span className="text-[#6B7280]">{totalCases - totalPassed - totalFailed} skipped</span>
                            </div>

                            {/* Suite list */}
                            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-2">
                                {suites.map((suite, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "rounded-lg border p-3 cursor-pointer transition-all",
                                            selectedSuiteIdxs.has(i)
                                                ? "border-[#A78BFA]/40 bg-[#1A1A24]"
                                                : "border-[#2A2A3A] bg-[#0F0F13] opacity-60"
                                        )}
                                        onClick={() => toggleSuite(i)}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <input type="checkbox" checked={selectedSuiteIdxs.has(i)} onChange={() => toggleSuite(i)} className="accent-[#A78BFA]" onClick={e => e.stopPropagation()} />
                                            <span className="text-xs font-bold text-[#E2E8F0] flex-1 truncate">{suite.name}</span>
                                            <span className="text-[10px] font-bold text-[#6B7280]">{suite.cases.length} cases</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-16 overflow-hidden">
                                            {suite.cases.slice(0, 12).map((c, ci) => (
                                                <div key={ci} className="flex items-center gap-1" title={c.title}>
                                                    {getResultIcon(c.result)}
                                                </div>
                                            ))}
                                            {suite.cases.length > 12 && (
                                                <span className="text-[9px] text-[#6B7280]">+{suite.cases.length - 12} more</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleImport}
                        disabled={importing || selectedSuiteIdxs.size === 0}
                        className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]"
                    >
                        {importing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Importing...</> : `Import ${selectedSuiteIdxs.size} Suite${selectedSuiteIdxs.size !== 1 ? 's' : ''}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
