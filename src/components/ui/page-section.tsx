import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface PageSectionProps {
  title?: string
  description?: string
  toolbar?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function PageSection({
  title,
  description,
  toolbar,
  children,
  className,
  contentClassName,
}: PageSectionProps) {
  return (
    <section className={cn("app-panel overflow-hidden", className)}>
      {(title || description || toolbar) && (
        <div className="flex flex-col gap-4 border-b px-5 py-4 md:flex-row md:items-center md:justify-between" style={{ borderColor: "hsl(var(--border-default))" }}>
          <div className="space-y-1">
            {title ? <h2 className="app-section-title">{title}</h2> : null}
            {description ? <p className="app-helper-text max-w-2xl">{description}</p> : null}
          </div>
          {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
        </div>
      )}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  )
}
