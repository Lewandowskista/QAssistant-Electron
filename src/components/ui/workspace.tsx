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

/**
 * The one page header.
 *
 * The workspace topbar already names the active page and the active project,
 * on every route. Pages used to name themselves again underneath it — often
 * with an eyebrow and a sentence of description too — so the task board opened
 * with "Tasks" written twice, "Delivery board" above it, and three bands of
 * chrome before a single card. Identity now lives in exactly one place (the
 * topbar) and this bar carries only what is page-specific: context, live
 * status, and the page's actions. A page with none of those renders no bar at
 * all rather than an empty strip.
 *
 * `title` is still required so callers read naturally and the bar can name
 * itself for assistive tech, but it is deliberately not painted a second time.
 */
function PageHeader({
  icon: Icon,
  title,
  description,
  status,
  summary,
  actions,
  inline,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  /** Inline status content rendered before the right-aligned actions. */
  status?: ReactNode
  summary?: ReactNode
  actions?: ReactNode
  /** Inside a padded PageScaffold, drop the band's own background. */
  inline?: boolean
  className?: string
}) {
  const context = summary ?? description
  if (!context && !status && !actions) return null

  return (
    <header
      aria-label={`${title} toolbar`}
      data-inline={inline || undefined}
      className={cn("page-bar", className)}
    >
      {Icon && !inline ? <Icon className="h-4 w-4 shrink-0 text-muted-ui" aria-hidden="true" /> : null}
      {context ? <div className="page-bar-context">{context}</div> : null}
      <div className="flex-1" />
      {status ? <div className="flex shrink-0 items-center gap-2">{status}</div> : null}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

type PageHeaderProps = Parameters<typeof PageHeader>[0]

/** Header for a page that owns its own full-height shell. */
export function FullBleedHeader(props: Omit<PageHeaderProps, "inline">) {
  return <PageHeader {...props} />
}

/**
 * Header for a page rendered inside a padded {@link PageScaffold}. `eyebrow`
 * is accepted and ignored — it duplicated the topbar's page name.
 */
export function CompactPageHeader({
  eyebrow: _eyebrow,
  ...props
}: Omit<PageHeaderProps, "inline"> & { eyebrow?: string }) {
  return <PageHeader {...props} inline />
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
