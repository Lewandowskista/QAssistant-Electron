import * as React from "react"
import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value?: number }
>(({ className, value, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "relative h-2 w-full overflow-hidden rounded-full bg-[#1A1A24]",
            className
        )}
        {...props}
    >
        <div
            className="h-full w-full flex-1 bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] transition-all duration-500 ease-out shadow-[0_0_10px_rgba(124,58,237,0.5)]"
            style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
    </div>
))
Progress.displayName = "Progress"

export { Progress }
