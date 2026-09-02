import { lazy, Suspense, useState, useMemo, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useActiveProject, useActiveProjectId, useProjectStore, useFlakinessStats } from "@/store/useProjectStore"
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
    ChevronUp,
    Trash2,
    Archive,
    Search,
    RotateCcw,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CompactPageHeader, InlineStatusSummary, PageScaffold } from "@/components/ui/workspace"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import TestPlanCard from "@/components/TestPlanCard"
import FormattedText from "@/components/FormattedText"
import TestRunSessionCard from "@/components/TestRunSessionCard"
import { toast } from "sonner"
import { SubtabBar } from "@/components/ui/subtab-bar"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { SkeletonList } from "@/components/ui/skeleton"

type SubTab = 'TestCaseGeneration' | 'TestRuns' | 'Reports' | 'CoverageMatrix' | 'RegressionBuilder' | 'RiskMatrix' | 'AIAccuracy'

const TESTS_SUBTAB_STORAGE_PREFIX = "qassistant:testsSubtab:"
const TESTS_ADVANCED_STORAGE_PREFIX = "qassistant:testsAdvanced:"

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { sanitizeExecutionsForAi, sanitizeProjectForQaAi, sanitizeTasksForQaAi, sanitizeTestCasesForAi, sanitizeTestPlansForAi } from '@/lib/aiUtils'
import { aiGenerateCases, aiSmokeSubset, aiCriticality, aiTestRunSuggestions } from '@/lib/aiClient'
import { computeRiskScores } from '@/lib/riskPrioritization'
import { AiSetupPrompt } from '@/components/ui/AiSetupPrompt'
import { useUserStore } from '@/store/useUserStore'
import { useShallow } from "zustand/react/shallow"

const AIAccuracyPanel = lazy(() => import("@/components/ai-accuracy/AIAccuracyPanel"))
const TestPlanDialog = lazy(() => import("@/components/TestPlanDialog"))
const TestCaseDialog = lazy(() => import("@/components/TestCaseDialog"))
const TestRunDialog = lazy(() => import("@/components/TestRunDialog"))
const SingleTestRunDialog = lazy(() => import("@/components/SingleTestRunDialog"))
const TaskSelectionDialog = lazy(() => import("@/components/TaskSelectionDialog"))
const CsvImportDialog = lazy(() => import("@/components/CsvImportDialog").then((module) => ({ default: module.CsvImportDialog })))
const CoverageMatrix = lazy(() => import("@/components/CoverageMatrix"))
const TestResultImportDialog = lazy(() => import("@/components/TestResultImportDialog").then((module) => ({ default: module.TestResultImportDialog })))
const DevTestPlanSummary = lazy(() => import("@/components/sync/DevTestPlanSummary").then((module) => ({ default: module.DevTestPlanSummary })))

