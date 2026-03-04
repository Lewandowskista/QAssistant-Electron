import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { UploadCloud, CheckCircle2, ChevronRight, AlertCircle, FileSpreadsheet } from "lucide-react"
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
        setFile(null)
        setParsedData(null)
        setMappings({})
        setError(null)
        setIsProcessing(false)
    }

    const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<ParsedImportData | null>(null)
    const [mappings, setMappings] = useState<Record<string, string>>({})
    const [error, setError] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        setFile(selectedFile)
        setError(null)
        setIsProcessing(true)

        try {
            const data = await parseImportFile(selectedFile)
            if (data.headers.length === 0) throw new Error("File is empty or contains no headers.")

            setParsedData(data)
            setMappings(autoDetectMappings(data.headers))
            setStep('mapping')
        } catch (err: any) {
            setError(err.message || "Failed to parse file")
            setFile(null)
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
            <DialogContent className="sm:max-w-[700px] bg-[#0F0F13] border-[#2A2A3A] text-[#E2E8F0] p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="p-6 pb-4 border-b border-[#2A2A3A] flex-none">
                    <DialogTitle className="text-xl font-black flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-[#A78BFA]" />
                        IMPORT TEST CASES
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex gap-3 text-[#EF4444]">
                            <AlertCircle className="h-5 w-5 flex-none" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {step === 'upload' && (
                        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-[#2A2A3A] hover:border-[#A78BFA]/50 rounded-2xl bg-[#1A1A24] transition-colors group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".csv,.xlsx,.xls"
                                onChange={handleFileSelect}
                            />
                            <div className="h-16 w-16 bg-[#A78BFA]/10 text-[#A78BFA] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <UploadCloud className="h-8 w-8" />
                            </div>
                            <h3 className="text-lg font-bold text-[#E2E8F0] mb-2">Click or Drag File to Upload</h3>
                            <p className="text-sm text-[#6B7280]">Supports .csv, .xlsx, .xls</p>

                            {isProcessing && <p className="mt-4 text-xs font-bold text-[#A78BFA] animate-pulse uppercase">Parsing File...</p>}
                        </div>
                    )}

                    {step === 'mapping' && parsedData && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-[#E2E8F0] mb-1">Map Columns</h4>
                                    <p className="text-xs text-[#6B7280]">We've auto-detected mappings based on column headers. Adjust if necessary.</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-[#A78BFA]">{parsedData.rows.length}</p>
                                    <p className="text-[10px] uppercase font-bold text-[#6B7280]">Rows Found</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-[#2A2A3A] overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#1A1A24] border-b border-[#2A2A3A]">
                                        <tr>
                                            <th className="px-4 py-3 font-bold text-[10px] text-[#6B7280] uppercase tracking-wider w-1/2">File Column</th>
                                            <th className="px-4 py-3 font-bold text-[10px] text-[#6B7280] uppercase tracking-wider w-1/2">QAssistant Field</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#2A2A3A]/50 bg-[#0F0F13]">
                                        {parsedData.headers.map((header, idx) => (
                                            <tr key={idx} className="hover:bg-[#1A1A24]/30 transition-colors">
                                                <td className="px-4 py-3 text-xs font-mono font-medium text-[#E2E8F0] truncate max-w-[250px]">
                                                    {header}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <Select
                                                        value={mappings[header] || '(Ignore)'}
                                                        onValueChange={(val) => handleMappingChange(header, val)}>
                                                        <SelectTrigger className="h-8 text-xs bg-[#1A1A24] border-[#2A2A3A] font-medium text-[#A78BFA]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-[#1A1A24] border-[#2A2A3A] text-[#E2E8F0]">
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

                <DialogFooter className="p-4 border-t border-[#2A2A3A] flex items-center justify-between sm:justify-between bg-[#13131A] flex-none">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#6B7280] hover:text-[#E2E8F0] text-xs font-bold">
                        CANCEL
                    </Button>

                    {step === 'mapping' && (
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={defaultState} className="border-[#2A2A3A] text-[#E2E8F0] text-xs font-bold min-w-[100px]">
                                START OVER
                            </Button>
                            <Button onClick={handleConfirmImport} className="bg-[#A78BFA] hover:bg-[#C4B5FD] text-[#0F0F13] font-black text-xs gap-2 min-w-[140px]">
                                IMPORT TESTS <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
