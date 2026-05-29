import { cn } from "@/lib/utils"

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[hsl(var(--surface-elevated)/0.6)]", className)}
      {...props}
    />
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("app-panel p-5 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <Skeleton className="h-3 w-24 rounded" />
      </div>
      <Skeleton className="h-8 w-16 rounded" />
      <Skeleton className="h-3 w-32 rounded" />
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="page-scaffold animate-in fade-in duration-300 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 app-panel p-5 h-48">
          <Skeleton className="h-4 w-32 rounded mb-4" />
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        <div className="app-panel p-5 h-48">
          <Skeleton className="h-4 w-24 rounded mb-4" />
          <Skeleton className="h-full w-full rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonKanban() {
  return (
    <div className="flex gap-3 p-4 h-full animate-in fade-in duration-300">
      {Array.from({ length: 4 }).map((_, col) => (
        <div key={col} className="w-72 shrink-0 space-y-2">
          <Skeleton className="h-8 w-full rounded-lg" />
          {Array.from({ length: 3 + (col % 2) }).map((_, i) => (
            <div key={i} className="app-panel p-3 space-y-2">
              <Skeleton className="h-3 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonNotesList() {
  return (
    <div className="space-y-1 p-2 animate-in fade-in duration-200">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg p-3 space-y-1.5">
          <Skeleton className="h-3 w-3/4 rounded" />
          <Skeleton className="h-2.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonEditor() {
  return (
    <div className="flex-1 p-6 space-y-4 animate-in fade-in duration-300">
      <Skeleton className="h-8 w-2/3 rounded" />
      <div className="space-y-2 pt-2">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
        <Skeleton className="h-3 w-4/6 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-3/4 rounded" />
      </div>
    </div>
  )
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4 animate-in fade-in duration-300">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-3 border border-[hsl(var(--border-subtle))]">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-2.5 w-1/3 rounded" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
