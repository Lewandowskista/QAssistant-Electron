import { useState, useMemo } from "react"
import { useProjectStore } from "@/store/useProjectStore"
import { TestPlan, TestCase, TestCaseStatus } from "@/types/project"
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
    Zap,
    ChevronDown,
    Trash2,
    Archive,
    Search,
    RotateCcw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import SingleTestRunDialog from "@/components/SingleTestRunDialog"
import TestPlanCard from "@/components/TestPlanCard"
import TaskSelectionDialog from "@/components/TaskSelectionDialog"
import FormattedText from "@/components/FormattedText"
import { CsvImportDialog } from "@/components/CsvImportDialog"
import TestRunSessionCard from "@/components/TestRunSessionCard"
import CoverageMatrix from "@/components/CoverageMatrix"
import { toast } from "sonner"

type SubTab = 'TestCaseGeneration' | 'TestRuns' | 'Reports' | 'CoverageMatrix' | 'RegressionBuilder'

import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function TestsPage() {
    const api = window.electronAPI as any;
    const {
        projects,
        activeProjectId,
        addTestCase,
        addTestPlan,
        batchAddTestCasesToPlan,
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
    const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null)
    const [aiSuggestionsExpanded, setAiSuggestionsExpanded] = useState(false)
    const [reportType, setReportType] = useState("Summary")
    const [designDocName, setDesignDocName] = useState<string | null>(null)
    const [designDocContent, setDesignDocContent] = useState<string | null>(null)
    const [sourceFilter, setSourceFilter] = useState("All")
    const [planSearchQuery, setPlanSearchQuery] = useState("")

    // AI Dialog state
    const [ctxDialogOpen, setCtxDialogOpen] = useState(false)
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])

    // Dialog states
    const [planDialogOpen, setPlanDialogOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<TestPlan | null>(null)
    const [caseDialogOpen, setCaseDialogOpen] = useState(false)
    const [runDialogOpen, setRunDialogOpen] = useState(false)
    const [singleRunDialogOpen, setSingleRunDialogOpen] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [editingCase, setEditingCase] = useState<TestCase | null>(null)
    const [activePlanForCase, setActivePlanForCase] = useState<TestPlan | null>(null)
    const [activeCaseForRun, setActiveCaseForRun] = useState<TestCase | null>(null)

    // Regression Builder States
    const [regressionFromDate, setRegressionFromDate] = useState<string>("")
    const [regressionToDate, setRegressionToDate] = useState<string>("")
    const [smokeSubsetCaseIds, setSmokeSubsetCaseIds] = useState<string[]>([])
    const [builderStatus, setBuilderStatus] = useState<string | null>(null)

    const doneLinkedTestCases = useMemo(() => {
        if (!activeProject) return []
        const doneTasks = activeProject.tasks.filter(t => t.status === 'done')
        const filteredTasks = doneTasks.filter(t => {
            const taskDate = t.dueDate || t.updatedAt;
            if (regressionFromDate && taskDate && new Date(taskDate) < new Date(regressionFromDate)) return false
            if (regressionToDate && taskDate && new Date(taskDate) > new Date(regressionToDate)) return false
            return true
        })
        const doneKeys = new Set(filteredTasks.flatMap(t => [t.sourceIssueId, t.externalId, t.id]).filter(Boolean))
        const cases = activeProject.testPlans.flatMap(tp => tp.testCases || []).filter(tc => tc.sourceIssueId && doneKeys.has(tc.sourceIssueId))
        
        // Deduplicate by case ID in case they appear in multiple plans
        const seen = new Set<string>()
        return cases.filter(c => {
            if (seen.has(c.id)) return false
            seen.add(c.id)
            return true
        })
    }, [activeProject, regressionFromDate, regressionToDate])

    const previouslyFailedTestCases = useMemo(() => {
        if (!activeProject) return []
        const latestSessionWithFailures = projectRunSessions.find(s => 
            s.planExecutions.some(pe => pe.caseExecutions.some(ce => ce.result === 'failed'))
        )
        if (!latestSessionWithFailures) return []
        
        const failedCaseIds = new Set<string>()
        latestSessionWithFailures.planExecutions.forEach(pe => {
            pe.caseExecutions.forEach(ce => {
                if (ce.result === 'failed') failedCaseIds.add(ce.testCaseId)
            })
        })
        
        const cases = activeProject.testPlans.flatMap(tp => tp.testCases || []).filter(tc => failedCaseIds.has(tc.id))
        const seen = new Set<string>()
        return cases.filter(c => {
            if (seen.has(c.id)) return false
            seen.add(c.id)
            return true
        })
    }, [activeProject, projectRunSessions])

    const smokeSubsetTestCases = useMemo(() => {
        if (!activeProject || smokeSubsetCaseIds.length === 0) return []
        const idSet = new Set(smokeSubsetCaseIds)
        const cases = activeProject.testPlans.flatMap(tp => tp.testCases || []).filter(tc => idSet.has(tc.displayId) || idSet.has(tc.id))
        const seen = new Set<string>()
        return cases.filter(c => {
            if (seen.has(c.id)) return false
            seen.add(c.id)
            return true
        })
    }, [activeProject, smokeSubsetCaseIds])

    const uniqueSelectedCases = useMemo(() => {
        const all = [...doneLinkedTestCases, ...previouslyFailedTestCases, ...smokeSubsetTestCases]
        const seen = new Set<string>()
        const unique: TestCase[] = []
        for (const tc of all) {
            if (!seen.has(tc.id)) {
                seen.add(tc.id)
                unique.push(tc)
            }
        }
        return unique
    }, [doneLinkedTestCases, previouslyFailedTestCases, smokeSubsetTestCases])

    const handleBuildRegressionSuite = async () => {
        if (!activeProject || uniqueSelectedCases.length === 0) return

        const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const name = `Regression Suite \u00B7 ${timestamp}`
        
        const parts = []
        if (doneLinkedTestCases.length > 0) parts.push(`${doneLinkedTestCases.length} done-linked`)
        if (previouslyFailedTestCases.length > 0) parts.push(`${previouslyFailedTestCases.length} previously failed`)
        if (smokeSubsetTestCases.length > 0) parts.push(`${smokeSubsetTestCases.length} AI smoke`)
        const description = `Regression suite: ${parts.join(', ')} \u2192 ${uniqueSelectedCases.length} unique test case(s).`

        setIsGenerating(true)
        try {
            const planId = await addTestPlan(activeProjectId!, name, description, true, 'manual')
            await batchAddTestCasesToPlan(activeProjectId!, planId, uniqueSelectedCases.map(tc => ({
                title: tc.title,
                preConditions: tc.preConditions,
                steps: tc.steps,
                testData: tc.testData,
                expectedResult: tc.expectedResult,
                actualResult: "",
                priority: tc.priority,
                status: 'not-run',
                sapModule: tc.sapModule,
                sourceIssueId: tc.sourceIssueId
            })))

            toast.success(`Built "${name}" with ${uniqueSelectedCases.length} cases.`)
            setBuilderStatus(`Successfully built ${name} with ${uniqueSelectedCases.length} cases.`)
            setTimeout(() => setBuilderStatus(null), 5000)
            setActiveSubTab('TestCaseGeneration')
        } catch (e: any) {
            toast.error(`Build failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleGenerateSmokeSubset = async () => {
        if (!activeProject) return
        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { toast.error('Please set your Gemini API key in Settings.'); return }
        
        const allCases = activeProject.testPlans.flatMap(tp => tp.testCases || [])
        const doneTasks = activeProject.tasks.filter(t => t.status === 'done')
        
        setIsGenerating(true)
        try {
            const sanitizedProject = activeProject ? { 
                name: activeProject.name,
                description: activeProject.description, 
                environments: activeProject.environments, 
                testPlans: activeProject.testPlans?.map(tp => ({ ...tp, testCases: undefined })),
                testDataGroups: activeProject.testDataGroups?.map(tdg => ({ name: tdg.name, category: tdg.category })),
                checklists: activeProject.checklists?.map(cl => ({ name: cl.name, category: cl.category })) 
            } : undefined;

            const ids = await api.aiSmokeSubset({ apiKey, candidates: allCases, doneTasks, project: sanitizedProject, modelName: activeProject.geminiModel })
            setSmokeSubsetCaseIds(ids || [])
            if (!ids || ids.length === 0) {
                toast.info('No specific smoke tests could be confidently identified.')
            }
        } catch (e: any) {
            toast.error(`AI Analysis failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const filteredPlans = useMemo(() => {
        let result = testPlans.filter(p => showArchived ? p.isArchived : !p.isArchived)
        if (sourceFilter !== "All") {
            result = result.filter(p => p.source?.toLowerCase() === sourceFilter.toLowerCase())
        }
        if (planSearchQuery.trim()) {
            const q = planSearchQuery.toLowerCase()
            result = result.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.testCases?.some(tc => tc.title.toLowerCase().includes(q) || tc.displayId?.toLowerCase().includes(q))
            )
        }
        return result
    }, [testPlans, showArchived, sourceFilter, planSearchQuery])

    const filteredSessions = useMemo(() => {
        return projectRunSessions.filter(s => s && (showArchived ? s.isArchived : !s.isArchived))
    }, [projectRunSessions, showArchived])

    const handleAiGenerate = async () => {
        if (!activeProjectId) return

        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { toast.error('Please set your Gemini API key in Settings.'); return }

        const tasksToUse = activeProject?.tasks?.filter(t => selectedTaskIds.includes(t.id)) || []

        if (tasksToUse.length === 0) {
            toast.warning('No context issues selected. Please select issues to generate from.')
            return
        }

        setIsGenerating(true)
        try {
            // Strip out massive unstructured objects from project before sending it over IPC
            // The IPC bridge uses structured cloning which crashes deeply nested/circular json arrays.
            const sanitizedProject = activeProject ? { 
                name: activeProject.name,
                description: activeProject.description, 
                environments: activeProject.environments, 
                testPlans: activeProject.testPlans?.map(tp => ({ ...tp, testCases: undefined })), // We only need plan metadata, not cases
                testDataGroups: activeProject.testDataGroups?.map(tdg => ({ name: tdg.name, category: tdg.category })),
                checklists: activeProject.checklists?.map(cl => ({ name: cl.name, category: cl.category })) 
            } : undefined;

            const sanitizedTasks = tasksToUse.map(t => ({
                id: t.id,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                issueType: t.issueType,
                labels: t.labels,
                sourceIssueId: t.sourceIssueId,
                externalId: t.externalId
            }));

            const cases = await api.aiGenerateCases({ apiKey, tasks: sanitizedTasks, sourceName: source, project: sanitizedProject, designDoc: designDocContent || undefined, modelName: activeProject?.geminiModel })

            if (cases.length === 0) {
                toast.warning('No test cases could be generated.')
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
            toast.success(`Generated ${cases.length} test cases in "${newPlanName}"`)
        } catch (e: any) {
            toast.error(`AI Generation failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleLoadDesignDoc = async () => {
        try {
            const filePath = await api.selectFile()
            if (!filePath) return
            const content = await api.readCsvFile({ filePath }) // reuse read functionality to load text file string
            const name = filePath.split(/[/\\]/).pop() || 'Unknown Document'
            setDesignDocName(name)
            setDesignDocContent(content)
            toast.success(`Loaded Design Document: ${name}`)
        } catch (e: any) {
            toast.error(`Failed to load design document: ${e.message}`)
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
            toast.success(`Imported ${cases.length} test cases successfully.`)
        } catch (e: any) {
            toast.error(`Import failed: ${e.message}`)
        }
    }

    const handleAiCriticality = async () => {
        if (!activeProject) return
        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { toast.error('Please set your Gemini API key in Settings.'); return }
        setIsGenerating(true)
        try {
            const sanitizedProject = activeProject ? { 
                name: activeProject.name,
                description: activeProject.description, 
                environments: activeProject.environments, 
                testPlans: activeProject.testPlans?.map(tp => ({ ...tp, testCases: undefined })),
                testDataGroups: activeProject.testDataGroups?.map(tdg => ({ name: tdg.name, category: tdg.category })),
                checklists: activeProject.checklists?.map(cl => ({ name: cl.name, category: cl.category })) 
            } : undefined;

            const result = await api.aiCriticality({ apiKey, tasks: activeProject?.tasks || [], testPlans, executions: projectExecutions, project: sanitizedProject, modelName: activeProject?.geminiModel })
            setAiAnalysisResult(result)
        } catch (e: any) {
            toast.error(`Criticality assessment failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleAiTestRunSuggestions = async () => {
        if (!activeProject) return
        const apiKey = await api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`) || await api.secureStoreGet('gemini_api_key')
        if (!apiKey) { toast.error('Please set your Gemini API key in Settings.'); return }
        setIsGenerating(true)
        try {
            const sanitizedProject = activeProject ? { 
                name: activeProject.name,
                description: activeProject.description, 
                environments: activeProject.environments, 
                testPlans: activeProject.testPlans?.map(tp => ({ ...tp, testCases: undefined })),
                testDataGroups: activeProject.testDataGroups?.map(tdg => ({ name: tdg.name, category: tdg.category })),
                checklists: activeProject.checklists?.map(cl => ({ name: cl.name, category: cl.category })) 
            } : undefined;

            const result = await api.aiTestRunSuggestions({ apiKey, testPlans, executions: projectExecutions, project: sanitizedProject, modelName: activeProject?.geminiModel })
            setAiAnalysisResult(result)
        } catch (e: any) {
            toast.error(`Test run suggestions failed: ${e.message}`)
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
            if (reportType === 'SummaryPdf') {
                const res = await api.exportTestSummaryPdf({ project: activeProject, filterPlanIds: undefined, aiResult: aiAnalysisResult || undefined })
                if (res && res.success) {
                    toast.success(`PDF exported to: ${res.path}`)
                } else if (res && res.error) {
                    throw new Error(res.error)
                }
            } else if (reportType === 'Summary') {
                content = await api.generateTestSummaryMarkdown({ project: activeProject, filterPlanIds: undefined, aiResult: aiAnalysisResult || undefined })
                filename = `${activeProject.name.replace(/\s+/g, '-')}-test-summary.md`
            } else if (reportType === 'TestCasesCsv') {
                content = await api.generateTestCasesCsv({ project: activeProject })
                filename = `${activeProject.name.replace(/\s+/g, '-')}-test-cases.csv`
            } else if (reportType === 'ExecutionsCsv') {
                content = await api.generateExecutionsCsv({ project: activeProject })
                filename = `${activeProject.name.replace(/\s+/g, '-')}-executions.csv`
            }
            if (content && reportType !== 'SummaryPdf') await api.saveFileDialog({ defaultName: filename, content })
        } catch (e: any) {
            toast.error(`Export failed: ${e.message}`)
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
                {/* Primary Sub-Navigation (Reference: toolbar style) */}
                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1">
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
                                    "h-8 px-4 text-[11px] font-bold tracking-tight transition-all rounded-md",
                                    activeSubTab === tab.id
                                        ? "bg-[#2A2A3A] text-[#A78BFA] border border-[#A78BFA]/20"
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
                            {/* Primary Toolbar (Reference: Row 0) */}
                            <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest">Source</span>
                                        <Select value={source} onValueChange={setSource}>
                                            <SelectTrigger className="h-8 w-32 bg-[#1A1A24] border-[#2A2A3A] text-[11px] font-bold text-[#E2E8F0]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
                                                <SelectItem value="Linear">Linear</SelectItem>
                                                <SelectItem value="Jira">Jira</SelectItem>
                                                <SelectItem value="Manual">Manual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        onClick={handleAiGenerate}
                                        disabled={isGenerating || selectedTaskIds.length === 0}
                                        className="h-8 px-4 bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-bold text-[11px] gap-2"
                                    >
                                        <Cpu className="h-3.5 w-3.5" /> {isGenerating ? 'GENERATING...' : 'GENERATE TEST CASES'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowArchived(!showArchived)}
                                        className={cn(
                                            "h-8 px-3 text-[11px] font-bold gap-2 border border-transparent transition-all",
                                            showArchived ? "bg-[#FBBF24]/10 text-[#FBBF24] border-[#FBBF24]/20" : "text-[#6B7280] hover:bg-[#1A1A24]"
                                        )}
                                    >
                                        <Archive className="h-3.5 w-3.5" /> ARCHIVED
                                    </Button>
                                    <span className="text-[11px] font-bold text-[#6B7280] uppercase ml-1">Show Archived</span>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="font-mono text-[11px] font-bold text-[#6B7280] bg-[#1A1A24] px-3 py-1 rounded border border-[#2A2A3A] tracking-tighter">
                                        {testPlans.length} PLAN(S) · {testPlans.reduce((acc, p) => acc + (p.testCases || []).length, 0)} CASE(S)
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Toolbar (Reference: Row 1) */}
                            <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mr-2">Filters</span>
                                    {['All', 'Jira', 'Linear', 'Manual'].map(f => (
                                        <Button
                                            key={f}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSourceFilter(f)}
                                            className={cn(
                                                "h-7 px-3 text-[10px] font-bold rounded-md transition-all",
                                                sourceFilter === f ? "text-[#A78BFA] bg-[#A78BFA]/10 border border-[#A78BFA]/20" : "text-[#6B7280] hover:text-[#E2E8F0]"
                                            )}
                                        >
                                            {f}
                                        </Button>
                                    ))}
                                    <div className="w-[1px] h-4 bg-[#2A2A3A] mx-2" />
                                    <Button onClick={() => setCtxDialogOpen(true)} variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-bold text-[#A78BFA] hover:bg-[#A78BFA]/10 gap-2">
                                        <FileText className="h-3.5 w-3.5" />
                                        {selectedTaskIds.length > 0 ? `${selectedTaskIds.length} SELECTED` : 'SELECT CONTEXT'}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleImportCsv} className="h-7 px-3 text-[10px] font-bold text-[#6B7280] hover:text-[#E2E8F0] gap-2">
                                        <FileSpreadsheet className="h-3.5 w-3.5" /> IMPORT CSV
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { setEditingPlan(null); setPlanDialogOpen(true); }} className="h-7 px-3 text-[10px] font-bold text-[#6B7280] hover:text-[#E2E8F0] gap-2">
                                        <Plus className="h-3.5 w-3.5" /> NEW PLAN
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleLoadDesignDoc} className="h-7 px-3 text-[10px] font-bold text-[#6B7280] hover:text-[#E2E8F0] gap-2" title={designDocName || 'Load Design Document Text'}>
                                        <FileText className={cn("h-3.5 w-3.5", designDocName ? "text-[#10B981]" : "")} /> {designDocName ? 'DOC LOADED' : 'DESIGN DOC'}
                                        {designDocName && (
                                            <XCircle
                                                className="h-3 w-3 ml-1 hover:text-[#EF4444]"
                                                onClick={(e) => { e.stopPropagation(); setDesignDocName(null); setDesignDocContent(null); }}
                                            />
                                        )}
                                    </Button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <Input
                                            placeholder="Search plans & cases..."
                                            value={planSearchQuery}
                                            onChange={e => setPlanSearchQuery(e.target.value)}
                                            className="h-7 w-64 bg-[#1A1A24] border-[#2A2A3A] text-[11px] placeholder:text-[#4B5563] pl-8 focus-visible:ring-[#A78BFA]/20"
                                        />
                                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                                    </div>
                                </div>
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
                                                onRunCase={(p, tc) => {
                                                    setActivePlanForCase(p);
                                                    setActiveCaseForRun(tc);
                                                    setSingleRunDialogOpen(true);
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
                                    <span className="text-[11px] font-extrabold text-[#6B7280] uppercase tracking-[0.25em]">EXECUTION HISTORY</span>
                                    <div className="flex items-center gap-2">
                                        {/* Retest Failed Cases */}
                                        {previouslyFailedTestCases.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => {
                                                    if (!activeProjectId) return
                                                    const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                                    const planId = await addTestPlan(activeProjectId, `Retest: Failed Cases · ${ts}`, `Retest suite — ${previouslyFailedTestCases.length} previously failed cases.`, false, 'manual')
                                                    await batchAddTestCasesToPlan(activeProjectId, planId, previouslyFailedTestCases.map(tc => ({
                                                        title: tc.title, preConditions: tc.preConditions, steps: tc.steps, testData: tc.testData,
                                                        expectedResult: tc.expectedResult, actualResult: '', priority: tc.priority, status: 'not-run', sapModule: tc.sapModule, sourceIssueId: tc.sourceIssueId
                                                    })))
                                                    setActiveSubTab('TestCaseGeneration')
                                                    toast.success(`Created retest plan with ${previouslyFailedTestCases.length} failed cases.`)
                                                }}
                                                className="h-8 px-3 text-[11px] font-bold gap-2 border border-transparent hover:bg-[#EF4444]/10 text-[#EF4444] hover:border-[#EF4444]/20 transition-all"
                                                title="Create a new test plan containing all previously failed cases"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" /> RETEST FAILED ({previouslyFailedTestCases.length})
                                            </Button>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowArchived(!showArchived)}
                                                className={cn(
                                                    "h-8 px-3 text-[11px] font-bold gap-2 border border-transparent transition-all",
                                                    showArchived ? "bg-[#FBBF24]/10 text-[#FBBF24] border-[#FBBF24]/20" : "text-[#6B7280] hover:bg-[#1A1A24]"
                                                )}
                                            >
                                                <Archive className="h-3.5 w-3.5" /> ARCHIVED
                                            </Button>
                                            <span className="text-[11px] font-bold text-[#6B7280] uppercase ml-1">Show Archived</span>
                                        </div>
                                        <div className="font-mono text-[11px] font-bold text-[#6B7280] bg-[#1A1A24] px-3 py-1 rounded border border-[#2A2A3A] tracking-tighter">
                                            {totalRuns} RUN(S)
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
                                                                            {ex.actualResult && <div className="text-xs font-bold text-[#6B7280] italic px-4 border-r border-[#2A2A3A] max-w-md line-clamp-2"><FormattedText content={ex.actualResult} projectId={activeProjectId || undefined} /></div>}
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
                                                    <SelectItem value="SummaryPdf">Test Summary (PDF)</SelectItem>
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
                            <CoverageMatrix />
                        )
                    }

                    {
                        activeSubTab === 'RegressionBuilder' && (
                            <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F13]">
                                {/* Toolbar */}
                                <div className="flex-none bg-[#13131A] border-b border-[#2A2A3A] px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">From</span>
                                            <Input 
                                                type="date" 
                                                value={regressionFromDate}
                                                onChange={(e) => setRegressionFromDate(e.target.value)}
                                                className="h-9 w-44 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0]" 
                                            />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.2em]">To</span>
                                            <Input 
                                                type="date" 
                                                value={regressionToDate}
                                                onChange={(e) => setRegressionToDate(e.target.value)}
                                                className="h-9 w-44 bg-[#1A1A24] border-[#2A2A3A] text-xs font-bold text-[#E2E8F0]" 
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => { setRegressionFromDate(""); setRegressionToDate(""); }}
                                            className="h-9 text-[11px] font-bold text-[#6B7280]"
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="outline"
                                            className="h-9 px-4 border-[#2A2A3A] text-[#A78BFA] font-bold text-xs gap-2 hover:bg-[#A78BFA]/10"
                                            onClick={handleGenerateSmokeSubset}
                                            disabled={isGenerating}
                                        >
                                            <Cpu className="h-3.5 w-3.5" />
                                            {isGenerating ? 'ANALYZING...' : 'REFRESH AI SMOKE'}
                                        </Button>
                                        <Button
                                            className="h-9 px-6 bg-[#A78BFA] text-[#0F0F13] font-bold text-xs gap-2"
                                            disabled={isGenerating || uniqueSelectedCases.length === 0}
                                            onClick={handleBuildRegressionSuite}
                                        >
                                            <Zap className="h-3.5 w-3.5" />
                                            {isGenerating ? 'BUILDING...' : 'BUILD REGRESSION SUITE'}
                                        </Button>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                    <div className="max-w-5xl mx-auto space-y-8">
                                        {builderStatus && (
                                            <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
                                                    <span className="text-sm font-bold text-[#10B981]">{builderStatus}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => setBuilderStatus(null)} className="h-7 w-7 p-0 text-[#10B981] hover:bg-[#10B981]/10">
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                        {/* Summary Card */}
                                        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-[#A78BFA]/50 group-hover:w-2 transition-all" />
                                            <div className="space-y-6">
                                                <div>
                                                    <h2 className="text-[10px] font-black text-[#6B7280] uppercase tracking-[0.3em] mb-2">REGRESSION SUITE PREVIEW</h2>
                                                    <p className="text-xl font-black text-[#E2E8F0] tracking-tight">
                                                        {uniqueSelectedCases.length} unique test case(s) selected
                                                    </p>
                                                    <p className="text-xs text-[#6B7280] mt-1 font-medium italic opacity-80">
                                                        {regressionFromDate || regressionToDate 
                                                            ? `Filtering Done tasks ${regressionFromDate ? `from ${new Date(regressionFromDate).toLocaleDateString()}` : ""} ${regressionToDate ? `until ${new Date(regressionToDate).toLocaleDateString()}` : ""}`
                                                            : "Aggregating all completed tasks and recent failures."}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-4 gap-4">
                                                    {[
                                                        { label: 'Done-Linked', value: doneLinkedTestCases.length, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-[#10B981]', bg: 'bg-[#10B981]/10' },
                                                        { label: 'Prev. Failed', value: previouslyFailedTestCases.length, icon: <XCircle className="h-4 w-4" />, color: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10' },
                                                        { label: 'AI Recommended', value: smokeSubsetTestCases.length, icon: <Cpu className="h-4 w-4" />, color: 'text-[#A78BFA]', bg: 'bg-[#A78BFA]/10' },
                                                        { label: 'Total (Unique)', value: uniqueSelectedCases.length, icon: <Zap className="h-4 w-4" />, color: 'text-[#FBBF24]', bg: 'bg-[#FBBF24]/10' },
                                                    ].map((stat, idx) => (
                                                        <div key={idx} className="bg-[#1A1A24] border border-[#2A2A3A] rounded-xl p-4 flex flex-col items-center text-center group cursor-default transition-all hover:translate-y-[-2px] hover:border-[#A78BFA]/20">
                                                            <div className={cn("p-2 rounded-lg mb-3 shadow-inner transition-colors", stat.bg, stat.color)}>
                                                                {stat.icon}
                                                            </div>
                                                            <div className={cn("text-2xl font-black mb-1", stat.color)}>{stat.value}</div>
                                                            <div className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">{stat.label}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Preview Sections */}
                                        <div className="space-y-6 pb-20 mt-10">
                                            {/* Done-Linked Section */}
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-3 pl-1">
                                                    <div className="h-4 w-1 bg-[#10B981] rounded-full" />
                                                    <h3 className="text-xs font-black text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                                                        DONE-LINKED TEST CASES <span className="opacity-40 tracking-tighter normal-case font-bold italic ml-2">({doneLinkedTestCases.length})</span>
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {doneLinkedTestCases.length === 0 ? (
                                                        <div className="p-4 bg-[#1A1A24]/40 border border-dashed border-[#2A2A3A] rounded-xl text-center text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">
                                                            No linked test cases for done tasks
                                                        </div>
                                                    ) : (
                                                        doneLinkedTestCases.map(tc => (
                                                            <div key={tc.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-lg p-3 flex items-center justify-between hover:bg-[#1A1A24] transition-colors group">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="bg-[#10B981]/10 text-[#10B981] p-1.5 rounded-md self-start shrink-0">
                                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <div className="text-xs font-bold text-[#E2E8F0] tracking-tight group-hover:text-white transition-colors truncate">{tc.title}</div>
                                                                        <div className="text-[9px] font-mono text-[#6B7280] mt-1 uppercase flex items-center gap-2">
                                                                            <span className="text-[#A78BFA] font-bold">{tc.displayId}</span>
                                                                            <span className="opacity-40">·</span>
                                                                            <span>Link ID: {tc.sourceIssueId || 'N/A'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <ArrowRightCircle className="h-3.5 w-3.5 text-[#6B7280]" />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>

                                            {/* Previously Failed Section */}
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-3 pl-1">
                                                    <div className="h-4 w-1 bg-[#EF4444] rounded-full" />
                                                    <h3 className="text-xs font-black text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                                                        PREVIOUSLY FAILED <span className="opacity-40 tracking-tighter normal-case font-bold italic ml-2">({previouslyFailedTestCases.length})</span>
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {previouslyFailedTestCases.length === 0 ? (
                                                        <div className="p-4 bg-[#1A1A24]/40 border border-dashed border-[#2A2A3A] rounded-xl text-center text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">
                                                            No failure history found
                                                        </div>
                                                    ) : (
                                                        previouslyFailedTestCases.map(tc => (
                                                            <div key={tc.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-lg p-3 flex items-center justify-between hover:bg-[#1A1A24] transition-colors group">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="bg-[#EF4444]/10 text-[#EF4444] p-1.5 rounded-md self-start shrink-0">
                                                                        <XCircle className="h-3.5 w-3.5" />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <div className="text-xs font-bold text-[#E2E8F0] tracking-tight group-hover:text-white transition-colors truncate">{tc.title}</div>
                                                                        <div className="text-[9px] font-mono text-[#6B7280] mt-1 uppercase flex items-center gap-2">
                                                                            <span className="text-[#A78BFA] font-bold">{tc.displayId}</span>
                                                                            <span className="opacity-40">·</span>
                                                                            <span>Last Result: FAILED</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <ArrowRightCircle className="h-3.5 w-3.5 text-[#6B7280]" />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>

                                            {/* AI Smoke Subset Section */}
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-3 pl-1">
                                                    <div className="h-4 w-1 bg-[#A78BFA] rounded-full" />
                                                    <h3 className="text-xs font-black text-[#6B7280] uppercase tracking-widest flex items-center gap-2">
                                                        AI RECOMMENDED SMOKE <span className="opacity-40 tracking-tighter normal-case font-bold italic ml-2">({smokeSubsetTestCases.length})</span>
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {smokeSubsetTestCases.length === 0 ? (
                                                        <div className="p-6 bg-[#1A1A24]/40 border border-dashed border-[#2A2A3A] rounded-xl text-center space-y-3">
                                                            <div className="text-[10px] font-bold text-[#4B5563] uppercase tracking-widest">Run AI analysis to identify smoke subset</div>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                onClick={handleGenerateSmokeSubset}
                                                                disabled={isGenerating}
                                                                className="h-7 text-[10px] font-black border-[#2A2A3A] text-[#A78BFA] hover:bg-[#A78BFA]/10"
                                                            >
                                                                <Cpu className="h-3 w-3 mr-2" /> RUN ANALYSIS
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        smokeSubsetTestCases.map(tc => (
                                                            <div key={tc.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-lg p-3 flex items-center justify-between hover:bg-[#1A1A24] transition-colors group">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="bg-[#A78BFA]/10 text-[#A78BFA] p-1.5 rounded-md self-start shrink-0">
                                                                        <Zap className="h-3.5 w-3.5" />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <div className="text-xs font-bold text-[#E2E8F0] tracking-tight group-hover:text-white transition-colors truncate">{tc.title}</div>
                                                                        <div className="text-[9px] font-mono text-[#6B7280] mt-1 uppercase flex items-center gap-2">
                                                                            <span className="text-[#A78BFA] font-bold">{tc.displayId}</span>
                                                                            <span className="opacity-40">·</span>
                                                                            <span>Confidence: High</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <ArrowRightCircle className="h-3.5 w-3.5 text-[#6B7280]" />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    }
                </div>

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
                <SingleTestRunDialog
                    open={singleRunDialogOpen}
                    onOpenChange={setSingleRunDialogOpen}
                    plan={activePlanForCase}
                    testCase={activeCaseForRun}
                />
                <CsvImportDialog
                    open={importDialogOpen}
                    onOpenChange={setImportDialogOpen}
                    onImport={handleImportedData}
                />
            </div>
        </>
    )
}

