import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface SplitPaneShellProps {
  sidebar: ReactNode
  content: ReactNode
  detail?: ReactNode
  className?: string
}

export function SplitPaneShell({ sidebar, content, detail, className }: SplitPaneShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden", className)}>
      <aside className="flex w-[300px] shrink-0 flex-col border-r bg-[hsl(var(--surface-card)/0.92)]" style={{ borderColor: "hsl(var(--border-default))" }}>
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 overflow-hidden">{content}</div>
      {detail ? (
        <aside className="flex w-[380px] shrink-0 flex-col border-l bg-[hsl(var(--surface-overlay)/0.96)]" style={{ borderColor: "hsl(var(--border-default))" }}>
          {detail}
        </aside>
      ) : null}
    </div>
  )
}
