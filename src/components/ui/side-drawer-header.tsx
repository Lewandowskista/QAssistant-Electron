import type { LucideIcon } from "lucide-react"
import { X } from "lucide-react"
import type { ReactNode } from "react"

interface SideDrawerHeaderProps {
  icon?: LucideIcon
  title: string
  subtitle?: string
  onClose?: () => void
  actions?: ReactNode
}

export function SideDrawerHeader({ icon: Icon, title, subtitle, onClose, actions }: SideDrawerHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b bg-[hsl(var(--surface-header)/0.86)] px-4 py-3 backdrop-blur-xl" style={{ borderColor: "hsl(var(--border-default))" }}>
      {Icon ? (
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border bg-[hsl(var(--accent-primary-soft))] text-[hsl(var(--accent-primary))]" style={{ borderColor: "hsl(var(--accent-primary)/0.18)" }}>
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="app-panel-title truncate">{title}</div>
        {subtitle ? <div className="app-helper-text truncate">{subtitle}</div> : null}
      </div>
      <div className="flex items-center gap-1 app-region-no-drag">
        {actions}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-ui transition-colors hover:bg-[hsl(var(--surface-elevated))] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
