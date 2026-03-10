import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useProjectStore } from "@/store/useProjectStore"
import { TestCase, TestPlan, SapModule, TestCasePriority } from "@/types/project"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { FlaskConical, Clipboard, CheckCircle2, XCircle, Info, Database, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import FormattedText from "./FormattedText"

interface TestCaseDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    activePlan: TestPlan | null
    editingCase: TestCase | null
}

const SAP_MODULES: SapModule[] = ['Cart', 'Checkout', 'Pricing', 'Promotions', 'CatalogSync', 'B2B', 'OMS', 'Personalization', 'CPQ']

export default function TestCaseDialog({ open, onOpenChange, activePlan, editingCase }: TestCaseDialogProps) {
    const { activeProjectId, addTestCase, updateTestCase } = useProjectStore()

    const [form, setForm] = useState({
        title: "",
        preConditions: "",
        steps: "",
        testData: "",
        expectedResult: "",
        actualResult: "",
        priority: "medium" as TestCasePriority,
        status: "not-run" as TestCase['status'],
        sapModule: undefined as SapModule | undefined,
        sourceIssueId: "",
        assignedTo: "",
        estimatedMinutes: 0,
        tags: "" // comma separated for input
    })
    const [previewField, setPreviewField] = useState<string | null>(null)

    useEffect(() => {
        if (editingCase) {
            setForm({
                title: editingCase.title,
                preConditions: editingCase.preConditions,
                steps: editingCase.steps,
                testData: editingCase.testData,
                expectedResult: editingCase.expectedResult,
                actualResult: editingCase.actualResult,
                priority: editingCase.priority,
                status: editingCase.status,
                sapModule: editingCase.sapModule,
                sourceIssueId: editingCase.sourceIssueId || "",
                assignedTo: editingCase.assignedTo || "",
                estimatedMinutes: editingCase.estimatedMinutes || 0,
                tags: editingCase.tags ? editingCase.tags.join(", ") : ""
            })
        } else {
            setForm({
                title: "",
                preConditions: "",
                steps: "",
                testData: "",
                expectedResult: "",
                actualResult: "",
                priority: "medium",
                status: "not-run",
                sapModule: undefined,
                sourceIssueId: "",
                assignedTo: "",
                estimatedMinutes: 0,
                tags: ""
            })
        }
    }, [editingCase, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeProjectId || !activePlan || !form.title.trim()) return

        const submissionData = {
            ...form,
            tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            estimatedMinutes: Number(form.estimatedMinutes) || 0
        }

        if (editingCase) {
            await updateTestCase(activeProjectId, activePlan.id, editingCase.id, submissionData)
        } else {
            await addTestCase(activeProjectId, activePlan.id, submissionData)
        }
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0 border-none shadow-2xl">
                <div className="h-2 bg-indigo-500 w-full" />
                <form onSubmit={handleSubmit} className="p-8">
                    <DialogHeader className="mb-6">
                        <div className="flex items-center gap-3 text-indigo-500 mb-2">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <FlaskConical className="h-6 w-6" />
                            </div>
                            <DialogTitle className="text-2xl font-black tracking-tight">
                                {editingCase ? `Edit ${editingCase.displayId}` : "Create New Test Case"}
                            </DialogTitle>
                        </div>
                        <DialogDescription>
                            Define clear acceptance criteria and steps for reliable quality assurance.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="case-title" className="text-xs font-bold uppercase text-muted-foreground px-1">Case Summary</Label>
                            <Input
                                id="case-title"
                                value={form.title}
                                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="[SAP-123] Verify discount application on checkout"
                                className="bg-background/50 h-11 text-lg font-semibold focus-visible:ring-indigo-500/40"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="assigned-to" className="text-xs font-bold uppercase text-muted-foreground px-1">Assigned Tester</Label>
                                <Input
                                    id="assigned-to"
                                    value={form.assignedTo}
                                    onChange={(e) => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                                    placeholder="Tester Name"
                                    className="bg-background/50 h-10"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="est-mins" className="text-xs font-bold uppercase text-muted-foreground px-1">Estimate (min)</Label>
                                <Input
                                    id="est-mins"
                                    type="number"
                                    value={form.estimatedMinutes}
                                    onChange={(e) => setForm(f => ({ ...f, estimatedMinutes: parseInt(e.target.value) || 0 }))}
                                    className="bg-background/50 h-10"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="tags" className="text-xs font-bold uppercase text-muted-foreground px-1">Tags (Labeling)</Label>
                                <Input
                                    id="tags"
                                    value={form.tags}
                                    onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                                    placeholder="smoke, reg, checkout"
                                    className="bg-background/50 h-10"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground px-1">Priority</Label>
                                <Select
                                    value={form.priority}
                                    onValueChange={(v: any) => setForm(f => ({ ...f, priority: v }))}
                                >
                                    <SelectTrigger className="bg-background/50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="major">Major</SelectItem>
                                        <SelectItem value="blocker">Blocker</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-xs font-bold uppercase text-muted-foreground px-1">SAP Module</Label>
                                <Select
                                    value={form.sapModule || "none"}
                                    onValueChange={(v: any) => setForm(f => ({ ...f, sapModule: v === "none" ? undefined : v }))}
                                >
                                    <SelectTrigger className="bg-background/50">
                                        <SelectValue placeholder="General" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">General / Core</SelectItem>
                                        {SAP_MODULES.map(m => (
                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="source-id" className="text-xs font-bold uppercase text-muted-foreground px-1">Source ID</Label>
                                <Input
                                    id="source-id"
                                    value={form.sourceIssueId}
                                    onChange={(e) => setForm(f => ({ ...f, sourceIssueId: e.target.value }))}
                                    placeholder="Jira/Linear ID"
                                    className="bg-background/50"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="case-pre" className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                    <Info className="h-3 w-3" /> Pre-conditions
                                </Label>
                                <div className="relative group">
                                    <Textarea
                                        id="case-pre"
                                        value={form.preConditions}
                                        onChange={(e) => setForm(f => ({ ...f, preConditions: e.target.value }))}
                                        placeholder="User session active, cart populated..."
                                        className={cn("bg-background/50 resize-none min-h-[100px]", previewField === 'pre' && "hidden")}
                                    />
                                    {previewField === 'pre' && (
                                        <div className="bg-background/50 rounded-md p-3 min-h-[100px] border border-input text-sm">
                                            <FormattedText content={form.preConditions} projectId={activeProjectId || undefined} source={activePlan?.source} />
                                        </div>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-2 top-2 h-7 px-2 text-[10px] font-bold"
                                        onClick={() => setPreviewField(previewField === 'pre' ? null : 'pre')}
                                    >
                                        {previewField === 'pre' ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                                        {previewField === 'pre' ? 'EDITOR' : 'PREVIEW'}
                                    </Button>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="case-data" className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                    <Database className="h-3 w-3" /> Test Data
                                </Label>
                                <div className="relative group">
                                    <Textarea
                                        id="case-data"
                                        value={form.testData}
                                        onChange={(e) => setForm(f => ({ ...f, testData: e.target.value }))}
                                        placeholder="Username: test_qa_01&#10;SKU: 13948..."
                                        className={cn("bg-background/50 resize-none min-h-[100px]", previewField === 'data' && "hidden")}
                                    />
                                    {previewField === 'data' && (
                                        <div className="bg-background/50 rounded-md p-3 min-h-[100px] border border-input text-sm">
                                            <FormattedText content={form.testData} projectId={activeProjectId || undefined} source={activePlan?.source} />
                                        </div>
                                    )}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-2 top-2 h-7 px-2 text-[10px] font-bold"
                                        onClick={() => setPreviewField(previewField === 'data' ? null : 'data')}
                                    >
                                        {previewField === 'data' ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                                        {previewField === 'data' ? 'EDITOR' : 'PREVIEW'}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-2 relative group">
                            <Label htmlFor="case-steps" className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                                <Clipboard className="h-3 w-3" /> Execution Steps
                            </Label>
                            <Textarea
                                id="case-steps"
                                value={form.steps}
                                onChange={(e) => setForm(f => ({ ...f, steps: e.target.value }))}
                                placeholder="1. Navigate to checkout&#10;2. Apply coupon SUMMER24&#10;3. Verify subtotal..."
                                className={cn("bg-background/50 min-h-[120px] font-mono text-sm", previewField === 'steps' && "hidden")}
                            />
                            {previewField === 'steps' && (
                                <div className="bg-background/50 rounded-md p-3 min-h-[120px] border border-input text-sm">
                                    <FormattedText content={form.steps} projectId={activeProjectId || undefined} source={activePlan?.source} />
                                </div>
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-2 top-8 h-7 px-2 text-[10px] font-bold"
                                onClick={() => setPreviewField(previewField === 'steps' ? null : 'steps')}
                            >
                                {previewField === 'steps' ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                                {previewField === 'steps' ? 'EDITOR' : 'PREVIEW'}
                            </Button>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="case-expected" className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2 text-green-600">
                                    <CheckCircle2 className="h-3 w-3" /> Expected Result
                                </Label>
                                <Textarea
                                    id="case-expected"
                                    value={form.expectedResult}
                                    onChange={(e) => setForm(f => ({ ...f, expectedResult: e.target.value }))}
                                    placeholder="Success message displayed, total reduced by 20%"
                                    className="bg-green-50/10 border-green-500/20 text-green-700 dark:text-green-400 min-h-[100px]"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="case-actual" className="text-xs font-bold uppercase text-muted-foreground px-1 flex items-center gap-2 text-red-600">
                                    <XCircle className="h-3 w-3" /> Actual Result
                                </Label>
                                <Textarea
                                    id="case-actual"
                                    value={form.actualResult}
                                    onChange={(e) => setForm(f => ({ ...f, actualResult: e.target.value }))}
                                    placeholder="Populated automatically during test runs"
                                    className="bg-red-50/10 border-red-500/20 text-red-700 dark:text-red-400 min-h-[100px]"
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-10 pt-6 border-t border-border/50 gap-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-600/20 px-8">
                            {editingCase ? "Update Telemetry" : "Publish Case"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
