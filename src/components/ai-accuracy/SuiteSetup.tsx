import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AccuracyTestSuite, ReferenceDocument } from "@/types/project"
import { QaPairImportDialog } from "./QaPairImportDialog"
import {
    Upload, Trash2, FileText, Plus, FilePlus,
    X, Play, Loader2, AlertCircle, Zap
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SuiteSetupProps {
    suite: AccuracyTestSuite
    isEvaluating: boolean
    evalProgress: { completed: number; total: number; currentQuestion?: string } | null
    onAddDoc: (filePath: string, fileName: string, mimeType: string, fileSizeBytes: number) => Promise<void>
    onRemoveDoc: (docId: string) => void
    onAddPair: (question: string, agentResponse: string, expectedAnswer?: string) => Promise<void>
    onBatchAddPairs: (pairs: Array<{ question: string; agentResponse: string; sourceLabel: string; expectedAnswer?: string }>) => Promise<void>
    onRemovePair: (pairId: string) => void
    onRunEvaluation: () => void
    onToggleHighAccuracyMode: (enabled: boolean) => void
}

function DocRow({ doc, onRemove }: { doc: ReferenceDocument; onRemove: () => void }) {
    const ext = doc.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
    return (
        <div className="flex items-center gap-3 p-3 bg-panel border border-ui rounded-lg group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-qa-accent/10 shrink-0">
                <FileText className="h-4 w-4 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{doc.fileName}</p>
                <p className="text-[11px] text-muted-ui mt-0.5">
                    {ext} · {(doc.fileSizeBytes / 1024).toFixed(1)} KB
                    {doc.chunkCount > 0 && ` · ${doc.chunkCount} chunks`}
                </p>
            </div>
            <Button
                variant="ghost" size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-ui hover:text-state-danger"
                onClick={onRemove}
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}

function AddPairForm({ onAdd, onCancel }: { onAdd: (q: string, r: string, expected?: string) => Promise<void>; onCancel: () => void }) {
    const [question, setQuestion] = useState('')
    const [response, setResponse] = useState('')
    const [expectedAnswer, setExpectedAnswer] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        if (!question.trim() || !response.trim()) return
        setSaving(true)
        await onAdd(question.trim(), response.trim(), expectedAnswer.trim() || undefined)
        setSaving(false)
        onCancel()
    }

    return (
        <div className="border border-qa-accent/30 rounded-xl p-4 bg-panel space-y-3">
            <div>
                <label className="text-[11px] font-bold text-muted-ui uppercase tracking-widest block mb-1.5">Question (asked to the chatbot)</label>
                <Textarea
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="What is the return policy?"
                    className="bg-panel-muted border-ui text-xs text-foreground resize-none h-20"
                />
            </div>
            <div>
                <label className="text-[11px] font-bold text-muted-ui uppercase tracking-widest block mb-1.5">Agent Response (copy from the website)</label>
                <Textarea
                    value={response}
                    onChange={e => setResponse(e.target.value)}
                    placeholder="Paste the chatbot's response here..."
                    className="bg-panel-muted border-ui text-xs text-foreground resize-none h-28"
                />
            </div>
            <div>
                <label className="text-[11px] font-bold text-muted-ui uppercase tracking-widest block mb-1.5">
                    Expected Answer <span className="text-text-muted/60 normal-case font-normal">(optional — human-verified correct answer)</span>
                </label>
                <Textarea
                    value={expectedAnswer}
                    onChange={e => setExpectedAnswer(e.target.value)}
                    placeholder="Provide the correct answer as written by a human expert…"
                    className="bg-panel-muted border-ui text-xs text-foreground resize-none h-20"
                />
            </div>
            <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 text-muted-ui">
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button
                    size="sm"
                    disabled={!question.trim() || !response.trim() || saving}
                    onClick={handleSave}
                    className="h-8 bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-bold"
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Add Pair
                </Button>
            </div>
        </div>
    )
}

export function SuiteSetup({
    suite, isEvaluating, evalProgress,
    onAddDoc, onRemoveDoc,
    onAddPair, onBatchAddPairs, onRemovePair,
    onRunEvaluation, onToggleHighAccuracyMode
}: SuiteSetupProps) {
    const [showAddForm, setShowAddForm] = useState(false)
    const [showImportDialog, setShowImportDialog] = useState(false)
    const [isUploadingDoc, setIsUploadingDoc] = useState(false)
    const [docError, setDocError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setDocError(null)
        setIsUploadingDoc(true)
        try {
            const result = await window.electronAPI.copyToAttachments((file as File & { path: string }).path || '')
            if (!result.success || !result.attachment) throw new Error(result.error || 'Failed to copy attachment')
            await onAddDoc(result.attachment.filePath, file.name, file.type || 'application/octet-stream', file.size)
        } catch (err: unknown) {
            setDocError(err instanceof Error ? err.message : 'Failed to upload document')
        } finally {
            setIsUploadingDoc(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleSelectDoc = async () => {
        setDocError(null)
        setIsUploadingDoc(true)
        try {
            const result: any = await window.electronAPI.selectFile([
                { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx'] },
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'All Files', extensions: ['*'] }
            ])
            if (!result) { setIsUploadingDoc(false); return }
            // result is a file path string from Electron dialog
            const filePath = typeof result === 'string' ? result : result.filePath
            const fileName = filePath.split(/[\\/]/).pop() ?? 'document'
            const mimeType = getMimeFromExt(fileName)
            // Read to get document text and chunk count
            const readResult = await window.electronAPI.readDocumentText({ filePath })
            if (!readResult.success) throw new Error(readResult.error ?? 'Cannot read document')
            await onAddDoc(filePath, fileName, mimeType, 0)
        } catch (err: unknown) {
            setDocError(err instanceof Error ? err.message : 'Failed to add document')
        } finally {
            setIsUploadingDoc(false)
        }
    }

    const canRunEval = suite.referenceDocuments.length > 0 && suite.qaPairs.length > 0 && !isEvaluating

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Reference Documents */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-xs font-bold text-foreground">Reference Documents</p>
                        <p className="text-[11px] text-muted-ui mt-0.5">
                            Upload the knowledge base documents that the chatbot uses.
                        </p>
                    </div>
                    <Button
                        variant="outline" size="sm"
                        disabled={isUploadingDoc}
                        onClick={handleSelectDoc}
                        className="h-8 text-[11px] font-bold border-ui text-brand hover:bg-qa-accent/10"
                    >
                        {isUploadingDoc
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            : <Upload className="h-3.5 w-3.5 mr-1" />
                        }
                        Add Document
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={handleDocUpload} />
                </div>

                {docError && (
                    <div className="flex items-start gap-2 p-3 bg-state-danger-soft border border-state-danger-border rounded-lg mb-3">
                        <AlertCircle className="h-4 w-4 text-state-danger shrink-0 mt-0.5" />
                        <p className="text-xs text-state-danger">{docError}</p>
                    </div>
                )}

                {suite.referenceDocuments.length === 0 ? (
                    <div className="border-2 border-dashed border-ui rounded-xl p-8 text-center">
                        <FileText className="h-8 w-8 text-text-muted/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-ui">No reference documents added yet</p>
                        <p className="text-[11px] text-text-muted/60 mt-1">Supports .txt, .md, .pdf, .docx</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {suite.referenceDocuments.map(doc => (
                            <DocRow key={doc.id} doc={doc} onRemove={() => onRemoveDoc(doc.id)} />
                        ))}
                    </div>
                )}
            </section>

            {/* QA Pairs */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-xs font-bold text-foreground">Q&amp;A Pairs</p>
                        <p className="text-[11px] text-muted-ui mt-0.5">
                            Questions asked to the chatbot and its responses — copied from the website.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline" size="sm"
                            onClick={() => setShowImportDialog(true)}
                            className="h-8 text-[11px] font-bold border-ui text-muted-ui hover:text-foreground"
                        >
                            <FilePlus className="h-3.5 w-3.5 mr-1" /> Import CSV
                        </Button>
                        <Button
                            variant="outline" size="sm"
                            onClick={() => setShowAddForm(true)}
                            className="h-8 text-[11px] font-bold border-ui text-brand hover:bg-qa-accent/10"
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Pair
                        </Button>
                    </div>
                </div>

                {showAddForm && (
                    <div className="mb-3">
                        <AddPairForm
                            onAdd={onAddPair}
                            onCancel={() => setShowAddForm(false)}
                        />
                    </div>
                )}

                {suite.qaPairs.length === 0 && !showAddForm ? (
                    <div className="border-2 border-dashed border-ui rounded-xl p-8 text-center">
                        <p className="text-xs text-muted-ui">No Q&amp;A pairs added yet</p>
                        <p className="text-[11px] text-text-muted/60 mt-1">
                            Add pairs manually or import from a CSV with &quot;question&quot; and &quot;response&quot; columns.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {suite.qaPairs.map((pair, idx) => (
                            <div key={pair.id} className="flex items-start gap-3 p-3 bg-panel border border-ui rounded-lg group">
                                <span className="text-[11px] font-mono text-muted-ui mt-0.5 w-5 shrink-0 text-right">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-foreground truncate">{pair.question}</p>
                                    <p className="text-[11px] text-muted-ui truncate mt-0.5">{pair.agentResponse}</p>
                                    {pair.expectedAnswer && (
                                        <p className="text-[11px] text-state-success/70 truncate mt-0.5">
                                            <span className="font-bold">Expected:</span> {pair.expectedAnswer}
                                        </p>
                                    )}
                                    {pair.sourceLabel && (
                                        <p className="text-[11px] text-text-muted/60 mt-0.5 italic">{pair.sourceLabel}</p>
                                    )}
                                </div>
                                <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-ui hover:text-state-danger shrink-0"
                                    onClick={() => onRemovePair(pair.id)}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Run Evaluation */}
            <section className="border-t border-ui pt-6">
                {isEvaluating && evalProgress && (
                    <div className="mb-4 p-4 bg-qa-accent/5 border border-qa-accent/20 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                                <span className="text-xs font-bold text-brand">Evaluating…</span>
                            </div>
                            <span className="text-[11px] text-muted-ui">
                                {evalProgress.completed} / {evalProgress.total} pairs
                            </span>
                        </div>
                        <div className="w-full bg-panel-muted rounded-full h-1.5 overflow-hidden mb-2">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: evalProgress.total > 0 ? `${(evalProgress.completed / evalProgress.total) * 100}%` : '0%' }}
                            />
                        </div>
                        {evalProgress.currentQuestion && (
                            <p className="text-[11px] text-muted-ui truncate italic">{evalProgress.currentQuestion}</p>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-foreground">Run Evaluation</p>
                        <p className="text-[11px] text-muted-ui mt-0.5">
                            {suite.referenceDocuments.length} document{suite.referenceDocuments.length !== 1 ? 's' : ''} ·{' '}
                            {suite.qaPairs.length} Q&amp;A pair{suite.qaPairs.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* High accuracy mode toggle */}
                        <button
                            type="button"
                            onClick={() => onToggleHighAccuracyMode(!suite.highAccuracyMode)}
                            disabled={isEvaluating}
                            className={cn(
                                "flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-bold transition-colors",
                                suite.highAccuracyMode
                                    ? "border-state-warning/40 bg-state-warning-soft text-state-warning"
                                    : "border-ui text-muted-ui hover:text-foreground"
                            )}
                            title="High accuracy mode runs claim verification twice and merges results for greater consistency. Uses 2× API calls for verification."
                        >
                            <Zap className="h-3 w-3" />
                            High Accuracy
                        </button>
                        <Button
                            disabled={!canRunEval}
                            onClick={onRunEvaluation}
                            className={cn(
                                "font-bold",
                                canRunEval
                                    ? "bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground"
                                    : "bg-elevated text-muted-ui cursor-not-allowed"
                            )}
                        >
                            {isEvaluating
                                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Evaluating…</>
                                : <><Play className="h-4 w-4 mr-2" /> Run Evaluation</>
                            }
                        </Button>
                    </div>
                </div>

                {!canRunEval && !isEvaluating && (
                    <p className="text-[11px] text-muted-ui mt-2">
                        {suite.referenceDocuments.length === 0 && '⚠ Add at least one reference document. '}
                        {suite.qaPairs.length === 0 && '⚠ Add at least one Q&A pair.'}
                    </p>
                )}
            </section>

            <QaPairImportDialog
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
                onImport={onBatchAddPairs}
            />
        </div>
    )
}

function getMimeFromExt(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
        case 'pdf': return 'application/pdf'
        case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        case 'md': return 'text/markdown'
        default: return 'text/plain'
    }
}
