import type { HTMLAttributes } from "react"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
  {
    variants: {
      tone: {
        neutral: "border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt)/0.72)] text-[hsl(var(--text-secondary))]",
        accent: "border-[hsl(var(--accent-primary)/0.22)] bg-[hsl(var(--accent-primary-soft))] text-[hsl(var(--accent-primary))]",
        info: "border-[hsl(var(--state-info-border))] bg-[hsl(var(--state-info-soft))] text-[hsl(var(--state-info))]",
        success: "border-[hsl(var(--state-success-border))] bg-[hsl(var(--state-success-soft))] text-[hsl(var(--state-success))]",
        warning: "border-[hsl(var(--state-warning-border))] bg-[hsl(var(--state-warning-soft))] text-[hsl(var(--state-warning))]",
        danger: "border-[hsl(var(--state-danger-border))] bg-[hsl(var(--state-danger-soft))] text-[hsl(var(--state-danger))]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
