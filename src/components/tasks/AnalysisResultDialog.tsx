import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogBody,
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
            <DialogContent size="xl">
                <DialogHeader className="flex-row items-center justify-between border-b border-ui pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-qa-accent to-qa-accent-hover flex items-center justify-center shadow-lg shadow-qa-accent/20">
                            <Sparkles className="h-4 w-4 text-primary-foreground" />
                        </div>
                        <div>
                            <DialogTitle>Issue Analysis</DialogTitle>
                            <p className="text-xs text-muted-ui line-clamp-1">{taskTitle}</p>
                        </div>
                    </div>
                </DialogHeader>

                <DialogBody className="py-6">
                    {result ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                            <FormattedText content={result} projectId={projectId} />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-ui">
                            <p>No analysis result available.</p>
                        </div>
                    )}
                </DialogBody>

                <DialogFooter className="flex-row items-center justify-between border-t border-ui pt-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        className="text-muted-ui hover:text-brand hover:bg-qa-accent/10 gap-2"
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
                        className="bg-primary hover:bg-qa-accent text-primary-foreground font-bold"
                    >
                        CLOSE
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
