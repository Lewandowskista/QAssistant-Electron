import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Edge-anchored modal panel.
 *
 * The app has three overlay kinds and they are deliberately distinct:
 *
 *   Dialog     centred, modal, one focused task — see ui/dialog.
 *   Drawer     edge-anchored, modal, a companion surface you dismiss when done
 *              (AI Copilot). Traps focus, closes on Escape and on scrim click,
 *              restores focus to the trigger, and locks background scroll.
 *   Inspector  edge-anchored but NOT modal and NOT overlaid — it takes layout
 *              space beside the content it describes and the workspace stays
 *              usable around it (the task detail on the board). See
 *              `.inspector-drawer` in index.css.
 *
 * Before this existed the copilot was a hand-rolled `fixed` div: no focus
 * trap, no Escape, no `aria-modal`, and its own backdrop opacity. Anything
 * that overlays the whole workspace belongs here instead.
 */
const drawerVariants = cva(
  [
    "fixed inset-y-0 z-layer-dialog flex flex-col app-region-no-drag",
    "app-modal-surface w-[calc(100vw-3rem)] shadow-2xl shadow-black/40",
    "duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  ].join(" "),
  {
    variants: {
      side: {
        right:
          "right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        left: "left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
      },
      size: {
        sm: "max-w-[22rem]",
        md: "max-w-[30rem]",
        lg: "max-w-[40rem]",
      },
    },
    defaultVariants: { side: "right", size: "md" },
  }
)

const Drawer = DialogPrimitive.Root
const DrawerTrigger = DialogPrimitive.Trigger
const DrawerClose = DialogPrimitive.Close

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof drawerVariants> {}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side, size, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="app-scrim" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(drawerVariants({ side, size }), className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DrawerContent.displayName = "DrawerContent"

/**
 * Header band for a drawer. Matches the workspace topbar's 32px icon chip and
 * h-14 band so a drawer's title sits on the same baseline as the page title
 * it covers.
 */
function DrawerHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: LucideIcon
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("drawer-header", className)}>
      {Icon ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-ui bg-panel-muted">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <DialogPrimitive.Title className="truncate text-sm font-semibold text-foreground">
          {title}
        </DialogPrimitive.Title>
        {subtitle ? <div className="app-helper-text truncate">{subtitle}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <DrawerClose
          aria-label="Close panel"
          className="rounded-lg p-2 text-muted-ui transition-colors hover:bg-panel-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </DrawerClose>
      </div>
    </div>
  )
}

const DrawerDescription = DialogPrimitive.Description

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerDescription }
