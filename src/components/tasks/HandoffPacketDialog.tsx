import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Project, Task, HandoffPacket, HandoffType } from '@/types/project'
import { getHandoffMissingFields } from '@/lib/collaboration'

type HandoffTemplate = {
    id: string
    label: string
    type: HandoffType
    severity: Task['severity']
    reproStepsTemplate: string
    expectedResultTemplate: string
    actualResultTemplate: string
}

const HANDOFF_TEMPLATES: HandoffTemplate[] = [
    {
        id: 'ui_bug',
        label: 'UI Bug',
        type: 'bug_handoff',
        severity: 'minor',
        reproStepsTemplate: '1. Navigate to [page/component]\n2. [Perform action]\n3. Observe the visual issue\n\nBrowser: [browser + version]\nScreen resolution: [resolution]\nZoom level: [zoom]',
        expectedResultTemplate: 'The UI element [description] should display correctly with proper styling, alignment, and responsive behaviour.',
        actualResultTemplate: 'The UI element [description] appears [misaligned / unstyled / broken] — see attached screenshot for details.',
    },
    {
        id: 'api_error',
        label: 'API / Backend Error',
        type: 'bug_handoff',
        severity: 'major',
        reproStepsTemplate: '1. Authenticate as [user type]\n2. Call endpoint: [METHOD] [endpoint]\n3. Request body (if applicable):\n   [paste JSON]\n4. Observe the error response',
        expectedResultTemplate: 'The API returns HTTP 200 with a valid response body conforming to the documented schema.',
        actualResultTemplate: 'The API returns HTTP [status] with error: [error message / code]. Full response body attached.',
    },
    {
        id: 'data_issue',
        label: 'Data / ImpEx Issue',
        type: 'bug_handoff',
        severity: 'major',
        reproStepsTemplate: '1. Import the attached ImpEx / run the data setup script\n2. Navigate to [catalog / product / order]\n3. Verify the data attributes listed below\n\nAffected items: [codes or IDs]',
        expectedResultTemplate: 'The data attributes [list] should reflect the values defined in the ImpEx / data script.',
        actualResultTemplate: 'Attribute [name] shows [actual value] instead of [expected value]. FlexSearch query result attached.',
    },
    {
        id: 'performance',
        label: 'Performance Issue',
        type: 'bug_handoff',
        severity: 'major',
        reproStepsTemplate: '1. Environment: [env name, CCv2 / local]\n2. Navigate to [page]\n3. Perform action: [description]\n4. Measure response time using [browser DevTools / Dynatrace / etc.]\n\nLoad conditions: [user count / product count]',
        expectedResultTemplate: 'Page / operation should complete within [X] ms under [Y] concurrent users.',
        actualResultTemplate: 'Observed response time: [actual ms]. HAR file / trace attached. Notable bottleneck: [description].',
    },
    {
        id: 'security',
        label: 'Security / Access Control',
        type: 'bug_handoff',
        severity: 'critical',
        reproStepsTemplate: '1. Log in as [role / permission group]\n2. Attempt to access [resource / endpoint]\n3. Observe that access is [granted / not revoked properly]\n\nUser UID: [uid]\nTest environment: [env name]',
        expectedResultTemplate: 'Users with [role] should NOT have access to [resource]. A 403 / redirect to login should be returned.',
        actualResultTemplate: 'User with [role] was able to [access / modify] [resource] without appropriate permissions.',
    },
]

interface HandoffPacketDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    activeProject: Project
    task: Task
    handoff?: HandoffPacket
    onSave: (payload: {
        type: HandoffType
        summary: string
        reproSteps: string
        expectedResult: string
        actualResult: string
        severity?: Task['severity']
        branchName?: string
        releaseVersion?: string
        environmentId?: string
        environmentName?: string
        linkedTestCaseIds: string[]
        linkedNoteIds: string[]
        linkedFileIds: string[]
    }) => Promise<void>
}

