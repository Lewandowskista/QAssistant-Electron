import { useState, useCallback } from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { AlertTriangle } from "lucide-react"
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

/**
 * Confirmation dialog built on Radix AlertDialog: real alertdialog role,
 * focus trap, Escape-to-cancel, and focus restore — and it unmounts when
 * closed instead of lingering in the tab order.
 */
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
        <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
            <AlertDialogPrimitive.Portal>
                <AlertDialogPrimitive.Overlay
                    data-radix-dialog-overlay=""
                    className="fixed inset-0 z-layer-confirm bg-black/60 backdrop-blur-sm"
                />
                <AlertDialogPrimitive.Content
                    data-radix-dialog-content=""
                    className="app-panel fixed left-1/2 top-1/2 z-layer-confirm w-[400px] -translate-x-1/2 -translate-y-1/2 p-6"
                >
                    <div className="flex items-start gap-4 mb-6">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            destructive ? "app-status-danger" : "app-status-info"
                        )}>
                            <AlertTriangle
                                aria-hidden="true"
                                className={cn("h-5 w-5", destructive ? "text-state-danger" : "text-primary")}
                            />
                        </div>
                        <div>
                            <div className="mb-2">
                                <StatusBadge tone={destructive ? "danger" : "info"}>{destructive ? "Destructive" : "Confirmation"}</StatusBadge>
                            </div>
                            <AlertDialogPrimitive.Title className="text-sm font-bold text-foreground">
                                {title}
                            </AlertDialogPrimitive.Title>
                            {description && (
                                <AlertDialogPrimitive.Description className="text-xs text-muted-ui mt-1 leading-relaxed">
                                    {description}
                                </AlertDialogPrimitive.Description>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 justify-end">
                        <AlertDialogPrimitive.Cancel asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onCancel}
                                className="h-9 px-4 text-soft hover:text-foreground font-semibold"
                            >
                                {cancelLabel}
                            </Button>
                        </AlertDialogPrimitive.Cancel>
                        <AlertDialogPrimitive.Action asChild>
                            <Button
                                size="sm"
                                onClick={onConfirm}
                                className={cn(
                                    "h-9 px-5 font-semibold transition-all",
                                    destructive
                                        ? "bg-state-danger hover:bg-state-danger/85 text-primary-foreground"
                                        : "bg-primary hover:bg-[hsl(var(--accent-primary-strong))] text-primary-foreground"
                                )}
                            >
                                {confirmLabel}
                            </Button>
                        </AlertDialogPrimitive.Action>
                    </div>
                </AlertDialogPrimitive.Content>
            </AlertDialogPrimitive.Portal>
        </AlertDialogPrimitive.Root>
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
