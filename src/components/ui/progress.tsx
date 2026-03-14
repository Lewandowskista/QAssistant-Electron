import * as React from "react"
import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "relative h-2 w-full overflow-hidden rounded-full bg-muted/80",
            className
        )}
        {...props}
    >
        <div
            className="h-full w-full flex-1 bg-[linear-gradient(90deg,hsl(var(--accent-primary-strong)),hsl(var(--accent-primary)))] transition-all duration-500 ease-out shadow-[0_0_12px_hsl(var(--accent-primary)/0.22)]"
            style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
    </div>
))
Progress.displayName = "Progress"

export { Progress }
