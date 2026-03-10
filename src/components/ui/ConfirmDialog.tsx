import * as React from "react"
import { AlertCircle } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    variant?: 'default' | 'destructive'
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    variant = 'default'
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-[#13131A] border-[#2A2A3A]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-500">
                        {variant === 'destructive' && <AlertCircle className="h-5 w-5" />}
                        {title}
                    </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-sm text-[#E2E8F0] whitespace-pre-line">{description}</p>
                </div>
                <DialogFooter className="sm:justify-end gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#1A1A24]"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            onConfirm();
                            onOpenChange(false);
                        }}
                        className={variant === 'destructive' 
                            ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" 
                            : "bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]"
                        }
                    >
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
