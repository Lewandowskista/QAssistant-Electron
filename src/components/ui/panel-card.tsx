import type { HTMLAttributes } from "react"

import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const panelCardVariants = cva("app-panel", {
  variants: {
    density: {
      comfy: "p-6",
      compact: "p-4",
    },
    tone: {
      default: "",
      muted: "bg-[hsl(var(--surface-card-alt)/0.8)]",
      selected: "border-[hsl(var(--border-strong))] bg-[linear-gradient(180deg,hsl(var(--surface-selected)/0.82),hsl(var(--surface-card)/0.95))]",
    },
  },
  defaultVariants: {
    density: "comfy",
    tone: "default",
  },
})

type PanelCardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof panelCardVariants>

export function PanelCard({ className, density, tone, ...props }: PanelCardProps) {
  return <div className={cn(panelCardVariants({ density, tone }), className)} {...props} />
}
