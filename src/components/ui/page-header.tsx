import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
  compact?: boolean
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  compact = false,
}: PageHeaderProps) {
  return (
    <header className={cn("app-page-header", compact && "pb-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          {eyebrow ? <p className="app-section-label">{eyebrow}</p> : null}
          <h1 className="app-page-title">{title}</h1>
          {description ? <p className="app-page-description max-w-3xl">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
