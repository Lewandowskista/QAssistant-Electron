import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actions?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={cn("app-empty-state", className)}>
      <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] border bg-[hsl(var(--surface-card-alt)/0.7)]" style={{ borderColor: "hsl(var(--border-default))" }}>
        <Icon className="h-9 w-9 text-muted-ui opacity-70" strokeWidth={1.6} />
      </div>
      <div className="space-y-2">
        <h2 className="app-section-title text-lg">{title}</h2>
        <p className="app-helper-text max-w-md">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
    </div>
  )
}
