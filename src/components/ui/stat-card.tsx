import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  meta?: ReactNode
  tone?: "accent" | "info" | "success" | "warning" | "danger" | "neutral"
  className?: string
}

const toneMap = {
  accent: "text-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary-soft))]",
  info: "text-[hsl(var(--state-info))] bg-[hsl(var(--state-info-soft))]",
  success: "text-[hsl(var(--state-success))] bg-[hsl(var(--state-success-soft))]",
  warning: "text-[hsl(var(--state-warning))] bg-[hsl(var(--state-warning-soft))]",
  danger: "text-[hsl(var(--state-danger))] bg-[hsl(var(--state-danger-soft))]",
  neutral: "text-[hsl(var(--text-secondary))] bg-[hsl(var(--surface-card-alt)/0.8)]",
} as const

export function StatCard({ icon: Icon, label, value, meta, tone = "accent", className }: StatCardProps) {
  return (
    <div className={cn("app-metric-card", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border border-current/10", toneMap[tone])}>
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="app-metric-value">{value}</div>
        <p className="app-metric-label">{label}</p>
        {meta ? <div className="app-helper-text">{meta}</div> : null}
      </div>
    </div>
  )
}