export default function TestsPage() {
    const api = window.electronAPI;
    const [searchParams, setSearchParams] = useSearchParams()
    const activeRole = useUserStore(s => s.profile?.activeRole ?? 'qa')
    const activeProject = useActiveProject()
    const activeProjectId = useActiveProjectId()
    const { addTestCase, addTestPlan, batchAddTestCasesToPlan, deleteLegacyExecution } = useProjectStore(useShallow((state) => ({
        addTestCase: state.addTestCase,
        addTestPlan: state.addTestPlan,
        batchAddTestCasesToPlan: state.batchAddTestCasesToPlan,
        deleteLegacyExecution: state.deleteLegacyExecution,
    })))
    const testPlans = activeProject?.testPlans || []
    const projectExecutions = activeProject?.testExecutions || []
    const projectRunSessions = [...(activeProject?.testRunSessions || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    const totalRuns = (projectExecutions?.length || 0) + (projectRunSessions?.length || 0)
    const flakinessMap = useFlakinessStats()
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('TestCaseGeneration')
    const [showGenerationAdvanced, setShowGenerationAdvanced] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [showArchived, setShowArchived] = useState(false)
    const [source, setSource] = useState("Linear")
    const [freeTextInput, setFreeTextInput] = useState("")
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
    const [importResultsDialogOpen, setImportResultsDialogOpen] = useState(false)
    const [editingCase, setEditingCase] = useState<TestCase | null>(null)
    const [activePlanForCase, setActivePlanForCase] = useState<TestPlan | null>(null)
    const [activeCaseForRun, setActiveCaseForRun] = useState<TestCase | null>(null)

    const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null)

    useEffect(() => {
        if (!activeProjectId || !api) return
        Promise.all([
            api.secureStoreGet(`project:${activeProjectId}:gemini_api_key`),
            api.secureStoreGet('gemini_api_key'),
        ]).then(([projectKey, globalKey]) => {
            setGeminiConfigured(!!(projectKey || globalKey))
        }).catch(() => setGeminiConfigured(false))
    }, [activeProjectId, api])

    useEffect(() => {
        if (!activeProjectId) return
        const storedSubtab = window.localStorage.getItem(`${TESTS_SUBTAB_STORAGE_PREFIX}${activeProjectId}`) as SubTab | null
        const storedAdvanced = window.localStorage.getItem(`${TESTS_ADVANCED_STORAGE_PREFIX}${activeProjectId}`)
        const requestedTab = searchParams.get("tab") as SubTab | null
        if (requestedTab && ['TestCaseGeneration', 'TestRuns', 'Reports', 'CoverageMatrix', 'RegressionBuilder', 'RiskMatrix', 'AIAccuracy'].includes(requestedTab)) {
            setActiveSubTab(requestedTab)
        } else if (storedSubtab) {
            setActiveSubTab(storedSubtab)
        }
        if (storedAdvanced) setShowGenerationAdvanced(storedAdvanced === "true")
    }, [activeProjectId, searchParams])

    useEffect(() => {
        if (!activeProjectId) return
        window.localStorage.setItem(`${TESTS_SUBTAB_STORAGE_PREFIX}${activeProjectId}`, activeSubTab)
    }, [activeProjectId, activeSubTab])

    useEffect(() => {
        const next = new URLSearchParams(searchParams)
        if (activeSubTab === "TestCaseGeneration") next.delete("tab")
        else next.set("tab", activeSubTab)
        if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
    }, [activeSubTab, searchParams, setSearchParams])

    useEffect(() => {
        if (!activeProjectId) return
        window.localStorage.setItem(`${TESTS_ADVANCED_STORAGE_PREFIX}${activeProjectId}`, String(showGenerationAdvanced))
    }, [activeProjectId, showGenerationAdvanced])

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
        const allCases = activeProject.testPlans.flatMap(tp => tp.testCases || [])
        const doneTasks = activeProject.tasks.filter(t => t.status === 'done')

        setIsGenerating(true)
        try {
            const ids = await aiSmokeSubset({
                candidates: sanitizeTestCasesForAi(allCases),
                doneTasks: sanitizeTasksForQaAi(doneTasks, activeProject.environments),
                project: sanitizeProjectForQaAi(activeProject ?? undefined),
            })
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

    const totalCaseCount = useMemo(() => testPlans.reduce((acc, p) => acc + (p.testCases || []).length, 0), [testPlans])
    const testsNextAction = useMemo(() => {
        if (selectedTaskIds.length > 0) return `Generate cases from ${selectedTaskIds.length} selected task${selectedTaskIds.length === 1 ? "" : "s"}.`
        if (previouslyFailedTestCases.length > 0) return `Retest ${previouslyFailedTestCases.length} previously failed case${previouslyFailedTestCases.length === 1 ? "" : "s"}.`
        if (filteredPlans.length > 0) return "Open an active plan and run or refine its cases."
        return "Select context or use free text to generate the first test plan."
    }, [filteredPlans.length, previouslyFailedTestCases.length, selectedTaskIds.length])

    const handleAiGenerate = async () => {
        if (!activeProjectId) return

        // Free-text mode: build a synthetic task from the pasted description
        if (source === 'FreeText') {
            if (!freeTextInput.trim()) {
                toast.warning('Please enter a feature description or acceptance criteria.')
                return
            }
            setIsGenerating(true)
            try {
                const syntheticTask = [{
                    id: 'freetext-input',
                    title: freeTextInput.split('\n')[0].slice(0, 120) || 'Free Text Input',
                    description: freeTextInput,
                    status: 'in-progress',
                    priority: 'medium',
                    issueType: 'Task',
                    labels: '',
                    sourceIssueId: '',
                    externalId: ''
                }]
                const cases = await aiGenerateCases({
                    tasks: sanitizeTasksForQaAi(syntheticTask as any, activeProject!.environments),
                    sourceName: 'Manual',
                    project: sanitizeProjectForQaAi(activeProject ?? undefined),
                    designDoc: designDocContent || undefined,
                })
                if (!cases || cases.length === 0) { toast.warning('No test cases could be generated.'); return }
                const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                const planName = `Free Text · ${timestamp}`
                const planId = await addTestPlan(activeProjectId, planName, `Generated from free-text description using Gemini.`)
                for (const c of cases as any[]) {
                    await addTestCase(activeProjectId, planId, {
                        title: c.title,
                        displayId: c.testCaseId,
                        preConditions: c.preConditions || '',
                        steps: c.steps || c.testSteps || '',
                        testData: c.testData || '',
                        expectedResult: c.expectedResult || '',
                        priority: (c.priority || 'medium').toLowerCase() as any,
                        sourceIssueId: c.sourceIssueId || '',
                        sapModule: c.sapModule,
                        status: 'not-run',
                        aiGenerated: true,
                    })
                }
                toast.success(`Generated ${cases.length} test cases in "${planName}"`)
            } catch (e: any) {
                toast.error(`AI Generation failed: ${e.message}`)
            } finally {
                setIsGenerating(false)
            }
            return
        }

        const tasksToUse = activeProject?.tasks?.filter(t => selectedTaskIds.includes(t.id)) || []

        if (tasksToUse.length === 0) {
            toast.warning('No context issues selected. Please select issues to generate from.')
            return
        }

        setIsGenerating(true)
        try {
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

            const cases = await aiGenerateCases({
                tasks: sanitizeTasksForQaAi(sanitizedTasks as any, activeProject!.environments),
                sourceName: source,
                project: sanitizeProjectForQaAi(activeProject ?? undefined),
                designDoc: designDocContent || undefined,
            })

            if (cases.length === 0) {
                toast.warning('No test cases could be generated.')
                return
            }

            // Create a new test plan for this generation patch like the original repository
            const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            const newPlanName = `Regression: ${source} \u00B7 ${tasksToUse.length} Issues \u00B7 ${timestamp}`
            const newPlanId = await addTestPlan(activeProjectId, newPlanName, `Auto-generated from ${tasksToUse.length} ${source} issue(s) using Gemini.`)

            for (const c of cases as any[]) {
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
                    status: 'not-run',
                    aiGenerated: true,
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
        setIsGenerating(true)
        try {
            const result = await aiCriticality({
                tasks: sanitizeTasksForQaAi(activeProject?.tasks || [], activeProject.environments),
                testPlans: sanitizeTestPlansForAi(testPlans),
                executions: sanitizeExecutionsForAi(projectExecutions),
                project: sanitizeProjectForQaAi(activeProject ?? undefined),
            })
            setAiAnalysisResult(result)
        } catch (e: any) {
            toast.error(`Criticality assessment failed: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleAiTestRunSuggestions = async () => {
        if (!activeProject) return
        setIsGenerating(true)
        try {
            const result = await aiTestRunSuggestions({
                testPlans: sanitizeTestPlansForAi(testPlans),
                executions: sanitizeExecutionsForAi(projectExecutions),
                project: sanitizeProjectForQaAi(activeProject ?? undefined),
            })
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
                const sanitizedTasks = (activeProject.tasks || []).map(({ analysisHistory: _ah, ...t }) => t)
                const pdfProject = { ...activeProject, tasks: sanitizedTasks }
                const res = await api.exportTestSummaryPdf(pdfProject, undefined, aiAnalysisResult || undefined)
                if (res && res.success) {
                    toast.success(`PDF exported to: ${res.path}`)
                } else if (res && res.error) {
                    throw new Error(res.error)
                }
            } else if (reportType === 'Summary') {
                content = await api.generateTestSummaryMarkdown(activeProject, undefined, aiAnalysisResult || undefined)
                filename = `${activeProject.name.replace(/\s+/g, '-')}-test-summary.md`
            } else if (reportType === 'TestCasesCsv') {
                content = await api.generateTestCasesCsv(activeProject)
                filename = `${activeProject.name.replace(/\s+/g, '-')}-test-cases.csv`
            } else if (reportType === 'ExecutionsCsv') {
                content = await api.generateExecutionsCsv(activeProject)
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
            case 'passed': return <CheckCircle2 className="h-4 w-4 text-state-success" />
            case 'failed': return <XCircle className="h-4 w-4 text-state-danger" />
            case 'blocked': return <Ban className="h-4 w-4 text-state-warning" />
            case 'skipped': return <ArrowRightCircle className="h-4 w-4 text-muted-ui" />
            default: return <HelpCircle className="h-4 w-4 text-soft" />
        }
    }

    if (activeRole === 'dev') {
        return (
            <Suspense fallback={<SkeletonList rows={4} />}>
                <DevTestPlanSummary />
            </Suspense>
        )
    }

    return (
        <>
            <PageScaffold className="flex h-full max-w-none flex-col overflow-hidden pb-0 animate-in fade-in duration-500">
                <CompactPageHeader
                    eyebrow="QA workflow"
                    title="Tests"
                    description="Generate, run, review, and package test coverage without jumping between disconnected tools."
                    summary={<InlineStatusSummary items={[`${filteredPlans.length} visible plans`, `${totalCaseCount} cases`, testsNextAction]} />}
                />
                <div className="flex-none space-y-3 border-b app-divider bg-[hsl(var(--surface-header)/0.78)] px-6 py-4">
                    <div className="hidden">
                        <div className="min-w-[240px]">
                            <h1 className="text-xl font-semibold tracking-tight text-foreground">Tests</h1>
                            <p className="mt-1 text-xs text-soft">
                                {filteredPlans.length} visible plans · {totalCaseCount} cases · {testsNextAction}
                            </p>
                        </div>
                    </div>
                    <SubtabBar
                        value={activeSubTab}
                        onChange={(value) => setActiveSubTab(value as SubTab)}
                        items={[
                            { id: 'TestCaseGeneration', label: 'Case Generation', icon: FlaskConical },
                            { id: 'TestRuns', label: 'Test Runs', icon: History, count: totalRuns },
                            { id: 'Reports', label: 'Exports', icon: BarChart3 },
                            { id: 'CoverageMatrix', label: 'Coverage Matrix', icon: Layers },
                            { id: 'RegressionBuilder', label: 'Regression Builder', icon: Zap },
                            { id: 'RiskMatrix', label: 'Risk Matrix', icon: BarChart3 },
                            { id: 'AIAccuracy', label: 'AI Accuracy', icon: ShieldCheck }
                        ]}
                    />
                </div>

                {/* Sub-tab Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                    {activeSubTab === 'TestCaseGeneration' && (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex-none border-b app-divider bg-[hsl(var(--surface-header)/0.68)] px-6 py-3 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select value={source} onValueChange={setSource}>
                                        <SelectTrigger className="h-9 w-40 text-[11px] font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Linear">Linear</SelectItem>
                                            <SelectItem value="Jira">Jira</SelectItem>
                                            <SelectItem value="Manual">Manual</SelectItem>
                                            <SelectItem value="FreeText">Free Text / AI</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="relative min-w-[260px] flex-1">
                                        <Input
                                            placeholder="Search plans & cases…"
                                            value={planSearchQuery}
                                            onChange={e => setPlanSearchQuery(e.target.value)}
                                            className="h-9 bg-panel-muted border-ui text-[11px] placeholder:text-muted-ui pl-8 focus-visible:ring-qa-accent/20"
                                        />
                                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-ui" />
                                    </div>
                                    <Button onClick={() => setCtxDialogOpen(true)} variant="ghost" size="sm" className="h-9 px-3 text-[11px] font-medium text-foreground hover:bg-elevated gap-2">
                                        <FileText className="h-3.5 w-3.5" />
                                        {selectedTaskIds.length > 0 ? `${selectedTaskIds.length} selected` : 'Select context'}
                                    </Button>
                                    <Button
                                        onClick={handleAiGenerate}
                                        disabled={isGenerating || (source !== 'FreeText' && selectedTaskIds.length === 0)}
                                        className="h-9 px-4 bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-medium text-[11px] gap-2"
                                    >
                                        <Cpu className="h-3.5 w-3.5" /> {isGenerating ? 'Generating…' : 'Generate'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowArchived(!showArchived)}
                                        className={cn(
                                            "h-9 px-3 text-[11px] font-medium gap-2 border border-transparent transition-all",
                                            showArchived ? "bg-panel-muted text-foreground" : "text-muted-ui hover:bg-elevated"
                                        )}
                                    >
                                        <Archive className="h-3.5 w-3.5" /> Archived
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowGenerationAdvanced((current) => !current)}
                                        className="h-9 gap-2 border-ui bg-app text-foreground"
                                    >
                                        <SlidersHorizontal className="h-3.5 w-3.5" />
                                        More tools
                                        {showGenerationAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>

                                {showGenerationAdvanced && (
                                    <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
                                        <span className="app-section-label mr-2">Filters</span>
                                        <SegmentedControl
                                            value={sourceFilter}
                                            onChange={setSourceFilter}
                                            options={['All', 'Jira', 'Linear', 'Manual'].map((item) => ({ value: item, label: item }))}
                                        />
                                        <div className="w-[1px] h-4 bg-elevated mx-2" />
                                        <Button variant="ghost" size="sm" onClick={handleImportCsv} className="h-7 px-3 text-[11px] font-bold text-muted-ui hover:text-foreground gap-2">
                                            <FileSpreadsheet className="h-3.5 w-3.5" /> IMPORT CSV
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setImportResultsDialogOpen(true)} className="h-7 px-3 text-[11px] font-bold text-muted-ui hover:text-foreground gap-2">
                                            <ArrowRightCircle className="h-3.5 w-3.5" /> IMPORT RESULTS
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => { setEditingPlan(null); setPlanDialogOpen(true); }} className="h-7 px-3 text-[11px] font-bold text-muted-ui hover:text-foreground gap-2">
                                            <Plus className="h-3.5 w-3.5" /> NEW PLAN
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={handleLoadDesignDoc} className="h-7 px-3 text-[11px] font-bold text-muted-ui hover:text-foreground gap-2" title={designDocName || 'Load Design Document Text'}>
                                            <FileText className={cn("h-3.5 w-3.5", designDocName ? "text-state-success" : "")} /> {designDocName ? 'DOC LOADED' : 'DESIGN DOC'}
                                            {designDocName && (
                                                <XCircle
                                                    className="h-3 w-3 ml-1 hover:text-[hsl(var(--state-danger))]"
                                                    onClick={(e) => { e.stopPropagation(); setDesignDocName(null); setDesignDocContent(null); }}
                                                />
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Free Text Input Panel */}
                            {source === 'FreeText' && (
                                <div className="flex-none bg-app border-b border-ui px-6 py-4 animate-in slide-in-from-top-1 duration-200">
                                    <div className="max-w-5xl mx-auto space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-brand uppercase tracking-widest">Paste Feature Description or Acceptance Criteria</span>
                                            <span className="text-[11px] text-muted-ui">AI will generate test cases directly from this text</span>
                                        </div>
                                        <textarea
                                            value={freeTextInput}
                                            onChange={e => setFreeTextInput(e.target.value)}
                                            placeholder="e.g. As a user I want to add items to my cart so that I can purchase them. The cart should update the item count badge, support quantity changes, and persist across page reloads…"
                                            className="w-full h-28 bg-panel-muted border border-ui rounded-lg px-4 py-3 text-[12px] text-foreground placeholder:text-muted-ui focus:outline-none focus:border-qa-accent/50 focus:ring-1 focus:ring-qa-accent/20 resize-none custom-scrollbar"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Content Area */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                {geminiConfigured === false && (
                                    <div className="max-w-5xl mx-auto mb-6">
                                        <AiSetupPrompt
                                            featureName="AI Test Case Generation"
                                            description="Connect a Gemini API key to generate structured test cases from your Linear or Jira issues — including preconditions, steps, test data, and expected results linked back to the originating task."
                                        />
                                    </div>
                                )}
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
                                    <div className="absolute inset-0 z-50 bg-surface-app/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                                        <div className="space-y-6">
                                            <div className="relative">
                                                <div className="h-16 w-16 rounded-full border-t-2 border-l-2 border-qa-accent animate-spin" />
                                                <FlaskConical className="h-8 w-8 text-brand absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                                            </div>
                                            <div className="space-y-2">
                                                <h2 className="text-xl font-black text-foreground">Generating test cases via Gemini…</h2>
                                                <p className="text-sm text-muted-ui">Building regression suite through test analysis.</p>
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
                                <div className="flex-none bg-panel border-b border-ui px-6 py-3 flex items-center justify-between">
                                    <span className="text-[11px] font-extrabold text-muted-ui uppercase tracking-[0.25em]">EXECUTION HISTORY</span>
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
                                                className="h-8 px-3 text-[11px] font-bold gap-2 border border-transparent hover:bg-state-danger-soft text-state-danger hover:border-state-danger-border transition-all"
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
                                                    showArchived ? "bg-state-warning-soft text-state-warning border-state-warning-border" : "text-muted-ui hover:bg-elevated"
                                                )}
                                            >
                                                <Archive className="h-3.5 w-3.5" /> ARCHIVED
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-soft">{totalRuns} runs</p>
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
                                                        <div className="mt-8 border-t border-ui pt-4">
                                                            <h4 className="text-xs font-bold text-muted-ui uppercase mb-4 tracking-widest pl-2">Legacy Executions</h4>
                                                            <div className="space-y-4">
                                                                {[...projectExecutions].sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0)).map(ex => (
                                                                    <div key={ex.id} className="bg-panel-muted border-l-4 border-ui rounded-r-xl p-4 flex items-center justify-between transition-all hover:bg-elevated"
                                                                        style={{ borderLeftColor: ex.result === 'passed' ? 'hsl(var(--state-success))' : ex.result === 'failed' ? 'hsl(var(--state-danger))' : 'hsl(var(--state-warning))' }}>
                                                                        <div className="flex items-center gap-4">
                                                                            <div className={cn("p-2 rounded-lg",
                                                                                ex.result === 'passed' ? "bg-state-success-soft text-state-success" :
                                                                                    ex.result === 'failed' ? "bg-state-danger-soft text-state-danger" : "bg-state-warning-soft text-state-warning"
                                                                            )}>
                                                                                {getStatusIcon(ex.result as TestCaseStatus)}
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm font-bold text-foreground">{ex.snapshotTestCaseTitle}</p>
                                                                                <div className="flex items-center gap-3 mt-1">
                                                                                    <span className="text-[11px] font-bold text-muted-ui uppercase opacity-60 flex items-center gap-1">
                                                                                        <Calendar className="h-3 w-3" /> {new Date(ex.executedAt).toLocaleString()}
                                                                                    </span>
                                                                                    <span className="text-[11px] font-bold text-muted-ui uppercase opacity-60 flex items-center gap-1">
                                                                                        <User className="h-3 w-3" /> Manual execution
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {ex.actualResult && <div className="text-xs font-bold text-muted-ui italic px-4 border-r border-ui max-w-md line-clamp-2"><FormattedText content={ex.actualResult} projectId={activeProjectId || undefined} /></div>}
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-8 w-8 text-muted-ui hover:text-[hsl(var(--state-danger))] hover:bg-state-danger-soft"
                                                                                onClick={() => deleteLegacyExecution(activeProjectId!, ex.id)}
                                                                                title="Delete legacy execution"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-ui" aria-label="Open execution details">
                                                                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
                                                <div className="mt-8 bg-panel border border-ui rounded-xl overflow-hidden">
                                                    <button
                                                        className="w-full flex items-center justify-between p-4 hover:bg-elevated transition-colors"
                                                        onClick={() => setAiSuggestionsExpanded(!aiSuggestionsExpanded)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Cpu className="h-4 w-4 text-state-warning" />
                                                            <span className="text-[13px] font-bold text-foreground tracking-wide">AI Suggestions</span>
                                                        </div>
                                                        <ChevronDown className={cn("h-4 w-4 text-muted-ui transition-transform duration-200", aiSuggestionsExpanded && "rotate-180")} />
                                                    </button>

                                                    {aiSuggestionsExpanded && (
                                                        <div className="p-4 border-t border-ui bg-app flex flex-col gap-4">
                                                            <div className="flex gap-4">
                                                                <Button
                                                                    className="flex-1 h-9 bg-elevated hover:bg-elevated border border-ui text-state-warning font-bold text-xs gap-2 transition-all"
                                                                    disabled={isGenerating}
                                                                    onClick={handleAiCriticality}
                                                                >
                                                                    <Cpu className="h-3.5 w-3.5" />
                                                                    {isGenerating ? 'ANALYZING...' : 'GET CRITICALITY ASSESSMENT'}
                                                                </Button>
                                                                <Button
                                                                    className="flex-1 h-9 bg-elevated hover:bg-elevated border border-ui text-brand font-bold text-xs gap-2 transition-all"
                                                                    disabled={isGenerating}
                                                                    onClick={handleAiTestRunSuggestions}
                                                                >
                                                                    <BarChart3 className="h-3.5 w-3.5" />
                                                                    {isGenerating ? 'ANALYZING...' : 'GET TEST RUN SUGGESTIONS'}
                                                                </Button>
                                                            </div>

                                                            {aiAnalysisResult && (
                                                                <div className="bg-panel-muted border border-state-warning-border rounded-lg p-4 mt-2">
                                                                    <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono relative">
                                                                        {aiAnalysisResult}
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 mt-4 text-[11px] uppercase font-bold text-muted-ui hover:text-[hsl(var(--state-danger))]"
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
                            <div className="flex-1 flex flex-col min-h-0 bg-app">
                                <div className="flex-none bg-panel border-b border-ui px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.2em]">Export</span>
                                            <Select value={reportType} onValueChange={setReportType}>
                                                <SelectTrigger className="h-9 w-48 bg-panel-muted border-ui text-xs font-bold text-foreground">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-panel-muted border-ui text-foreground">
                                                    <SelectItem value="Summary">Test Summary (Markdown)</SelectItem>
                                                    <SelectItem value="SummaryPdf">Test Summary (PDF)</SelectItem>
                                                    <SelectItem value="TestCasesCsv">Test Cases (CSV)</SelectItem>
                                                    <SelectItem value="ExecutionsCsv">Execution History (CSV)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            className="h-9 px-4 bg-primary text-primary-foreground font-bold text-xs"
                                            onClick={handleExport}
                                            disabled={isGenerating || !activeProject}
                                        >
                                            {isGenerating ? 'Exporting…' : 'EXPORT'}
                                        </Button>
                                    </div>
                                </div>
                                {/* Export content */}
                                {aiAnalysisResult ? (
                                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                        <div className="bg-panel-muted border border-ui rounded-2xl p-6 text-sm text-brand leading-relaxed whitespace-pre-wrap font-mono">
                                            {aiAnalysisResult}
                                        </div>
                                        <Button
                                            className="mt-4 h-9 px-4 bg-transparent border border-ui text-muted-ui font-bold text-xs"
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
                                                        { label: 'Total', value: total, color: 'text-foreground' },
                                                        { label: 'Passed', value: passed, color: 'text-state-success' },
                                                        { label: 'Failed', value: failed, color: 'text-state-danger' },
                                                        { label: 'Blocked', value: blocked, color: 'text-state-warning' },
                                                        { label: 'Pass Rate', value: `${passRate}%`, color: passRate >= 80 ? 'text-state-success' : passRate >= 60 ? 'text-state-warning' : 'text-state-danger' },
                                                    ].map(stat => (
                                                        <div key={stat.label} className="bg-panel-muted border border-ui rounded-2xl p-5">
                                                            <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
                                                            <div className="text-[11px] text-muted-ui font-bold uppercase tracking-widest mt-1">{stat.label}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        })()}
                                        {/* Flaky Tests Section */}
                                        {(() => {
                                            const allCases = testPlans.flatMap(tp => tp.testCases || [])
                                            const caseById = new Map(allCases.map(tc => [tc.id, tc]))
                                            const flakyEntries = Array.from(flakinessMap.entries())
                                                .filter(([, s]) => s.isFlaky)
                                                .sort((a, b) => b[1].flakinessScore - a[1].flakinessScore)
                                                .slice(0, 10)

                                            const dotColor = (r: string) => {
                                                if (r === 'passed') return 'bg-state-success'
                                                if (r === 'failed') return 'bg-state-danger'
                                                if (r === 'blocked') return 'bg-state-warning'
                                                return 'bg-line-strong'
                                            }

                                            return flakyEntries.length > 0 ? (
                                                <div className="space-y-3 pt-6 border-t border-ui">
                                                    <div className="text-[11px] font-black uppercase text-state-warning tracking-widest">⚠ Flaky Tests ({flakyEntries.length})</div>
                                                    {flakyEntries.map(([tcId, stats]) => {
                                                        const tc = caseById.get(tcId)
                                                        if (!tc) return null
                                                        return (
                                                            <div key={tcId} className="bg-state-warning-soft border border-state-warning-border rounded-xl p-4">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="text-sm font-bold text-state-warning truncate">{tc.displayId} — {tc.title}</div>
                                                                    <span className="shrink-0 text-[11px] font-black bg-state-warning/20 text-state-warning px-2 py-0.5 rounded-full">
                                                                        {stats.flakinessScore}% flaky
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <span className="text-[11px] text-muted-ui">Last {stats.lastFiveResults.length} runs:</span>
                                                                    <div className="flex gap-1">
                                                                        {stats.lastFiveResults.map((r, i) => (
                                                                            <span key={i} title={r} className={`inline-block w-2 h-2 rounded-full ${dotColor(r)}`} />
                                                                        ))}
                                                                    </div>
                                                                    <span className="text-[11px] text-muted-ui ml-1">{stats.passRate}% pass rate · {stats.executionCount} runs</span>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : null
                                        })()}

                                        {testPlans.length > 0 && (
                                            <div className="space-y-3 pt-6 border-t border-ui">
                                                <div className="text-[11px] font-black uppercase text-muted-ui tracking-widest">Per Plan Breakdown</div>
                                                {testPlans.filter(tp => !tp.isArchived).map(tp => {
                                                    const tcs = tp.testCases || []
                                                    const p = tcs.filter(tc => tc.status === 'passed').length
                                                    const f = tcs.filter(tc => tc.status === 'failed').length
                                                    const t = tcs.length
                                                    const r = t > 0 ? Math.round(p / t * 100) : 0
                                                    return (
                                                        <div key={tp.id} className="bg-panel-muted border border-ui rounded-xl p-4 flex items-center gap-4">
                                                            <div className="flex-1">
                                                                <div className="text-sm font-bold text-foreground">{tp.name}</div>
                                                                <div className="text-[11px] text-muted-ui mt-0.5">{t} cases · {p} passed · {f} failed</div>
                                                            </div>
                                                            <div className={`text-lg font-black ${r >= 80 ? 'text-state-success' : r >= 60 ? 'text-state-warning' : 'text-state-danger'}`}>{r}%</div>
                                                            <div className="w-24 h-2 bg-elevated rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full ${r >= 80 ? 'bg-state-success' : r >= 60 ? 'bg-state-warning' : 'bg-state-danger'}`} style={{ width: `${r}%` }} />
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}

                                        {/* AI Generation Quality */}
                                        {(() => {
                                            const allCases = testPlans.flatMap(tp => tp.testCases || [])
                                            const aiCases = allCases.filter(tc => tc.aiGenerated)
                                            if (aiCases.length === 0) return null
                                            const rated = aiCases.filter(tc => tc.aiGenerationRating)
                                            const caughtBug = aiCases.filter(tc => tc.aiGenerationRating === 'caught_bug')
                                            const useful = aiCases.filter(tc => tc.aiGenerationRating === 'useful' || tc.aiGenerationRating === 'caught_bug')
                                            const usefulRate = rated.length > 0 ? Math.round(useful.length / rated.length * 100) : 0
                                            return (
                                                <div className="space-y-3 pt-6 border-t border-ui">
                                                    <div className="text-[11px] font-black uppercase text-brand tracking-widest flex items-center gap-2">
                                                        <Sparkles className="h-3 w-3" /> AI Generation Quality
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { label: 'AI Generated', value: aiCases.length, color: 'text-brand' },
                                                            { label: 'Rated', value: `${rated.length} (${aiCases.length > 0 ? Math.round(rated.length / aiCases.length * 100) : 0}%)`, color: 'text-foreground' },
                                                            { label: 'Caught Bugs', value: caughtBug.length, color: 'text-state-warning' },
                                                            { label: 'Useful Rate', value: rated.length > 0 ? `${usefulRate}%` : '—', color: usefulRate >= 60 ? 'text-state-success' : 'text-state-danger' },
                                                        ].map(stat => (
                                                            <div key={stat.label} className="bg-panel-muted border border-ui rounded-xl p-3">
                                                                <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                                                                <div className="text-[11px] text-muted-ui font-bold uppercase tracking-widest mt-0.5">{stat.label}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}
                            </div>
                        )
                    }

                    {
                        activeSubTab === 'CoverageMatrix' && (
                            <Suspense fallback={<SkeletonList rows={6} />}>
                                <CoverageMatrix />
                            </Suspense>
                        )
                    }

                    {
                        activeSubTab === 'RiskMatrix' && (() => {
                            const riskScores = computeRiskScores(testPlans, projectRunSessions, activeProject?.tasks || [])
                            const getRiskColor = (score: number) =>
                                score >= 75 ? 'text-state-danger' : score >= 50 ? 'text-state-warning' : score >= 25 ? 'text-state-info' : 'text-state-success'
                            const getRiskBg = (score: number) =>
                                score >= 75 ? 'bg-state-danger-soft border-state-danger-border' : score >= 50 ? 'bg-state-warning-soft border-state-warning-border' : score >= 25 ? 'bg-state-info-soft border-state-info-border' : 'bg-state-success-soft border-state-success-border'
                            return (
                                <div className="flex-1 flex flex-col min-h-0 bg-app">
                                    <div className="flex-none bg-panel border-b border-ui px-6 py-3 flex items-center gap-4">
                                        <BarChart3 className="h-4 w-4 text-brand" />
                                        <span className="text-[11px] font-extrabold text-muted-ui uppercase tracking-[0.25em]">RISK-BASED TEST PRIORITIZATION</span>
                                        <div className="flex-1" />
                                        <div className="flex items-center gap-3 text-[11px] font-bold">
                                            <span className="text-state-danger">● High Risk</span>
                                            <span className="text-state-warning">● Medium</span>
                                            <span className="text-state-info">● Low</span>
                                            <span className="text-state-success">● Minimal</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                        {riskScores.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                                                <BarChart3 className="h-16 w-16 text-muted-ui" strokeWidth={1} />
                                                <p className="text-xs font-black uppercase tracking-widest text-muted-ui">No test cases to prioritize</p>
                                            </div>
                                        ) : (
                                            <div className="max-w-5xl mx-auto space-y-2">
                                                <div className="text-[11px] text-muted-ui mb-4">
                                                    Scoring: 30% SAP module criticality · 30% historical failure rate · 20% linked defects · 20% linked task priority
                                                </div>
                                                {riskScores.map(({ testCase: tc, planName, riskScore, factors }) => (
                                                    <div key={tc.id} className={cn("rounded-xl border p-4 flex items-start gap-4", getRiskBg(riskScore))}>
                                                        <div className={cn("text-2xl font-black w-12 text-center shrink-0 tabular-nums", getRiskColor(riskScore))}>
                                                            {riskScore}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-bold text-foreground truncate">{tc.displayId} — {tc.title}</span>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-ui">
                                                                <span className="font-mono">{planName}</span>
                                                                {tc.sapModule && <span className="text-brand font-bold">{tc.sapModule}</span>}
                                                                <span>Module crit: <b>{factors.moduleCriticality}</b></span>
                                                                <span>Fail rate: <b>{factors.historicalFailureRate}%</b></span>
                                                                <span>Defects: <b>{factors.linkedDefects / 20}</b></span>
                                                                <span>Task prio: <b>{factors.taskPriority}</b></span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })()
                    }

                    {
                        activeSubTab === 'RegressionBuilder' && (
                            <div className="flex-1 flex flex-col min-h-0 bg-app">
                                {/* Toolbar */}
                                <div className="flex-none bg-panel border-b border-ui px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.2em]">From</span>
                                            <Input 
                                                type="date" 
                                                value={regressionFromDate}
                                                onChange={(e) => setRegressionFromDate(e.target.value)}
                                                className="h-9 w-44 bg-panel-muted border-ui text-xs font-bold text-foreground" 
                                            />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] font-bold text-muted-ui uppercase tracking-[0.2em]">To</span>
                                            <Input 
                                                type="date" 
                                                value={regressionToDate}
                                                onChange={(e) => setRegressionToDate(e.target.value)}
                                                className="h-9 w-44 bg-panel-muted border-ui text-xs font-bold text-foreground" 
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => { setRegressionFromDate(""); setRegressionToDate(""); }}
                                            className="h-9 text-[11px] font-bold text-muted-ui"
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="outline"
                                            className="h-9 px-4 border-ui text-brand font-bold text-xs gap-2 hover:bg-qa-accent/10"
                                            onClick={handleGenerateSmokeSubset}
                                            disabled={isGenerating}
                                        >
                                            <Cpu className="h-3.5 w-3.5" />
                                            {isGenerating ? 'ANALYZING...' : 'REFRESH AI SMOKE'}
                                        </Button>
                                        <Button
                                            className="h-9 px-6 bg-primary text-primary-foreground font-bold text-xs gap-2"
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
                                        {geminiConfigured === false && (
                                            <AiSetupPrompt
                                                featureName="AI Smoke Subset Selection"
                                                description="Connect a Gemini API key to let AI identify the highest-risk test cases for your smoke run — balancing coverage against execution time, weighted by priority and failure history."
                                            />
                                        )}
                                        {builderStatus && (
                                            <div className="bg-state-success-soft border border-state-success-border rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
                                                <div className="flex items-center gap-3">
                                                    <CheckCircle2 className="h-5 w-5 text-state-success" />
                                                    <span className="text-sm font-bold text-state-success">{builderStatus}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => setBuilderStatus(null)} className="h-7 w-7 p-0 text-state-success hover:bg-state-success-soft">
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                        {/* Summary Card */}
                                        <div className="bg-panel border border-ui rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-qa-accent/50 group-hover:w-2 transition-all" />
                                            <div className="space-y-6">
                                                <div>
                                                    <h2 className="text-[11px] font-black text-muted-ui uppercase tracking-[0.3em] mb-2">REGRESSION SUITE PREVIEW</h2>
                                                    <p className="text-xl font-black text-foreground tracking-tight">
                                                        {uniqueSelectedCases.length} unique test case(s) selected
                                                    </p>
                                                    <p className="text-xs text-muted-ui mt-1 font-medium italic opacity-80">
                                                        {regressionFromDate || regressionToDate 
                                                            ? `Filtering Done tasks ${regressionFromDate ? `from ${new Date(regressionFromDate).toLocaleDateString()}` : ""} ${regressionToDate ? `until ${new Date(regressionToDate).toLocaleDateString()}` : ""}`
                                                            : "Aggregating all completed tasks and recent failures."}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-4 gap-4">
                                                    {[
                                                        { label: 'Done-Linked', value: doneLinkedTestCases.length, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-state-success', bg: 'bg-state-success-soft' },
                                                        { label: 'Prev. Failed', value: previouslyFailedTestCases.length, icon: <XCircle className="h-4 w-4" />, color: 'text-state-danger', bg: 'bg-state-danger-soft' },
                                                        { label: 'AI Recommended', value: smokeSubsetTestCases.length, icon: <Cpu className="h-4 w-4" />, color: 'text-brand', bg: 'bg-qa-accent/10' },
                                                        { label: 'Total (Unique)', value: uniqueSelectedCases.length, icon: <Zap className="h-4 w-4" />, color: 'text-state-warning', bg: 'bg-state-warning-soft' },
                                                    ].map((stat) => (
                                                        <div key={stat.label} className="bg-panel-muted border border-ui rounded-xl p-4 flex flex-col items-center text-center group cursor-default transition-all hover:translate-y-[-2px] hover:border-qa-accent/20">
                                                            <div className={cn("p-2 rounded-lg mb-3 shadow-inner transition-colors", stat.bg, stat.color)}>
                                                                {stat.icon}
                                                            </div>
                                                            <div className={cn("text-2xl font-black mb-1", stat.color)}>{stat.value}</div>
                                                            <div className="text-[11px] font-bold text-muted-ui uppercase tracking-widest">{stat.label}</div>
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
                                                    <div className="h-4 w-1 bg-state-success rounded-full" />
                                                    <h3 className="text-xs font-black text-muted-ui uppercase tracking-widest flex items-center gap-2">
                                                        DONE-LINKED TEST CASES <span className="opacity-40 tracking-tighter normal-case font-bold italic ml-2">({doneLinkedTestCases.length})</span>
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {doneLinkedTestCases.length === 0 ? (
                                                        <div className="p-4 bg-surface-alt/40 border border-dashed border-ui rounded-xl text-center text-[11px] font-bold text-muted-ui uppercase tracking-widest">
                                                            No linked test cases for done tasks
                                                        </div>
                                                    ) : (
                                                        doneLinkedTestCases.map(tc => (
                                                            <div key={tc.id} className="bg-panel border border-ui rounded-lg p-3 flex items-center justify-between hover:bg-elevated transition-colors group">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="bg-state-success-soft text-state-success p-1.5 rounded-md self-start shrink-0">
                                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <div className="text-xs font-bold text-foreground tracking-tight group-hover:text-foreground transition-colors truncate">{tc.title}</div>
                                                                        <div className="text-[11px] font-mono text-muted-ui mt-1 uppercase flex items-center gap-2">
                                                                            <span className="text-brand font-bold">{tc.displayId}</span>
                                                                            <span className="opacity-40">·</span>
                                                                            <span>Link ID: {tc.sourceIssueId || 'N/A'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Open test case">
                                                                    <ArrowRightCircle className="h-3.5 w-3.5 text-muted-ui" aria-hidden="true" />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>

                                            {/* Previously Failed Section */}
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-3 pl-1">
                                                    <div className="h-4 w-1 bg-state-danger rounded-full" />
                                                    <h3 className="text-xs font-black text-muted-ui uppercase tracking-widest flex items-center gap-2">
                                                        PREVIOUSLY FAILED <span className="opacity-40 tracking-tighter normal-case font-bold italic ml-2">({previouslyFailedTestCases.length})</span>
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {previouslyFailedTestCases.length === 0 ? (
                                                        <div className="p-4 bg-surface-alt/40 border border-dashed border-ui rounded-xl text-center text-[11px] font-bold text-muted-ui uppercase tracking-widest">
                                                            No failure history found
                                                        </div>
                                                    ) : (
                                                        previouslyFailedTestCases.map(tc => (
                                                            <div key={tc.id} className="bg-panel border border-ui rounded-lg p-3 flex items-center justify-between hover:bg-elevated transition-colors group">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="bg-state-danger-soft text-state-danger p-1.5 rounded-md self-start shrink-0">
                                                                        <XCircle className="h-3.5 w-3.5" />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <div className="text-xs font-bold text-foreground tracking-tight group-hover:text-foreground transition-colors truncate">{tc.title}</div>
                                                                        <div className="text-[11px] font-mono text-muted-ui mt-1 uppercase flex items-center gap-2">
                                                                            <span className="text-brand font-bold">{tc.displayId}</span>
                                                                            <span className="opacity-40">·</span>
                                                                            <span>Last Result: FAILED</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Open test case">
                                                                    <ArrowRightCircle className="h-3.5 w-3.5 text-muted-ui" aria-hidden="true" />
                                                                </Button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </section>

                                            {/* AI Smoke Subset Section */}
                                            <section className="space-y-4">
                                                <div className="flex items-center gap-3 pl-1">
                                                    <div className="h-4 w-1 bg-primary rounded-full" />
                                                    <h3 className="text-xs font-black text-muted-ui uppercase tracking-widest flex items-center gap-2">
                                                        AI RECOMMENDED SMOKE <span className="opacity-40 tracking-tighter normal-case font-bold italic ml-2">({smokeSubsetTestCases.length})</span>
                                                    </h3>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {smokeSubsetTestCases.length === 0 ? (
                                                        <div className="p-6 bg-surface-alt/40 border border-dashed border-ui rounded-xl text-center space-y-3">
                                                            <div className="text-[11px] font-bold text-muted-ui uppercase tracking-widest">Run AI analysis to identify smoke subset</div>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                onClick={handleGenerateSmokeSubset}
                                                                disabled={isGenerating}
                                                                className="h-7 text-[11px] font-black border-ui text-brand hover:bg-qa-accent/10"
                                                            >
                                                                <Cpu className="h-3 w-3 mr-2" /> RUN ANALYSIS
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        smokeSubsetTestCases.map(tc => (
                                                            <div key={tc.id} className="bg-panel border border-ui rounded-lg p-3 flex items-center justify-between hover:bg-elevated transition-colors group">
                                                                <div className="flex items-center gap-3 overflow-hidden">
                                                                    <div className="bg-qa-accent/10 text-brand p-1.5 rounded-md self-start shrink-0">
                                                                        <Zap className="h-3.5 w-3.5" />
                                                                    </div>
                                                                    <div className="overflow-hidden">
                                                                        <div className="text-xs font-bold text-foreground tracking-tight group-hover:text-foreground transition-colors truncate">{tc.title}</div>
                                                                        <div className="text-[11px] font-mono text-muted-ui mt-1 uppercase flex items-center gap-2">
                                                                            <span className="text-brand font-bold">{tc.displayId}</span>
                                                                            <span className="opacity-40">·</span>
                                                                            <span>Confidence: High</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Open test case">
                                                                    <ArrowRightCircle className="h-3.5 w-3.5 text-muted-ui" aria-hidden="true" />
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

                    {activeSubTab === 'AIAccuracy' && (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <Suspense fallback={<SkeletonList rows={5} />}>
                                <AIAccuracyPanel />
                            </Suspense>
                        </div>
                    )}
                </div>

                <Suspense fallback={null}>
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
                    <TestResultImportDialog
                        open={importResultsDialogOpen}
                        onOpenChange={setImportResultsDialogOpen}
                    />
                </Suspense>
            </PageScaffold>
        </>
    )
}
