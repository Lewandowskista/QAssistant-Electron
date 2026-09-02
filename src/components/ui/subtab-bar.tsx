import type { LucideIcon } from "lucide-react"
import { useRef } from "react"

import { cn } from "@/lib/utils"

export interface SubtabItem {
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
  /** Accessible name for the tab list. */
  label?: string
}

/**
 * Canonical sub-tab row (SegmentedControl delegates here). Renders a tablist
 * with roving focus: Left/Right/Home/End move and select.
 */
export function SubtabBar({ items, value, onChange, className, label }: SubtabBarProps) {
  const listRef = useRef<HTMLDivElement>(null)

  const focusAndSelect = (index: number) => {
    const item = items[index]
    if (!item) return
    onChange(item.id)
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[index]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = items.length - 1
    switch (event.key) {
      case "ArrowRight": event.preventDefault(); focusAndSelect(index === last ? 0 : index + 1); break
      case "ArrowLeft": event.preventDefault(); focusAndSelect(index === 0 ? last : index - 1); break
      case "Home": event.preventDefault(); focusAndSelect(0); break
      case "End": event.preventDefault(); focusAndSelect(last); break
    }
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={cn("app-subtab-bar", className)}>
      {items.map((item, index) => {
        const Icon = item.icon
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-state={active ? "active" : "inactive"}
            className="app-subtab-trigger"
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", active ? "bg-[hsl(var(--accent-primary-soft))]" : "bg-[hsl(var(--surface-elevated))] text-muted-ui")}>
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
