import type { LucideIcon } from "lucide-react"
import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

export function PageScaffold({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("page-scaffold", className)}>{children}</div>
}

export function CompactPageHeader({
  eyebrow,
  title,
  description,
  summary,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  summary?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("compact-page-header", className)}>
      <div className="space-y-2">
        {eyebrow ? <p className="app-section-label">{eyebrow}</p> : null}
        <div className="space-y-2">
          <h1 className="compact-page-title">{title}</h1>
          {description ? <div className="compact-page-description">{description}</div> : null}
        </div>
        {summary ? <div className="inline-status-summary">{summary}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function ActionToolbar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("action-toolbar", className)}>{children}</div>
}

export function InlineStatusSummary({
  items,
  className,
}: {
  items: Array<ReactNode>
  className?: string
}) {
  return (
    <div className={cn("inline-status-summary", className)}>
      {items.filter(Boolean).map((item, index) => (
        <div key={index} className="contents">
          {index > 0 ? <span className="summary-separator">/</span> : null}
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

export function DenseListRow({
  title,
  description,
  meta,
  actions,
  icon: Icon,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn("dense-list-row", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ui bg-panel-muted">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description ? <div className="text-sm text-soft">{description}</div> : null}
          {meta ? <div className="app-helper-text">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function InspectorDrawer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <aside className={cn("inspector-drawer", className)}>{children}</aside>
}

export function SettingsSectionNav({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ id: string; label: string; icon?: LucideIcon; hint?: string }>
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <nav aria-label="Settings sections" className={cn("settings-nav", className)}>
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === value

        return (
          <button
            key={item.id}
            type="button"
            data-active={active}
            className="settings-nav-item"
            onClick={() => onChange(item.id)}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function SurfaceBlock({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("page-section", className)} {...props}>
      {children}
    </div>
  )
}
