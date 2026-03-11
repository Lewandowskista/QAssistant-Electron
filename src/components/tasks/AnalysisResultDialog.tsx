import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import FormattedText from "@/components/FormattedText"
import { Sparkles, Copy, Check } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface AnalysisResultDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    result: string | null
    taskTitle: string
    projectId?: string
}

export default function AnalysisResultDialog({
    open,
    onOpenChange,
    result,
    taskTitle,
    projectId,
}: AnalysisResultDialogProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        if (!result) return
        navigator.clipboard.writeText(result)
        setCopied(true)
        toast.success("Analysis copied to clipboard")
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col bg-[#0F0F13] border-[#2A2A3A] text-white">
                <DialogHeader className="flex flex-row items-center justify-between border-b border-[#2A2A3A] pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] flex items-center justify-center shadow-lg shadow-[#A78BFA]/20">
                            <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold">Issue Analysis</DialogTitle>
                            <p className="text-xs text-[#6B7280] line-clamp-1">{taskTitle}</p>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto custom-scrollbar py-6">
                    {result ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                            <FormattedText content={result} projectId={projectId} />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-[#6B7280]">
                            <p>No analysis result available.</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-[#2A2A3A] pt-4 flex items-center justify-between shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        className="text-[#6B7280] hover:text-[#A78BFA] hover:bg-[#A78BFA]/10 gap-2"
                    >
                        {copied ? (
                            <>
                                <Check className="h-4 w-4" /> COPIED
                            </>
                        ) : (
                            <>
                                <Copy className="h-4 w-4" /> COPY ANALYSIS
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={() => onOpenChange(false)}
                        className="bg-[#A78BFA] hover:bg-[#9061F9] text-black font-bold"
                    >
                        CLOSE
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
