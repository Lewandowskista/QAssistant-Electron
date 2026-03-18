import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { AccuracyTestSuite, ReferenceDocument } from "@/types/project"
import { QaPairImportDialog } from "./QaPairImportDialog"
import {
    Upload, Trash2, FileText, Plus, FilePlus,
    X, Play, Loader2, AlertCircle
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
}

function DocRow({ doc, onRemove }: { doc: ReferenceDocument; onRemove: () => void }) {
    const ext = doc.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'
    return (
        <div className="flex items-center gap-3 p-3 bg-[#13131A] border border-[#2A2A3A] rounded-lg group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#A78BFA]/10 shrink-0">
                <FileText className="h-4 w-4 text-[#A78BFA]" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#E2E8F0] truncate">{doc.fileName}</p>
                <p className="text-[9px] text-[#6B7280] mt-0.5">
                    {ext} · {(doc.fileSizeBytes / 1024).toFixed(1)} KB
                    {doc.chunkCount > 0 && ` · ${doc.chunkCount} chunks`}
                </p>
            </div>
            <Button
                variant="ghost" size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-[#6B7280] hover:text-red-400"
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
        <div className="border border-[#A78BFA]/30 rounded-xl p-4 bg-[#13131A] space-y-3">
            <div>
                <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest block mb-1.5">Question (asked to the chatbot)</label>
                <Textarea
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="What is the return policy?"
                    className="bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0] resize-none h-20"
                />
            </div>
            <div>
                <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest block mb-1.5">Agent Response (copy from the website)</label>
                <Textarea
                    value={response}
                    onChange={e => setResponse(e.target.value)}
                    placeholder="Paste the chatbot's response here..."
                    className="bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0] resize-none h-28"
                />
            </div>
            <div>
                <label className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest block mb-1.5">
                    Expected Answer <span className="text-[#6B7280]/60 normal-case font-normal">(optional — human-verified correct answer)</span>
                </label>
                <Textarea
                    value={expectedAnswer}
                    onChange={e => setExpectedAnswer(e.target.value)}
                    placeholder="Provide the correct answer as written by a human expert…"
                    className="bg-[#1A1A24] border-[#2A2A3A] text-xs text-[#E2E8F0] resize-none h-20"
                />
            </div>
            <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 text-[#6B7280]">
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button
                    size="sm"
                    disabled={!question.trim() || !response.trim() || saving}
                    onClick={handleSave}
                    className="h-8 bg-[#A78BFA] hover:bg-[#9370EA] text-[#0F0F13] font-bold"
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
    onRunEvaluation
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
            const filePath: string = await (window.electronAPI as any).copyToAttachments(file.path || (file as any).path || '')
            await onAddDoc(filePath, file.name, file.type || 'application/octet-stream', file.size)
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
                        <p className="text-xs font-bold text-[#E2E8F0]">Reference Documents</p>
                        <p className="text-[10px] text-[#6B7280] mt-0.5">
                            Upload the knowledge base documents that the chatbot uses.
                        </p>
                    </div>
                    <Button
                        variant="outline" size="sm"
                        disabled={isUploadingDoc}
                        onClick={handleSelectDoc}
                        className="h-8 text-[10px] font-bold border-[#2A2A3A] text-[#A78BFA] hover:bg-[#A78BFA]/10"
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
                    <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">{docError}</p>
                    </div>
                )}

                {suite.referenceDocuments.length === 0 ? (
                    <div className="border-2 border-dashed border-[#2A2A3A] rounded-xl p-8 text-center">
                        <FileText className="h-8 w-8 text-[#2A2A3A] mx-auto mb-2" />
                        <p className="text-xs text-[#6B7280]">No reference documents added yet</p>
                        <p className="text-[10px] text-[#6B7280]/60 mt-1">Supports .txt, .md, .pdf, .docx</p>
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
                        <p className="text-xs font-bold text-[#E2E8F0]">Q&amp;A Pairs</p>
                        <p className="text-[10px] text-[#6B7280] mt-0.5">
                            Questions asked to the chatbot and its responses — copied from the website.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline" size="sm"
                            onClick={() => setShowImportDialog(true)}
                            className="h-8 text-[10px] font-bold border-[#2A2A3A] text-[#6B7280] hover:text-[#E2E8F0]"
                        >
                            <FilePlus className="h-3.5 w-3.5 mr-1" /> Import CSV
                        </Button>
                        <Button
                            variant="outline" size="sm"
                            onClick={() => setShowAddForm(true)}
                            className="h-8 text-[10px] font-bold border-[#2A2A3A] text-[#A78BFA] hover:bg-[#A78BFA]/10"
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
                    <div className="border-2 border-dashed border-[#2A2A3A] rounded-xl p-8 text-center">
                        <p className="text-xs text-[#6B7280]">No Q&amp;A pairs added yet</p>
                        <p className="text-[10px] text-[#6B7280]/60 mt-1">
                            Add pairs manually or import from a CSV with &quot;question&quot; and &quot;response&quot; columns.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {suite.qaPairs.map((pair, idx) => (
                            <div key={pair.id} className="flex items-start gap-3 p-3 bg-[#13131A] border border-[#2A2A3A] rounded-lg group">
                                <span className="text-[9px] font-mono text-[#6B7280] mt-0.5 w-5 shrink-0 text-right">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[#E2E8F0] truncate">{pair.question}</p>
                                    <p className="text-[10px] text-[#6B7280] truncate mt-0.5">{pair.agentResponse}</p>
                                    {pair.expectedAnswer && (
                                        <p className="text-[9px] text-emerald-400/70 truncate mt-0.5">
                                            <span className="font-bold">Expected:</span> {pair.expectedAnswer}
                                        </p>
                                    )}
                                    {pair.sourceLabel && (
                                        <p className="text-[9px] text-[#6B7280]/60 mt-0.5 italic">{pair.sourceLabel}</p>
                                    )}
                                </div>
                                <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-[#6B7280] hover:text-red-400 shrink-0"
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
            <section className="border-t border-[#2A2A3A] pt-6">
                {isEvaluating && evalProgress && (
                    <div className="mb-4 p-4 bg-[#A78BFA]/5 border border-[#A78BFA]/20 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-[#A78BFA]" />
                                <span className="text-xs font-bold text-[#A78BFA]">Evaluating…</span>
                            </div>
                            <span className="text-[10px] text-[#6B7280]">
                                {evalProgress.completed} / {evalProgress.total} pairs
                            </span>
                        </div>
                        <div className="w-full bg-[#1A1A24] rounded-full h-1.5 overflow-hidden mb-2">
                            <div
                                className="h-full bg-[#A78BFA] rounded-full transition-all duration-500"
                                style={{ width: evalProgress.total > 0 ? `${(evalProgress.completed / evalProgress.total) * 100}%` : '0%' }}
                            />
                        </div>
                        {evalProgress.currentQuestion && (
                            <p className="text-[10px] text-[#6B7280] truncate italic">{evalProgress.currentQuestion}</p>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-[#E2E8F0]">Run Evaluation</p>
                        <p className="text-[10px] text-[#6B7280] mt-0.5">
                            {suite.referenceDocuments.length} document{suite.referenceDocuments.length !== 1 ? 's' : ''} ·{' '}
                            {suite.qaPairs.length} Q&amp;A pair{suite.qaPairs.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <Button
                        disabled={!canRunEval}
                        onClick={onRunEvaluation}
                        className={cn(
                            "font-bold",
                            canRunEval
                                ? "bg-[#A78BFA] hover:bg-[#9370EA] text-[#0F0F13]"
                                : "bg-[#2A2A3A] text-[#6B7280] cursor-not-allowed"
                        )}
                    >
                        {isEvaluating
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Evaluating…</>
                            : <><Play className="h-4 w-4 mr-2" /> Run Evaluation</>
                        }
                    </Button>
                </div>

                {!canRunEval && !isEvaluating && (
                    <p className="text-[10px] text-[#6B7280] mt-2">
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
