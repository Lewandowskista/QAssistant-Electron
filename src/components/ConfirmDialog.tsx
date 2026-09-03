import { useState, useCallback, useEffect, useRef } from "react"
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
    /** Records the confirm decision. Does not close — Radix's Action does that. */
    onConfirm: () => void
    /** Records the cancel decision. Does not close — Radix's Cancel does that. */
    onCancel?: () => void
    /** Invoked once when the dialog actually closes, whatever caused it. */
    onClose: () => void
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
    onClose,
}: ConfirmDialogProps) {
    return (
        /*
         * Radix's Action/Cancel close the dialog themselves, so `onClose` is the single
         * close path: the buttons only record the decision (onConfirm/onCancel) and
         * Radix's own handler drives the close. Treating onOpenChange(false) as a
         * *cancel* would overwrite a recorded confirm, silently dropping the action.
         */
        <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
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
    }>({ open: false, title: "" })

    // The caller's continuation is held here rather than resolved inline — see the
    // close effect below for why the ordering matters.
    const pending = useRef<{ resolve: (confirmed: boolean) => void; value: boolean } | null>(null)

    const confirm = useCallback(
        (title: string, options?: { description?: string; confirmLabel?: string; destructive?: boolean }): Promise<boolean> => {
            return new Promise((resolve) => {
                pending.current = { resolve, value: false }
                setState({ open: true, title, ...options })
            })
        },
        []
    )

    /**
     * Hand control back to the caller only after the close has committed.
     *
     * Resolving the promise inline (the previous behaviour) ran the caller's
     * continuation as a microtask — before React committed `open: false`. A
     * destructive callback could then unmount the trigger's subtree while Radix was
     * still unwinding its modal-layer stack: Radix restores
     * `body { pointer-events: none }` only when its layer counter returns to zero,
     * so a layer that never deregistered left the style orphaned and the entire
     * window unclickable, with nothing logged.
     *
     * Effects flush children-first, so by the time this runs the AlertDialog's own
     * cleanup (and its layer deregistration) has already happened.
     */
    useEffect(() => {
        if (state.open) return
        const p = pending.current
        if (!p) return
        pending.current = null
        p.resolve(p.value)
    }, [state.open])

    // Never leave an awaiting caller hanging if the dialog's owner unmounts.
    useEffect(() => () => {
        const p = pending.current
        pending.current = null
        p?.resolve(false)
    }, [])

    // Record the decision only. Radix closes the dialog itself, and `handleClose`
    // below is what flips our state — keeping exactly one close path.
    const handleConfirm = () => { if (pending.current) pending.current.value = true }
    const handleCancel = () => { if (pending.current) pending.current.value = false }
    const handleClose = () => setState(prev => ({ ...prev, open: false }))

    const dialog = (
        <ConfirmDialog
            open={state.open}
            title={state.title}
            description={state.description}
            confirmLabel={state.confirmLabel}
            destructive={state.destructive}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            onClose={handleClose}
        />
    )

    return { confirm, dialog }
}
