import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface SubtabItem {
  id: string
  label: string
  icon?: LucideIcon
  count?: number
}

interface SubtabBarProps {
  items: SubtabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SubtabBar({ items, value, onChange, className }: SubtabBarProps) {
  return (
    <div className={cn("app-subtab-bar", className)}>
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            data-state={active ? "active" : "inactive"}
            className="app-subtab-trigger"
            onClick={() => onChange(item.id)}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-[hsl(var(--accent-primary-soft))]" : "bg-[hsl(var(--surface-elevated))] text-muted-ui")}>
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
