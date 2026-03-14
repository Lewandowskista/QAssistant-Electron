import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface SegmentedOption {
  value: string
  label: string
  icon?: LucideIcon
  count?: number
}

interface SegmentedControlProps {
  value: string
  options: SegmentedOption[]
  onChange: (value: string) => void
  className?: string
}

export function SegmentedControl({ value, options, onChange, className }: SegmentedControlProps) {
  return (
    <div className={cn("app-subtab-bar", className)}>
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            data-state={active ? "active" : "inactive"}
            className="app-subtab-trigger"
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-[hsl(var(--accent-primary-soft))]" : "bg-[hsl(var(--surface-elevated))] text-muted-ui")}>
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
