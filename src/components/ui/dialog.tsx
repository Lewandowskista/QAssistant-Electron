import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("app-scrim", className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * One width scale for every modal in the app, so a confirm, a form and a
 * report reader are recognisably the same family of surface rather than 13
 * hand-picked pixel widths. Pick by content, not by page:
 *
 *   sm  a decision or a single field        (confirm, rename, quick pick)
 *   md  a short form                        (new task, new plan, settings bit)
 *   lg  a form with structure or a preview  (import, run setup, packet)
 *   xl  a reading/working surface           (analysis output, matrices)
 *
 * Height is capped centrally too. Before, no dialog had a cap: an over-long
 * one grew past both viewport edges and, being `fixed` and centred, the
 * overflow was simply unreachable. The surface now scrolls as a last resort,
 * but prefer `DialogBody` — it scrolls between a pinned header and footer, so
 * the title and the primary action stay put.
 */
const dialogContentVariants = cva(
  [
    "fixed left-1/2 top-1/2 z-layer-dialog flex w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
    "max-h-[min(86vh,56rem)] overflow-y-auto overflow-x-hidden rounded-[1.4rem] border p-6 shadow-2xl shadow-black/30 custom-scrollbar",
    "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "max-w-[26rem]",
        md: "max-w-[34rem]",
        lg: "max-w-[46rem]",
        xl: "max-w-[58rem]",
      },
    },
    defaultVariants: { size: "md" },
  }
)

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  /** Hide the built-in close affordance for dialogs that supply their own. */
  hideClose?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size, hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn("app-modal-surface", dialogContentVariants({ size }), className)}
      {...props}
    >
      {children}
      {hideClose ? null : (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full border border-transparent p-2 text-muted-foreground transition-colors hover:border-border hover:bg-accent/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex shrink-0 flex-col space-y-1.5 pr-10 text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/**
 * The one scrolling region inside a modal. Bleeds to the surface edge so a
 * scrollbar tracks the dialog border rather than floating inside the padding.
 */
const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("-mx-6 min-h-0 flex-1 overflow-y-auto px-6 custom-scrollbar", className)}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-base font-semibold leading-tight tracking-tight text-foreground",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
