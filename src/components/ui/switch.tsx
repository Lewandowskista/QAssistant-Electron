import * as React from "react"

import { cn } from "@/lib/utils"

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onToggle" | "role" | "type"> {
    /** Whether the switch is on. */
    on: boolean
    /** Called when the switch is activated (click, Space, or Enter). */
    onToggle: () => void
    /** Accessible name, when no visible label is associated via aria-labelledby. */
    label?: string
}

/**
 * Accessible on/off switch: role="switch" with aria-checked, native button
 * keyboard handling (Space/Enter), and a visible focus ring.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    ({ on, onToggle, label, className, disabled, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={onToggle}
            data-state={on ? "checked" : "unchecked"}
            className={cn(
                "h-6 w-11 flex-none rounded-full border transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-50",
                // The off-state track is deliberately mid-tone so the light thumb
                // keeps contrast in both themes.
                on ? "border-primary/30 bg-primary" : "border-ui bg-line-strong",
                className
            )}
            {...props}
        >
            <div
                className={cn(
                    "mx-1 h-4 w-4 rounded-full bg-primary-foreground shadow transition-transform",
                    on ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    )
)
Switch.displayName = "Switch"

export { Switch }
