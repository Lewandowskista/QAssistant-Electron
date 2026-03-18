import { useState, useRef } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { AccuracyEvalRun, AccuracyTestSuite } from "@/types/project"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SuiteSetup } from "./SuiteSetup"
import { EvalResults } from "./EvalResults"
import { EvalRunHistory } from "./EvalRunHistory"
import { runAccuracyEvaluation } from "@/lib/accuracy"
import { Plus, ChevronDown, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type PanelTab = 'setup' | 'results' | 'history'

export default function AIAccuracyPanel() {
    const {
        projects, activeProjectId,
        addAccuracySuite, updateAccuracySuite, deleteAccuracySuite,
        addAccuracyRefDoc, removeAccuracyRefDoc,
        addAccuracyQaPair, batchAddAccuracyQaPairs, removeAccuracyQaPair,
        addAccuracyEvalRun, updateAccuracyEvalRun
    } = useProjectStore()

    const activeProject = projects.find(p => p.id === activeProjectId)
    const suites = activeProject?.accuracyTestSuites ?? []

    const [activeSuiteId, setActiveSuiteId] = useState<string | null>(suites[0]?.id ?? null)
    const [activeTab, setActiveTab] = useState<PanelTab>('setup')
    const [isCreatingSuite, setIsCreatingSuite] = useState(false)
    const [newSuiteName, setNewSuiteName] = useState('')
    const [isEvaluating, setIsEvaluating] = useState(false)
    const [evalProgress, setEvalProgress] = useState<{ completed: number; total: number; currentQuestion?: string } | null>(null)
    const [activeRunId, setActiveRunId] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    const activeSuite = suites.find(s => s.id === activeSuiteId) ?? suites[0] ?? null

    // Sync activeSuiteId if suites change
    if (!activeSuiteId && suites.length > 0) {
        setActiveSuiteId(suites[0].id)
    }

    if (!activeProjectId) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <p className="text-sm text-[#6B7280]">No active project selected.</p>
            </div>
        )
    }

    const handleCreateSuite = async () => {
        if (!newSuiteName.trim()) return
        const id = await addAccuracySuite(activeProjectId, newSuiteName.trim())
        setActiveSuiteId(id)
        setNewSuiteName('')
        setIsCreatingSuite(false)
        setActiveTab('setup')
    }

    const handleAddDoc = async (filePath: string, fileName: string, mimeType: string, fileSizeBytes: number) => {
        if (!activeSuite) return
        // Get chunk count by reading the document
        let chunkCount = 0
        try {
            const readResult = await window.electronAPI.readDocumentText({ filePath })
            chunkCount = readResult.chunkCount ?? 0
        } catch { /* ignore */ }

        await addAccuracyRefDoc(activeProjectId, activeSuite.id, {
            fileName, filePath, mimeType, fileSizeBytes, chunkCount
        })
    }

    const handleRunEvaluation = async () => {
        if (!activeSuite) return
        const settings = await window.electronAPI.readSettingsFile()
        const apiKey = settings?.geminiApiKey
        if (!apiKey) {
            toast.error('Gemini API key not configured. Go to Settings to add it.')
            return
        }

        const modelName = activeProject?.geminiModel

        setIsEvaluating(true)
        setEvalProgress({ completed: 0, total: activeSuite.qaPairs.length })
        abortRef.current = new AbortController()

        // Create a pending run record immediately
        const pendingRun: Omit<AccuracyEvalRun, 'id'> = {
            name: `Eval Run ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
            status: 'running',
            qaPairResults: [],
            aggregateScore: 0,
            aggregateDimensions: [],
            totalPairs: activeSuite.qaPairs.length,
            completedPairs: 0,
            startedAt: Date.now()
        }
        const runId = await addAccuracyEvalRun(activeProjectId, activeSuite.id, pendingRun)
        setActiveRunId(runId)

        try {
            const completedRun = await runAccuracyEvaluation(
                activeSuite,
                apiKey,
                modelName,
                (completed, total, currentQuestion) => {
                    setEvalProgress({ completed, total, currentQuestion })
                    updateAccuracyEvalRun(activeProjectId, activeSuite.id, runId, {
                        completedPairs: completed
                    })
                },
                abortRef.current.signal
            )

            // Save completed run, replacing the pending one
            await updateAccuracyEvalRun(activeProjectId, activeSuite.id, runId, {
                ...completedRun,
                id: runId,
                status: 'completed'
            })

            toast.success(`Evaluation complete — ${completedRun.aggregateScore}/100 overall score`)
            setActiveTab('results')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg === 'Evaluation cancelled') {
                await updateAccuracyEvalRun(activeProjectId, activeSuite.id, runId, { status: 'cancelled' })
                toast.info('Evaluation cancelled')
            } else {
                await updateAccuracyEvalRun(activeProjectId, activeSuite.id, runId, { status: 'failed', error: msg })
                toast.error(`Evaluation failed: ${msg}`)
            }
        } finally {
            setIsEvaluating(false)
            setEvalProgress(null)
            abortRef.current = null
        }
    }

    const activeRun = activeSuite?.evalRuns.find(r => r.id === activeRunId)
        ?? activeSuite?.evalRuns.filter(r => r.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[0]
        ?? null

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0F0F13]">
            {/* Toolbar */}
            <div className="flex-none border-b border-[#2A2A3A] bg-[#13131A] px-6 py-3 flex items-center gap-4">
                <ShieldCheck className="h-4 w-4 text-[#A78BFA] shrink-0" />
                <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest shrink-0">Suite</span>

                {/* Suite selector */}
                {suites.length > 0 && (
                    <div className="relative">
                        <select
                            value={activeSuiteId ?? ''}
                            onChange={e => { setActiveSuiteId(e.target.value); setActiveTab('setup') }}
                            className="h-8 pl-3 pr-8 bg-[#1A1A24] border border-[#2A2A3A] rounded-lg text-xs font-semibold text-[#E2E8F0] appearance-none focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/50"
                        >
                            {suites.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="h-3 w-3 text-[#6B7280] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                )}

                {isCreatingSuite ? (
                    <div className="flex items-center gap-2">
                        <Input
                            value={newSuiteName}
                            onChange={e => setNewSuiteName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateSuite(); if (e.key === 'Escape') { setIsCreatingSuite(false); setNewSuiteName('') } }}
                            placeholder="Suite name…"
                            className="h-8 w-48 bg-[#1A1A24] border-[#A78BFA]/30 text-xs text-[#E2E8F0] focus:ring-[#A78BFA]/50"
                            autoFocus
                        />
                        <Button size="sm" className="h-8 bg-[#A78BFA] hover:bg-[#9370EA] text-[#0F0F13] font-bold text-xs px-3" onClick={handleCreateSuite}>
                            Create
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-[#6B7280] text-xs" onClick={() => { setIsCreatingSuite(false); setNewSuiteName('') }}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="ghost" size="sm"
                        className="h-8 text-[10px] font-bold text-[#6B7280] hover:text-[#A78BFA]"
                        onClick={() => setIsCreatingSuite(true)}
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Suite
                    </Button>
                )}

                <div className="ml-auto">
                    <SegmentedControl
                        value={activeTab}
                        onChange={val => setActiveTab(val as PanelTab)}
                        options={[
                            { value: 'setup', label: 'Setup' },
                            { value: 'results', label: 'Results' },
                            { value: 'history', label: 'History' }
                        ]}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {!activeSuite ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
                        <ShieldCheck className="h-12 w-12 text-[#2A2A3A]" />
                        <div className="text-center space-y-1">
                            <p className="text-sm font-semibold text-[#E2E8F0]">No accuracy suites yet</p>
                            <p className="text-xs text-[#6B7280]">Create a suite to start evaluating your AI chatbot's responses.</p>
                        </div>
                        <Button
                            className="bg-[#A78BFA] hover:bg-[#9370EA] text-[#0F0F13] font-bold"
                            onClick={() => setIsCreatingSuite(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Create Suite
                        </Button>
                    </div>
                ) : (
                    <>
                        {activeTab === 'setup' && (
                            <SuiteSetup
                                suite={activeSuite}
                                isEvaluating={isEvaluating}
                                evalProgress={evalProgress}
                                onAddDoc={handleAddDoc}
                                onRemoveDoc={docId => removeAccuracyRefDoc(activeProjectId, activeSuite.id, docId)}
                                onAddPair={async (q, r) => { await addAccuracyQaPair(activeProjectId, activeSuite.id, q, r, 'manual') }}
                                onBatchAddPairs={async (pairs) => { await batchAddAccuracyQaPairs(activeProjectId, activeSuite.id, pairs) }}
                                onRemovePair={pairId => removeAccuracyQaPair(activeProjectId, activeSuite.id, pairId)}
                                onRunEvaluation={handleRunEvaluation}
                            />
                        )}

                        {activeTab === 'results' && (
                            activeRun && activeRun.status === 'completed' ? (
                                <EvalResults run={activeRun} />
                            ) : (
                                <div className="flex-1 flex items-center justify-center p-12">
                                    <div className="text-center space-y-2">
                                        <p className="text-sm font-semibold text-[#E2E8F0]">No completed evaluation</p>
                                        <p className="text-xs text-[#6B7280]">Run an evaluation from the Setup tab.</p>
                                        <Button
                                            variant="outline" size="sm"
                                            className="mt-2 border-[#2A2A3A] text-[#A78BFA]"
                                            onClick={() => setActiveTab('setup')}
                                        >
                                            Go to Setup
                                        </Button>
                                    </div>
                                </div>
                            )
                        )}

                        {activeTab === 'history' && (
                            <EvalRunHistory
                                runs={activeSuite.evalRuns}
                                activeRunId={activeRunId ?? undefined}
                                onSelectRun={run => {
                                    setActiveRunId(run.id)
                                    setActiveTab('results')
                                }}
                                onDeleteRun={runId => {
                                    const updatedRuns = activeSuite.evalRuns.filter(r => r.id !== runId)
                                    updateAccuracySuite(activeProjectId, activeSuite.id, { evalRuns: updatedRuns })
                                    if (activeRunId === runId) setActiveRunId(null)
                                }}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
