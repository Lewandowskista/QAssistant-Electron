import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { UploadCloud, ChevronRight, AlertCircle, FileSpreadsheet } from "lucide-react"
import { ParsedImportData, TEST_CASE_IMPORT_FIELDS, autoDetectMappings, parseImportFile, prepareImportData } from "@/lib/import"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TestCase } from "@/store/useProjectStore"

interface CsvImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onImport: (testCases: Partial<TestCase>[]) => void
}

export function CsvImportDialog({ open, onOpenChange, onImport }: CsvImportDialogProps) {
    const defaultState = () => {
        setStep('upload')
        setParsedData(null)
        setMappings({})
        setError(null)
        setIsProcessing(false)
    }

    const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
    const [parsedData, setParsedData] = useState<ParsedImportData | null>(null)
    const [mappings, setMappings] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        setError(null)
        setIsProcessing(true)

        try {
            const data = await parseImportFile(selectedFile)
            if (data.headers.length === 0) throw new Error("File is empty or contains no headers.")

            setParsedData(data)
            setMappings(autoDetectMappings(data.headers))
            setStep('mapping')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to parse file")
        } finally {
            setIsProcessing(false)
        }
    }

    const handleMappingChange = (csvHeader: string, internalField: string) => {
        setMappings(prev => ({ ...prev, [csvHeader]: internalField }))
    }

    const handleConfirmImport = () => {
        if (!parsedData) return

        const testCases = prepareImportData(parsedData, mappings)
        if (testCases.length === 0) {
            setError("No valid test cases found to import. Please check your mapping.")
            return
        }

        onImport(testCases)
        onOpenChange(false)
        setTimeout(defaultState, 300)
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            onOpenChange(val)
            if (!val) setTimeout(defaultState, 300)
        }}>
            <DialogContent className="sm:max-w-[700px] bg-app border-ui text-foreground p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="p-6 pb-4 border-b border-ui flex-none">
                    <DialogTitle className="text-xl font-black flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-brand" />
                        IMPORT TEST CASES
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-state-danger-soft border border-state-danger-border flex gap-3 text-state-danger">
                            <AlertCircle className="h-5 w-5 flex-none" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {step === 'upload' && (
                        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-ui hover:border-qa-accent/50 rounded-2xl bg-panel-muted transition-colors group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".csv,.xlsx"
                                onChange={handleFileSelect}
                            />
                            <div className="h-16 w-16 bg-qa-accent/10 text-brand rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <UploadCloud className="h-8 w-8" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-2">Click or Drag File to Upload</h3>
                            <p className="text-sm text-muted-ui">Supports .csv and .xlsx</p>

                            {isProcessing && <p className="mt-4 text-xs font-bold text-brand animate-pulse uppercase">Parsing File…</p>}
                        </div>
                    )}

                    {step === 'mapping' && parsedData && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-foreground mb-1">Map Columns</h4>
                                    <p className="text-xs text-muted-ui">We've auto-detected mappings based on column headers. Adjust if necessary.</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-brand">{parsedData.rows.length}</p>
                                    <p className="text-[10px] uppercase font-bold text-muted-ui">Rows Found</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-ui overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-panel-muted border-b border-ui">
                                        <tr>
                                            <th className="px-4 py-3 font-bold text-[10px] text-muted-ui uppercase tracking-wider w-1/2">File Column</th>
                                            <th className="px-4 py-3 font-bold text-[10px] text-muted-ui uppercase tracking-wider w-1/2">QAssistant Field</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line/50 bg-app">
                                        {parsedData.headers.map((header, idx) => (
                                            <tr key={idx} className="hover:bg-surface-alt/30 transition-colors">
                                                <td className="px-4 py-3 text-xs font-mono font-medium text-foreground truncate max-w-[250px]">
                                                    {header}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <Select
                                                        value={mappings[header] || '(Ignore)'}
                                                        onValueChange={(val) => handleMappingChange(header, val)}>
                                                        <SelectTrigger className="h-8 text-xs bg-panel-muted border-ui font-medium text-brand">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-panel-muted border-ui text-foreground">
                                                            {TEST_CASE_IMPORT_FIELDS.map(f => (
                                                                <SelectItem key={f.field} value={f.field} className="text-xs font-medium">
                                                                    {f.display}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-ui flex items-center justify-between sm:justify-between bg-panel flex-none">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-ui hover:text-foreground text-xs font-bold">
                        CANCEL
                    </Button>

                    {step === 'mapping' && (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={defaultState} className="border-ui text-foreground text-xs font-bold min-w-[100px]">
                                START OVER
                            </Button>
                            <Button onClick={handleConfirmImport} className="bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground font-black text-xs gap-2 min-w-[140px]">
                                IMPORT TESTS <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
