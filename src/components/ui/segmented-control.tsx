import type { LucideIcon } from "lucide-react"

import { SubtabBar } from "@/components/ui/subtab-bar"

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

/**
 * Thin adapter over SubtabBar kept for its existing consumers — the two
 * components used to be duplicate implementations of the same control.
 * Prefer SubtabBar in new code.
 */
export function SegmentedControl({ value, options, onChange, className }: SegmentedControlProps) {
  return (
    <SubtabBar
      value={value}
      onChange={onChange}
      className={className}
      items={options.map((option) => ({
        id: option.value,
        label: option.label,
        icon: option.icon,
        count: option.count,
      }))}
    />
  )
}