export function HandoffPacketDialog({ open, onOpenChange, activeProject, task, handoff, onSave }: HandoffPacketDialogProps) {
    const [type, setType] = useState<HandoffType>('bug_handoff')
    const [summary, setSummary] = useState('')
    const [reproSteps, setReproSteps] = useState('')
    const [expectedResult, setExpectedResult] = useState('')
    const [actualResult, setActualResult] = useState('')
    const [severity, setSeverity] = useState<Task['severity']>('major')
    const [branchName, setBranchName] = useState('')
    const [releaseVersion, setReleaseVersion] = useState('')
    const [environmentId, setEnvironmentId] = useState('')
    const [linkedTestCaseIds, setLinkedTestCaseIds] = useState<string[]>([])
    const [linkedNoteIds, setLinkedNoteIds] = useState<string[]>([])
    const [linkedFileIds, setLinkedFileIds] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)

    const applyTemplate = (templateId: string) => {
        const template = HANDOFF_TEMPLATES.find(t => t.id === templateId)
        if (!template) return
        setType(template.type)
        setSeverity(template.severity)
        setReproSteps(template.reproStepsTemplate)
        setExpectedResult(template.expectedResultTemplate)
        setActualResult(template.actualResultTemplate)
    }

    const environments = activeProject.environments || []
    const allTestCases = activeProject.testPlans.flatMap((plan) => plan.testCases || [])

    useEffect(() => {
        if (!open) return
        setType(handoff?.type || 'bug_handoff')
        setSummary(handoff?.summary || task.title)
        setReproSteps(handoff?.reproSteps || task.description || '')
        setExpectedResult(handoff?.expectedResult || '')
        setActualResult(handoff?.actualResult || '')
        setSeverity(handoff?.severity || task.severity || 'major')
        setBranchName(handoff?.branchName || '')
        setReleaseVersion(handoff?.releaseVersion || task.version || '')
        setEnvironmentId(handoff?.environmentId || environments.find((item) => item.isDefault)?.id || '')
        setLinkedTestCaseIds(handoff?.linkedTestCaseIds || [])
        setLinkedNoteIds(handoff?.linkedNoteIds || [])
        setLinkedFileIds(handoff?.linkedFileIds || [])
    }, [open, handoff, task, environments])

    const environmentName = environments.find((item) => item.id === environmentId)?.name
    const missingFields = getHandoffMissingFields({
        summary,
        reproSteps,
        expectedResult,
        actualResult,
        environmentId,
        environmentName,
        severity,
        linkedNoteIds,
        linkedFileIds,
    })

    const toggleValue = (value: string, values: string[], setter: (next: string[]) => void) => {
        setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await onSave({
                type,
                summary,
                reproSteps,
                expectedResult,
                actualResult,
                severity,
                branchName,
                releaseVersion,
                environmentId: environmentId || undefined,
                environmentName,
                linkedTestCaseIds,
                linkedNoteIds,
                linkedFileIds
            })
            onOpenChange(false)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[760px] bg-[#13131A] border-[#2A2A3A] text-[#E2E8F0]">
                <DialogHeader>
                    <DialogTitle>{handoff ? 'Edit Handoff Packet' : 'Create Handoff Packet'}</DialogTitle>
                    <DialogDescription className="text-[#6B7280]">
                        Capture structured repro details, environment, and linked evidence for {task.title}.
                    </DialogDescription>
                </DialogHeader>

                {!handoff && (
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-3 flex items-center gap-3">
                        <span className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest shrink-0">Template</span>
                        <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}
                            className="flex-1 h-8 rounded-md bg-[#1A1A24] border border-[#2A2A3A] px-2 text-xs text-[#E2E8F0] focus:outline-none"
                        >
                            <option value="">Apply a template (optional)...</option>
                            {HANDOFF_TEMPLATES.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                    <div className="space-y-2">
                        <Label>Type</Label>
                        <select value={type} onChange={(event) => setType(event.target.value as HandoffType)} className="h-10 w-full rounded-md bg-[#0F0F13] border border-[#2A2A3A] px-3 text-sm">
                            <option value="bug_handoff">Bug Handoff</option>
                            <option value="fix_handoff">Fix Handoff</option>
                            <option value="retest_request">Retest Request</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Environment</Label>
                        <select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} className="h-10 w-full rounded-md bg-[#0F0F13] border border-[#2A2A3A] px-3 text-sm">
                            <option value="">Select environment</option>
                            {environments.map((environment) => (
                                <option key={environment.id} value={environment.id}>{environment.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Severity</Label>
                        <select value={severity || 'major'} onChange={(event) => setSeverity(event.target.value as Task['severity'])} className="h-10 w-full rounded-md bg-[#0F0F13] border border-[#2A2A3A] px-3 text-sm">
                            <option value="cosmetic">Cosmetic</option>
                            <option value="minor">Minor</option>
                            <option value="major">Major</option>
                            <option value="critical">Critical</option>
                            <option value="blocker">Blocker</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Branch Name</Label>
                        <Input value={branchName} onChange={(event) => setBranchName(event.target.value)} placeholder="fix/checkout-null-guard" className="bg-[#0F0F13] border-[#2A2A3A]" />
                    </div>
                    <div className="space-y-2">
                        <Label>Release Version</Label>
                        <Input value={releaseVersion} onChange={(event) => setReleaseVersion(event.target.value)} placeholder="2026.03-hotfix-1" className="bg-[#0F0F13] border-[#2A2A3A]" />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                        <Label>Summary</Label>
                        <Input value={summary} onChange={(event) => setSummary(event.target.value)} className="bg-[#0F0F13] border-[#2A2A3A]" />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                        <Label>Repro Steps</Label>
                        <Textarea value={reproSteps} onChange={(event) => setReproSteps(event.target.value)} className="min-h-[120px] bg-[#0F0F13] border-[#2A2A3A]" />
                    </div>

                    <div className="space-y-2">
                        <Label>Expected Result</Label>
                        <Textarea value={expectedResult} onChange={(event) => setExpectedResult(event.target.value)} className="min-h-[110px] bg-[#0F0F13] border-[#2A2A3A]" />
                    </div>
                    <div className="space-y-2">
                        <Label>Actual Result</Label>
                        <Textarea value={actualResult} onChange={(event) => setActualResult(event.target.value)} className="min-h-[110px] bg-[#0F0F13] border-[#2A2A3A]" />
                    </div>

                    <div className="space-y-2">
                        <Label>Linked Test Cases</Label>
                        <div className="max-h-36 overflow-y-auto rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-2 space-y-2">
                            {allTestCases.map((testCase) => (
                                <label key={testCase.id} className="flex items-center gap-2 text-xs">
                                    <input type="checkbox" checked={linkedTestCaseIds.includes(testCase.id)} onChange={() => toggleValue(testCase.id, linkedTestCaseIds, setLinkedTestCaseIds)} />
                                    <span>{testCase.displayId} - {testCase.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Linked Notes</Label>
                        <div className="max-h-36 overflow-y-auto rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-2 space-y-2">
                            {activeProject.notes.map((note) => (
                                <label key={note.id} className="flex items-center gap-2 text-xs">
                                    <input type="checkbox" checked={linkedNoteIds.includes(note.id)} onChange={() => toggleValue(note.id, linkedNoteIds, setLinkedNoteIds)} />
                                    <span>{note.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                        <Label>Linked Files</Label>
                        <div className="max-h-36 overflow-y-auto rounded-md border border-[#2A2A3A] bg-[#0F0F13] p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {activeProject.files.map((file) => (
                                <label key={file.id} className="flex items-center gap-2 text-xs">
                                    <input type="checkbox" checked={linkedFileIds.includes(file.id)} onChange={() => toggleValue(file.id, linkedFileIds, setLinkedFileIds)} />
                                    <span>{file.fileName}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Required Before Send</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {missingFields.length === 0 ? (
                            <span className="rounded-full bg-[#10B981]/10 px-2 py-1 text-[10px] font-bold uppercase text-[#10B981]">Complete</span>
                        ) : missingFields.map((field) => (
                            <span key={field} className="rounded-full bg-[#EF4444]/10 px-2 py-1 text-[10px] font-bold uppercase text-[#EF4444]">
                                Missing {field}
                            </span>
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving} className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]">
                        {isSaving ? 'Saving...' : 'Save Packet'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
