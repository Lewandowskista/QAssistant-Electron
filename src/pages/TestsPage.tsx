import { useState, useMemo } from "react"
import { useProjectStore, TestPlan, TestCase, TestCaseStatus } from "@/store/useProjectStore"
import {
    Plus,
    FlaskConical,
    HelpCircle,
    ArrowRightCircle,
    Cpu,
    History,
    Layers,
    User,
    CheckCircle2,
    XCircle,
    Ban,
    FileSpreadsheet,
    FileText,
    Calendar,
    ExternalLink,
    BarChart3,
    LayoutGrid,
    Zap,
    ChevronDown,
    Trash2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import TestPlanDialog from "@/components/TestPlanDialog"
import TestCaseDialog from "@/components/TestCaseDialog"
import TestRunDialog from "@/components/TestRunDialog"
import TestPlanCard from "@/components/TestPlanCard"
import TaskSelectionDialog from "@/components/TaskSelectionDialog"
import FormattedText from "@/components/FormattedText"
import { CsvImportDialog } from "@/components/CsvImportDialog"
import TestRunSessionCard from "@/components/TestRunSessionCard"

type SubTab = 'TestCaseGeneration' | 'TestRuns' | 'Reports' | 'CoverageMatrix' | 'RegressionBuilder'

// Simple Error Boundary for the Test Runs tab to prevent black screens
import React from 'react';
class ErrorBoundary extends React.Component<{ children: React.ReactNode, name: string }, { hasError: boolean, error: Error | null }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl m-6">
                    <h2 className="text-lg font-bold text-[#EF4444] mb-2">Rendering Error in {this.props.name}</h2>
                    <p className="text-sm text-[#EF4444]/80 font-mono whitespace-pre-wrap">{this.state.error?.message}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 border-[#EF4444]/30 text-[#EF4444]"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Try to Recover
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function TestsPage() {
    const api = window.electronAPI as any;
    const {
        projects,
        activeProjectId,
        addTestCase,
        addTestPlan,
        deleteLegacyExecution
    } = useProjectStore()

    const activeProject = projects.find(p => p.id === activeProjectId)
    const testPlans = activeProject?.testPlans || []
    const projectExecutions = activeProject?.testExecutions || []
    const projectRunSessions = [...(activeProject?.testRunSessions || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    const totalRuns = (projectExecutions?.length || 0) + (projectRunSessions?.length || 0)
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('TestCaseGeneration')
    const [isGenerating, setIsGenerating] = useState(false)
    const [showArchived, setShowArchived] = useState(false)
    const [source, setSource] = useState("Linear")
    const [viewMode, setViewMode] = useState("AllPlans")
    const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null)
    const [aiSuggestionsExpanded, setAiSuggestionsExpanded] = useState(false)
    const [regressionBuilderResult, setRegressionBuilderResult] = useState<string | null>(null)
    const [reportType, setReportType] = useState("Summary")
    const [designDocName, setDesignDocName] = useState<string | null>(null)
    const [designDocContent, setDesignDocContent] = useState<string | null>(null)
    const [sourceFilter, setSourceFilter] = useState("All")

    // AI Dialog state
    const [ctxDialogOpen, setCtxDialogOpen] = useState(false)
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])

    // Dialog states
    const [planDialogOpen, setPlanDialogOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<TestPlan | null>(null)
    const [caseDialogOpen, setCaseDialogOpen] = useState(false)
    const [runDialogOpen, setRunDialogOpen] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [editingCase, setEditingCase] = useState<TestCase | null>(null)
    const [activePlanForCase, setActivePlanForCase] = useState<TestPlan | null>(null)

    const filteredPlans = useMemo(() => {
        let result = testPlans.filter(p => showArchived ? p.isArchived : !p.isArchived)
        if (sourceFilter !== "All") {
            result = result.filter(p => p.source?.toLowerCase() === sourceFilter.toLowerCase())
        }
        return result
    }, [testPlans, showArchived, sourceFilter])

    const filteredSessions = useMemo(() => {
        return projectRunSessions.filter(s => s && (showArchived ? s.isArchived : !s.isArchived))
    }, [projectRunSessions, showArchived])

    const handleAiGenerate = async () => {
        if (!activeProjectId) return

        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { alert('Please set your Gemini API key in Settings.'); return }

        const tasksToUse = activeProject?.tasks?.filter(t => selectedTaskIds.includes(t.id)) || []

        if (tasksToUse.length === 0) {
            alert('No context issues selected. Please select issues to generate from.')
            return
        }

        setIsGenerating(true)
        try {
            const cases = await api.aiGenerateCases(apiKey, tasksToUse, source, activeProject, designDocContent || undefined)

            if (cases.length === 0) {
                alert('No test cases could be generated.')
                return
            }

            // Create a new test plan for this generation patch like the original repository
            const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            const newPlanName = `Regression: ${source} \u00B7 ${tasksToUse.length} Issues \u00B7 ${timestamp}`
            const newPlanId = await addTestPlan(activeProjectId, newPlanName, `Auto-generated from ${tasksToUse.length} ${source} issue(s) using Gemini.`)

            for (const c of cases) {
                await addTestCase(activeProjectId, newPlanId, {
                    title: c.title,
                    displayId: c.testCaseId, // Align with displayId from AI
                    preConditions: c.preConditions || '',
                    steps: c.steps || c.testSteps || '',
                    testData: c.testData || '',
                    expectedResult: c.expectedResult || '',
                    priority: (c.priority || 'medium').toLowerCase() as any,
                    sourceIssueId: c.sourceIssueId || '',
                    sapModule: c.sapModule,
                    status: 'not-run'
                })
            }
            alert(`Generated ${cases.length} test cases successfully in "${newPlanName}"`)
        } catch (e: any) {
            alert(`AI Generation failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleLoadDesignDoc = async () => {
        try {
            const filePath = await api.selectFile()
            if (!filePath) return
            const content = await api.readCsvFile(filePath) // reuse read functionality to load text file string
            const name = filePath.split(/[/\\]/).pop() || 'Unknown Document'
            setDesignDocName(name)
            setDesignDocContent(content)
            alert(`Loaded Design Document: ${name}`)
        } catch (e: any) {
            alert(`Failed to load design document: ${e.message}`)
        }
    }

    const handleImportCsv = () => {
        setImportDialogOpen(true)
    }

    const handleImportedData = async (cases: Partial<TestCase>[]) => {
        if (!activeProjectId) return
        try {
            const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            const planId = await addTestPlan(activeProjectId, `Imported Cases \u00B7 ${timestamp}`, `Bulk imported ${cases.length} test case(s).`)

            for (const c of cases) {
                await addTestCase(activeProjectId, planId, c as any)
            }
            alert(`Successfully imported ${cases.length} test cases!`)
        } catch (e: any) {
            alert(`Import failed: ${e.message}`)
        }
    }

    const handleAiCriticality = async () => {
        if (!activeProject) return
        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { alert('Please set your Gemini API key in Settings.'); return }
        setIsGenerating(true)
        try {
            const result = await api.aiCriticality(apiKey, activeProject.tasks || [], testPlans, projectExecutions, activeProject)
            setAiAnalysisResult(result)
        } catch (e: any) {
            alert(`Criticality assessment failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleAiTestRunSuggestions = async () => {
        if (!activeProject) return
        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { alert('Please set your Gemini API key in Settings.'); return }
        setIsGenerating(true)
        try {
            const result = await api.aiTestRunSuggestions(apiKey, testPlans, projectExecutions, activeProject)
            setAiAnalysisResult(result)
        } catch (e: any) {
            alert(`Test run suggestions failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleExport = async () => {
        if (!activeProject) return
        setIsGenerating(true)
        try {
            let content = ''
            let filename = ''
            if (reportType === 'Summary') {
                content = await api.generateTestSummaryMarkdown(activeProject, undefined, aiAnalysisResult || undefined)
                filename = `${activeProject.name.replace(/\s+/g, '-')}-test-summary.md`
            } else if (reportType === 'TestCasesCsv') {
                content = await api.generateTestCasesCsv(activeProject)
                filename = `${activeProject.name.replace(/\s+/g, '-')}-test-cases.csv`
            } else if (reportType === 'ExecutionsCsv') {
                content = await api.generateExecutionsCsv(activeProject)
                filename = `${activeProject.name.replace(/\s+/g, '-')}-executions.csv`
            }
            if (content) await api.saveFileDialog(filename, content)
        } catch (e: any) {
            alert(`Export failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const getStatusIcon = (status: TestCaseStatus) => {
        switch (status) {
            case 'passed': return <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
            case 'failed': return <XCircle className="h-4 w-4 text-[#EF4444]" />
            case 'blocked': return <Ban className="h-4 w-4 text-[#F59E0B]" />
            case 'skipped': return <ArrowRightCircle className="h-4 w-4 text-[#6B7280]" />
            default: return <HelpCircle className="h-4 w-4 text-[#9CA3AF]" />
        }
    }

    return (
        <>
            <div className="h-full flex flex-col animate-in fade-in duration-500 overflow-hidden bg-[#0F0F13]">
                {/* Primary Sub-Navigation */}
                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-2">
                    <div className="flex items-center gap-2">
                        {[
                            { id: 'TestCaseGeneration', label: 'Test Case Generation' },
                            { id: 'TestRuns', label: 'Test Runs' },
                            { id: 'Reports', label: 'Reports' },
                            { id: 'CoverageMatrix', label: 'Coverage Matrix' },
                            { id: 'RegressionBuilder', label: 'Regression Builder' }
                        ].map(tab => (
                            <Button
                                key={tab.id}
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveSubTab(tab.id as SubTab)}
                                className={cn(
                                    "h-9 px-4 text-[11px] font-bold tracking-tight transition-all rounded-lg",
                                    activeSubTab === tab.id
                                        ? "bg-[#2A2A3A] text-[#A78BFA] shadow-sm border border-[#A78BFA]/10"
                                        : "text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#1A1A24]"
                                )}
                            >
                                {tab.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Sub-tab Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                    {activeSubTab === 'TestCaseGeneration' && (
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Primary Toolbar */}
                            <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">Source</span>
                                        <Select value={source} onValueChange={setSource}>
                                            <SelectTrigger className="h-9 w-32 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0] focus:ring-[#A78BFA]/20">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                                <SelectItem value="Linear">Linear</SelectItem>
                                                <SelectItem value="Jira">Jira</SelectItem>
                                                <SelectItem value="Manual">Manual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={() => setCtxDialogOpen(true)} variant="outline" className="h-9 px-4 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0] gap-2">
                                            <FileText className="h-4 w-4" />
                                            {selectedTaskIds.length > 0 ? `${selectedTaskIds.length} SELECTED` : 'SELECT CONTEXT'}
                                        </Button>
                                        <Button onClick={handleAiGenerate} disabled={isGenerating || selectedTaskIds.length === 0} className="h-9 px-4 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold text-xs gap-2">
                                            <Cpu className="h-4 w-4" /> {isGenerating ? 'GENERATING...' : 'GENERATE TEST CASES'}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">View</span>
                                        <Select value={viewMode} onValueChange={setViewMode}>
                                            <SelectTrigger className="h-9 w-40 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0] focus:ring-[#A78BFA]/20">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                                <SelectItem value="AllPlans">All Plans</SelectItem>
                                                <SelectItem value="RegressionSuites">Regression Suites</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="archived-toggle" checked={showArchived} onCheckedChange={val => setShowArchived(!!val)} />
                                        <span className="text-xs font-bold text-[#6B7280]">Archived</span>
                                    </div>
                                    <div className="text-xs font-bold text-[#6B7280] bg-[#1A1A24] px-2 py-1 rounded border border-[#2A2A3A]">
                                        {testPlans.length} PLANS
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Toolbar */}
                            <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-2 flex items-center gap-4">
                                <div className="flex items-center gap-2 border-r border-[#2A2A3A] pr-4">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Filter</span>
                                    {['All', 'Jira', 'Linear', 'Manual'].map(f => (
                                        <Button
                                            key={f}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSourceFilter(f)}
                                            className={cn(
                                                "h-7 px-2 text-[10px] font-bold",
                                                sourceFilter === f ? "text-[#A78BFA] bg-[#A78BFA]/5" : "text-[#6B7280]"
                                            )}
                                        >
                                            {f}
                                        </Button>
                                    ))}
                                </div>
                                <Button variant="ghost" size="sm" onClick={handleImportCsv} className="h-8 text-[11px] font-bold text-[#6B7280] hover:text-[#E2E8F0] gap-2">
                                    <FileSpreadsheet className="h-3.5 w-3.5" /> Import CSV
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => { setEditingPlan(null); setPlanDialogOpen(true); }} className="h-8 text-[11px] font-bold text-[#6B7280] hover:text-[#E2E8F0] gap-2">
                                    <Plus className="h-3.5 w-3.5" /> New Plan
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleLoadDesignDoc} className="h-8 text-[11px] font-bold text-[#6B7280] hover:text-[#E2E8F0] gap-2" title={designDocName || 'Load Design Document Text'}>
                                    <FileText className={cn("h-3.5 w-3.5", designDocName ? "text-[#10B981]" : "")} /> {designDocName ? 'Doc Loaded' : 'Design Doc'}
                                    {designDocName && (
                                        <XCircle
                                            className="h-3 w-3 ml-1 hover:text-[#EF4444]"
                                            onClick={(e) => { e.stopPropagation(); setDesignDocName(null); setDesignDocContent(null); }}
                                        />
                                    )}
                                </Button>
                            </div>

                            {/* Content Area */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                {filteredPlans.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-30">
                                        <Layers className="h-16 w-16 mb-4" />
                                        <h3 className="text-lg font-bold">No test plans yet</h3>
                                        <p className="text-sm max-w-sm">Select a source and click Generate to create test cases organized into a test plan.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4 max-w-5xl mx-auto">
                                        {filteredPlans.map(plan => (
                                            <TestPlanCard
                                                key={plan.id}
                                                plan={plan}
                                                activeProjectId={activeProjectId!}
                                                onEditCases={(p) => {
                                                    setActivePlanForCase(p);
                                                    setEditingCase(null);
                                                    setCaseDialogOpen(true);
                                                }}
                                                onRunCases={(p) => {
                                                    setActivePlanForCase(p);
                                                    setRunDialogOpen(true);
                                                }}
                                                onEditPlan={(p) => {
                                                    setEditingPlan(p);
                                                    setPlanDialogOpen(true);
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Busy Overlay */}
                            {
                                isGenerating && (
                                    <div className="absolute inset-0 z-50 bg-[#0F0F13]/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                                        <div className="space-y-6">
                                            <div className="relative">
                                                <div className="h-16 w-16 rounded-full border-t-2 border-l-2 border-[#A78BFA] animate-spin" />
                                                <FlaskConical className="h-8 w-8 text-[#A78BFA] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                            </div>
                                            <div className="space-y-2">
                                                <h2 className="text-xl font-black text-[#E2E8F0]">Generating test cases via Gemini...</h2>
                                                <p className="text-sm text-[#6B7280]">Building regression suite through test analysis.</p>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }
                        </div >
                    )
                    }

                    {
                        activeSubTab === 'TestRuns' && (
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">Execution History</span>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={showArchived}
                                                onCheckedChange={(val) => setShowArchived(!!val)}
                                            />
                                            <span className="text-xs font-bold text-[#6B7280]">Show Archived</span>
                                        </div>
                                        <div className="text-xs font-bold text-[#6B7280] bg-[#1A1A24] px-2 py-1 rounded border border-[#2A2A3A]">
                                            {totalRuns} RUNS
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                    <ErrorBoundary name="Test Runs Tab">
                                        <>
                                            {totalRuns === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-30">
                                                    <History className="h-16 w-16 mb-4" />
                                                    <h3 className="text-lg font-bold">No test executions yet</h3>
                                                    <p className="text-sm max-w-sm">Execute test cases from the Test Case Generation tab to see history here.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-6">
                                                    {/* New Hierarchical Sessions */}
                                                    {filteredSessions.map(session => (
                                                        <TestRunSessionCard
                                                            key={session.id}
                                                            session={session}
                                                            activeProjectId={activeProjectId!}
                                                        />
                                                    ))}

                                                    {/* Legacy Executions */}
                                                    {projectExecutions.length > 0 && (
                                                        <div className="mt-8 border-t border-[#2A2A3A] pt-4">
                                                            <h4 className="text-xs font-bold text-[#6B7280] uppercase mb-4 tracking-widest pl-2">Legacy Executions</h4>
                                                            <div className="space-y-4">
                                                                {[...projectExecutions].sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0)).map(ex => (
                                                                    <div key={ex.id} className="bg-[#1A1A24] border-l-4 border-[#2A2A3A] rounded-r-xl p-4 flex items-center justify-between transition-all hover:bg-[#1E1E2A]"
                                                                        style={{ borderLeftColor: ex.result === 'passed' ? '#10B981' : ex.result === 'failed' ? '#EF4444' : '#F59E0B' }}>
                                                                        <div className="flex items-center gap-4">
                                                                            <div className={cn("p-2 rounded-lg",
                                                                                ex.result === 'passed' ? "bg-[#10B981]/10 text-[#10B981]" :
                                                                                    ex.result === 'failed' ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#F59E0B]/10 text-[#F59E0B]"
                                                                            )}>
                                                                                {getStatusIcon(ex.result as TestCaseStatus)}
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm font-bold text-[#E2E8F0]">{ex.snapshotTestCaseTitle}</p>
                                                                                <div className="flex items-center gap-3 mt-1">
                                                                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase opacity-60 flex items-center gap-1">
                                                                                        <Calendar className="h-3 w-3" /> {new Date(ex.executedAt).toLocaleString()}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase opacity-60 flex items-center gap-1">
                                                                                        <User className="h-3 w-3" /> Manual execution
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {ex.actualResult && <div className="text-xs font-bold text-[#6B7280] italic px-4 border-r border-[#2A2A3A] max-w-md line-clamp-2"><FormattedText content={ex.actualResult} /></div>}
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-8 w-8 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                                                                onClick={() => deleteLegacyExecution(activeProjectId!, ex.id)}
                                                                                title="Delete legacy execution"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B7280]">
                                                                                <ExternalLink className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* AI Suggestions (Criticality & Readiness) expandable block */}
                                            {totalRuns > 0 && (
                                                <div className="mt-8 bg-[#13131A] border border-[#2A2A3A] rounded-xl overflow-hidden">
                                                    <button
                                                        className="w-full flex items-center justify-between p-4 hover:bg-[#1A1A24] transition-colors"
                                                        onClick={() => setAiSuggestionsExpanded(!aiSuggestionsExpanded)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Cpu className="h-4 w-4 text-[#FBBF24]" />
                                                            <span className="text-[13px] font-bold text-[#E2E8F0] tracking-wide">AI Suggestions</span>
                                                        </div>
                                                        <ChevronDown className={cn("h-4 w-4 text-[#6B7280] transition-transform duration-200", aiSuggestionsExpanded && "rotate-180")} />
                                                    </button>

                                                    {aiSuggestionsExpanded && (
                                                        <div className="p-4 border-t border-[#2A2A3A] bg-[#0F0F13] flex flex-col gap-4">
                                                            <div className="flex gap-4">
                                                                <Button
                                                                    className="flex-1 h-9 bg-[#252535] hover:bg-[#2A2A3A] border border-[#2A2A3A] text-[#FBBF24] font-bold text-xs gap-2 transition-all"
                                                                    disabled={isGenerating}
                                                                    onClick={handleAiCriticality}
                                                                >
                                                                    <Cpu className="h-3.5 w-3.5" />
                                                                    {isGenerating ? 'ANALYZING...' : 'GET CRITICALITY ASSESSMENT'}
                                                                </Button>
                                                                <Button
                                                                    className="flex-1 h-9 bg-[#252535] hover:bg-[#2A2A3A] border border-[#2A2A3A] text-[#A78BFA] font-bold text-xs gap-2 transition-all"
                                                                    disabled={isGenerating}
                                                                    onClick={handleAiTestRunSuggestions}
                                                                >
                                                                    <BarChart3 className="h-3.5 w-3.5" />
                                                                    {isGenerating ? 'ANALYZING...' : 'GET TEST RUN SUGGESTIONS'}
                                                                </Button>
                                                            </div>

                                                            {aiAnalysisResult && (
                                                                <div className="bg-[#1A1A24] border border-[#FBBF24]/20 rounded-lg p-4 mt-2">
                                                                    <div className="text-xs text-[#E2E8F0] leading-relaxed whitespace-pre-wrap font-mono relative">
                                                                        {aiAnalysisResult}
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 mt-4 text-[10px] uppercase font-bold text-[#6B7280] hover:text-[#EF4444]"
                                                                        onClick={() => setAiAnalysisResult(null)}
                                                                    >
                                                                        Clear Output
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    </ErrorBoundary>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeSubTab === 'Reports' && (
                            <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F13]">
                                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">Report</span>
                                            <Select value={reportType} onValueChange={setReportType}>
                                                <SelectTrigger className="h-9 w-48 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                                    <SelectItem value="Summary">Test Summary (Markdown)</SelectItem>
                                                    <SelectItem value="TestCasesCsv">Test Cases (CSV)</SelectItem>
                                                    <SelectItem value="ExecutionsCsv">Execution History (CSV)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            className="h-9 px-4 bg-[#A78BFA] text-[#0F0F13] font-bold text-xs"
                                            onClick={handleExport}
                                            disabled={isGenerating || !activeProject}
                                        >
                                            {isGenerating ? 'Exporting...' : 'EXPORT'}
                                        </Button>
                                    </div>
                                </div>
                                {/* AI Reports content */}
                                {aiAnalysisResult ? (
                                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                        <div className="bg-[#1A1A24] border border-[#2A2A3A] rounded-2xl p-6 text-sm text-[#C4B5FD] leading-relaxed whitespace-pre-wrap font-mono">
                                            {aiAnalysisResult}
                                        </div>
                                        <Button
                                            className="mt-4 h-9 px-4 bg-transparent border border-[#2A2A3A] text-[#6B7280] font-bold text-xs"
                                            onClick={() => setAiAnalysisResult(null)}
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col p-8 gap-6">
                                        {/* Quick stats */}
                                        {(() => {
                                            const allCases = testPlans.flatMap(tp => tp.testCases || [])
                                            const passed = allCases.filter(tc => tc.status === 'passed').length
                                            const failed = allCases.filter(tc => tc.status === 'failed').length
                                            const blocked = allCases.filter(tc => tc.status === 'blocked').length
                                            const total = allCases.length
                                            const passRate = total > 0 ? Math.round(passed / total * 100) : 0
                                            return (
                                                <div className="grid grid-cols-5 gap-4">
                                                    {[
                                                        { label: 'Total', value: total, color: 'text-[#E2E8F0]' },
                                                        { label: 'Passed', value: passed, color: 'text-[#10B981]' },
                                                        { label: 'Failed', value: failed, color: 'text-[#EF4444]' },
                                                        { label: 'Blocked', value: blocked, color: 'text-[#F59E0B]' },
                                                        { label: 'Pass Rate', value: `${passRate}%`, color: passRate >= 80 ? 'text-[#10B981]' : passRate >= 60 ? 'text-[#F59E0B]' : 'text-[#EF4444]' },
                                                    ].map(stat => (
                                                        <div key={stat.label} className="bg-[#1A1A24] border border-[#2A2A3A] rounded-2xl p-5">
                                                            <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                                                            <div className="text-[10px] text-[#6B7280] font-bold uppercase tracking-widest mt-1">{stat.label}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })()}
                                        {testPlans.length > 0 && (
                                            <div className="space-y-3">
                                                <div className="text-[10px] font-black uppercase text-[#6B7280] tracking-widest">Per Plan Breakdown</div>
                                                {testPlans.filter(tp => !tp.isArchived).map(tp => {
                                                    const tcs = tp.testCases || []
                                                    const p = tcs.filter(tc => tc.status === 'passed').length
                                                    const f = tcs.filter(tc => tc.status === 'failed').length
                                                    const t = tcs.length
                                                    const r = t > 0 ? Math.round(p / t * 100) : 0
                                                    return (
                                                        <div key={tp.id} className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-4 flex items-center gap-4">
                                                            <div className="flex-1">
                                                                <div className="text-sm font-bold text-[#E2E8F0]">{tp.name}</div>
                                                                <div className="text-[10px] text-[#6B7280] mt-0.5">{t} cases · {p} passed · {f} failed</div>
                                                            </div>
                                                            <div className={`text-lg font-black ${r >= 80 ? 'text-[#10B981]' : r >= 60 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>{r}%</div>
                                                            <div className="w-24 h-2 bg-[#2A2A3A] rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full ${r >= 80 ? 'bg-[#10B981]' : r >= 60 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'}`} style={{ width: `${r}%` }} />
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    }

                    {
                        activeSubTab === 'CoverageMatrix' && (
                            <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F13]">
                                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center gap-6">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">View</span>
                                    <div className="flex bg-[#1A1A24] p-1 rounded-lg border border-[#2A2A3A]">
                                        <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-bold bg-[#A78BFA]/10 text-[#A78BFA]">By Issue</Button>
                                        <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-bold text-[#6B7280]">By SAP Module</Button>
                                    </div>
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center p-20 opacity-30">
                                    <LayoutGrid className="h-16 w-16 mb-4" />
                                    <h3 className="text-lg font-bold">No mapping data available</h3>
                                    <p className="text-sm max-w-sm">Map your test scenarios to Linear/Jira issues to visualize coverage depth.</p>
                                </div>
                            </div>
                        )
                    }

                    {
                        activeSubTab === 'RegressionBuilder' && (
                            <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F13]">
                                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">From</span>
                                            <Input type="date" className="h-9 w-40 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0]" />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">To</span>
                                            <Input type="date" className="h-9 w-40 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0]" />
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-9 text-[11px] font-bold text-[#6B7280]">Clear</Button>
                                    </div>
                                    <Button
                                        className="h-9 px-4 bg-[#A78BFA] text-[#0F0F13] font-bold text-xs gap-2"
                                        disabled={isGenerating}
                                        onClick={async () => {
                                            if (!activeProject) return
                                            const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
                                            if (!apiKey) { alert('Please set your Gemini API key in Settings.'); return }
                                            const allCases = testPlans.flatMap(tp => tp.testCases || [])
                                            const doneTasks = (activeProject.tasks || []).filter((t: any) => t.status === 'done')
                                            setIsGenerating(true)
                                            try {
                                                const ids = await api.aiSmokeSubset(apiKey, allCases, doneTasks, activeProject)
                                                if (ids && ids.length > 0) {
                                                    setRegressionBuilderResult(`AI recommended ${ids.length} test cases for a smoke suite:\n\n${ids.join('\n')}`)
                                                } else {
                                                    setRegressionBuilderResult(`No specific smoke tests could be confidently identified.`)
                                                }
                                            } catch (e: any) {
                                                setRegressionBuilderResult(`Failed: ${e.message}`)
                                            } finally {
                                                setIsGenerating(false)
                                            }
                                        }}
                                    >
                                        <Cpu className="h-3.5 w-3.5" />
                                        {isGenerating ? 'BUILDING...' : 'BUILD SMOKE SUITE WITH AI'}
                                    </Button>
                                </div>
                                {regressionBuilderResult ? (
                                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                        <div className="bg-[#1A1A24] border border-[#2A2A3A] border-l-4 border-l-[#A78BFA] rounded-r-xl p-6 text-sm text-[#E2E8F0] leading-relaxed whitespace-pre-wrap font-mono">
                                            {regressionBuilderResult}
                                        </div>
                                        <Button
                                            className="mt-6 h-9 px-4 bg-transparent border border-[#2A2A3A] text-[#6B7280] hover:text-[#EF4444] font-bold text-xs transition-all"
                                            onClick={() => setRegressionBuilderResult(null)}
                                        >
                                            CLEAR
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center p-20 opacity-30">
                                        <Zap className="h-16 w-16 mb-4" />
                                        <h3 className="text-lg font-bold">Regression builder</h3>
                                        <p className="text-sm max-w-sm">Click "Build Smoke Suite with AI" to produce a targeted subset from your test library based on recent issues and completion history.</p>
                                    </div>
                                )}
                            </div>
                        )
                    }
                </div >

                <TestPlanDialog
                    open={planDialogOpen}
                    onOpenChange={setPlanDialogOpen}
                    editingPlan={editingPlan}
                />
                <TestCaseDialog
                    open={caseDialogOpen}
                    onOpenChange={setCaseDialogOpen}
                    activePlan={activePlanForCase}
                    editingCase={editingCase}
                />
                <TestRunDialog
                    open={runDialogOpen}
                    onOpenChange={setRunDialogOpen}
                    activePlan={activePlanForCase}
                />
                <TaskSelectionDialog
                    open={ctxDialogOpen}
                    onOpenChange={setCtxDialogOpen}
                    selectedTaskIds={selectedTaskIds}
                    onSelectionChange={setSelectedTaskIds}
                    sourceFilter={source}
                />
                <CsvImportDialog
                    open={importDialogOpen}
                    onOpenChange={setImportDialogOpen}
                    onImport={handleImportedData}
                />
            </div >
        </>
    )
}
