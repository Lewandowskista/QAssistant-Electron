import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UploadCloud, FileSpreadsheet, AlertCircle, ChevronRight } from "lucide-react"
import { parseImportFile } from "@/lib/import"
import { autoDetectQaPairMappings } from "@/lib/accuracy"

interface QaPairImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onImport: (pairs: Array<{ question: string; agentResponse: string; sourceLabel: string; expectedAnswer?: string }>) => void
}

const QA_FIELDS = [
    { id: 'question', label: 'Question', required: true },
    { id: 'agentResponse', label: 'Agent Response', required: true },
    { id: 'expectedAnswer', label: 'Expected Answer', required: false }
]

export function QaPairImportDialog({ open, onOpenChange, onImport }: QaPairImportDialogProps) {
    const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
    const [parsedData, setParsedData] = useState<{ headers: string[]; rows: Record<string, string>[]; fileName: string } | null>(null)
    const [mappings, setMappings] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setStep('upload')
        setParsedData(null)
        setMappings({})
        setError(null)
        setIsProcessing(false)
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setError(null)
        setIsProcessing(true)
        try {
            const data = await parseImportFile(file)
            if (data.headers.length === 0) throw new Error("File is empty or has no headers.")
            setParsedData(data)
            // Build field→header mappings
            const detected = autoDetectQaPairMappings(data.headers)
            // Convert to header→field for UI
            const headerToField: Record<string, string> = {}
            for (const [field, header] of Object.entries(detected)) {
                headerToField[header] = field
            }
            setMappings(headerToField)
            setStep('mapping')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to parse file")
        } finally {
            setIsProcessing(false)
        }
    }

    const getMappedField = (field: string) => {
        return Object.keys(mappings).find(header => mappings[header] === field) ?? ''
    }

    const setFieldMapping = (field: string, header: string) => {
        // Remove old mapping for this field
        const newMappings = { ...mappings }
        for (const h of Object.keys(newMappings)) {
            if (newMappings[h] === field) delete newMappings[h]
        }
        if (header) newMappings[header] = field
        setMappings(newMappings)
    }

    const handleImport = () => {
        if (!parsedData) return
        const questionHeader = getMappedField('question')
        const responseHeader = getMappedField('agentResponse')
        const expectedHeader = getMappedField('expectedAnswer')

        if (!questionHeader || !responseHeader) {
            setError("Please map both Question and Agent Response columns.")
            return
        }

        const pairs = parsedData.rows
            .map((row, idx) => ({
                question: row[questionHeader]?.trim() ?? '',
                agentResponse: row[responseHeader]?.trim() ?? '',
                expectedAnswer: expectedHeader ? (row[expectedHeader]?.trim() || undefined) : undefined,
                sourceLabel: `CSV row ${idx + 2}`
            }))
            .filter(p => p.question && p.agentResponse)

        if (pairs.length === 0) {
            setError("No valid Q&A pairs found. Check that question and response columns have content.")
            return
        }

        onImport(pairs)
        onOpenChange(false)
        setTimeout(reset, 300)
    }

    const previewPairs = () => {
        if (!parsedData) return []
        const questionHeader = getMappedField('question')
        const responseHeader = getMappedField('agentResponse')
        return parsedData.rows.slice(0, 5).map(row => ({
            question: row[questionHeader] ?? '',
            agentResponse: row[responseHeader] ?? ''
        }))
    }

    return (
        <Dialog open={open} onOpenChange={val => { onOpenChange(val); if (!val) setTimeout(reset, 300) }}>
            <DialogContent className="sm:max-w-[640px] bg-[#0F0F13] border-[#2A2A3A] text-[#E2E8F0] p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="p-6 pb-4 border-b border-[#2A2A3A] flex-none">
                    <DialogTitle className="text-lg font-black flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-[#A78BFA]" />
                        IMPORT Q&amp;A PAIRS
                    </DialogTitle>
                    <p className="text-xs text-[#6B7280] mt-1">
                        Import a CSV/XLSX file with question and agent response columns.
                    </p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'upload' && (
                        <div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                                className="w-full border-2 border-dashed border-[#2A2A3A] rounded-xl p-10 flex flex-col items-center gap-3 hover:border-[#A78BFA]/40 hover:bg-[#A78BFA]/5 transition-colors group"
                            >
                                <UploadCloud className="h-10 w-10 text-[#6B7280] group-hover:text-[#A78BFA] transition-colors" />
                                <div className="text-center">
                                    <p className="text-sm font-bold text-[#E2E8F0]">Click to upload CSV or XLSX</p>
                                    <p className="text-xs text-[#6B7280] mt-1">Max 10MB, up to 5000 rows</p>
                                </div>
                            </button>
                            <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileSelect} />
                        </div>
                    )}

                    {step === 'mapping' && parsedData && (
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs font-bold text-[#E2E8F0] mb-1">
                                    File: <span className="text-[#A78BFA]">{parsedData.fileName}</span>
                                </p>
                                <p className="text-[10px] text-[#6B7280]">{parsedData.rows.length} rows detected</p>
                            </div>
                            <div className="space-y-3">
                                <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest">Map Columns</p>
                                {QA_FIELDS.map(field => (
                                    <div key={field.id} className="flex items-center gap-3">
                                        <span className="text-xs font-semibold text-[#E2E8F0] w-36 shrink-0">
                                            {field.label}
                                            {!field.required && <span className="text-[9px] text-[#6B7280] font-normal ml-1">(optional)</span>}
                                        </span>
                                        <Select value={getMappedField(field.id)} onValueChange={val => setFieldMapping(field.id, val)}>
                                            <SelectTrigger className="flex-1 h-9 bg-[#1A1A24] border-[#2A2A3A] text-xs">
                                                <SelectValue placeholder={field.required ? "Select column…" : "Skip (not in file)"} />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#13131A] border-[#2A2A3A]">
                                                {parsedData.headers.map(h => (
                                                    <SelectItem key={h} value={h} className="text-xs text-[#E2E8F0]">{h}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                            </div>

                            {/* Preview */}
                            {previewPairs().length > 0 && (
                                <div>
                                    <p className="text-[9px] font-bold text-[#6B7280] uppercase tracking-widest mb-2">Preview (first 5 rows)</p>
                                    <div className="space-y-2">
                                        {previewPairs().map((p, i) => (
                                            <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-lg p-2.5 text-[10px]">
                                                <p className="text-[#9CA3AF] truncate"><span className="text-[#6B7280] font-bold">Q:</span> {p.question || <em className="text-[#6B7280]">—</em>}</p>
                                                <p className="text-[#9CA3AF] truncate mt-0.5"><span className="text-[#6B7280] font-bold">A:</span> {p.agentResponse || <em className="text-[#6B7280]">—</em>}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mt-4">
                            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-400">{error}</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-[#2A2A3A] flex-none">
                    <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); setTimeout(reset, 300) }}
                        className="text-[#6B7280]">
                        Cancel
                    </Button>
                    {step === 'mapping' && (
                        <Button size="sm"
                            onClick={handleImport}
                            className="bg-[#A78BFA] hover:bg-[#9370EA] text-[#0F0F13] font-bold"
                        >
                            <ChevronRight className="h-3.5 w-3.5 mr-1" />
                            Import Pairs
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
