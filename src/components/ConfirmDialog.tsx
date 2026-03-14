import { useState, useCallback } from "react"
import { X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/ui/status-badge"

interface ConfirmDialogProps {
    open: boolean
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-200",
                    open ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onCancel}
            />
            {/* Dialog */}
            <div
                className={cn(
                    "fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2 transition-all duration-200",
                    open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                )}
            >
                <div className="app-panel w-[400px] p-6">
                    <div className="flex items-start gap-4 mb-6">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            destructive ? "app-status-danger" : "app-status-info"
                        )}>
                            <AlertTriangle className={cn(
                                "h-5 w-5",
                                destructive ? "text-red-400" : "text-primary"
                            )} />
                        </div>
                        <div>
                            <div className="mb-2">
                                <StatusBadge tone={destructive ? "danger" : "info"}>{destructive ? "Destructive" : "Confirmation"}</StatusBadge>
                            </div>
                            <p className="text-sm font-bold text-[#E2E8F0]">{title}</p>
                            {description && (
                                <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">{description}</p>
                            )}
                        </div>
                        <button
                            onClick={onCancel}
                            className="ml-auto p-1 rounded-md text-[#6B7280] hover:text-[#E2E8F0] hover:bg-[#252535] transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3 justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCancel}
                            className="h-9 px-4 text-[#9CA3AF] hover:text-[#E2E8F0] font-semibold"
                        >
                            {cancelLabel}
                        </Button>
                        <Button
                            size="sm"
                            onClick={onConfirm}
                            className={cn(
                                "h-9 px-5 font-bold transition-all",
                                destructive
                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                    : "bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13]"
                            )}
                        >
                            {confirmLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    )
}

/** Hook to imperatively show a confirm dialog */
export function useConfirm() {
    const [state, setState] = useState<{
        open: boolean
        title: string
        description?: string
        confirmLabel?: string
        destructive?: boolean
        resolve?: (confirmed: boolean) => void
    }>({ open: false, title: "" })

    const confirm = useCallback(
        (title: string, options?: { description?: string; confirmLabel?: string; destructive?: boolean }): Promise<boolean> => {
            return new Promise((resolve) => {
                setState({ open: true, title, ...options, resolve })
            })
        },
        []
    )

    const handleConfirm = () => {
        state.resolve?.(true)
        setState(prev => ({ ...prev, open: false }))
    }

    const handleCancel = () => {
        state.resolve?.(false)
        setState(prev => ({ ...prev, open: false }))
    }

    const dialog = (
        <ConfirmDialog
            open={state.open}
            title={state.title}
            description={state.description}
            confirmLabel={state.confirmLabel}
            destructive={state.destructive}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
        />
    )

    return { confirm, dialog }
}
