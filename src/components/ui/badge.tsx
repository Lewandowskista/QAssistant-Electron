import type { HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Badge: the generic label chip (categories, counts, metadata). For
 * lifecycle/severity states use ui/status-badge's <StatusBadge>.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(var(--accent-primary))] text-primary-foreground",
        secondary:
          "border-transparent bg-[hsl(var(--surface-card-alt))] text-[hsl(var(--text-secondary))]",
        destructive:
          "border-transparent bg-[hsl(var(--state-danger-soft))] text-[hsl(var(--state-danger))]",
        outline:
          "border-current bg-transparent text-[hsl(var(--text-secondary))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
