"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
    value?: string
    onValueChange?: (value: string) => void
    variant?: "default" | "underline" | "subtab"
    baseId?: string
}>({})

/** Stable, DOM-safe id fragment for a tab value. */
const slugify = (value: string) => String(value).replace(/[^a-zA-Z0-9_-]/g, "-")
const triggerId = (baseId: string | undefined, value: string) => `${baseId ?? "tabs"}-trigger-${slugify(value)}`
const panelId = (baseId: string | undefined, value: string) => `${baseId ?? "tabs"}-panel-${slugify(value)}`

const tabsListVariants = cva("inline-flex items-center", {
    variants: {
        variant: {
            default: "h-9 justify-center rounded-lg bg-muted p-1 text-muted-foreground",
            underline: "h-10 w-max min-w-full justify-start gap-4 rounded-none bg-transparent px-2 text-muted-foreground",
            subtab: "app-subtab-bar",
        },
    },
    defaultVariants: {
        variant: "default",
    },
})

const tabsTriggerVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "rounded-md px-3 py-1 text-sm font-medium",
                underline: "rounded-none px-2 text-xs font-bold",
                subtab: "app-subtab-trigger",
            },
            state: {
                active: "",
                inactive: "",
            },
        },
        compoundVariants: [
            {
                variant: "default",
                state: "active",
                className: "bg-background text-foreground shadow-sm",
            },
            {
                variant: "default",
                state: "inactive",
                className: "hover:bg-background/50",
            },
            {
                variant: "underline",
                state: "active",
                className: "border-b-2 border-[hsl(var(--accent-primary))] bg-transparent text-[hsl(var(--accent-primary))] shadow-none",
            },
            {
                variant: "underline",
                state: "inactive",
                className: "border-b-2 border-transparent text-muted-ui hover:text-foreground",
            },
            {
                variant: "subtab",
                state: "active",
                className: "",
            },
            {
                variant: "subtab",
                state: "inactive",
                className: "",
            },
        ],
        defaultVariants: {
            variant: "default",
            state: "inactive",
        },
    }
)

const Tabs = ({ value, onValueChange, children, className, variant = "default" }: any) => {
    const baseId = React.useId()
    const ctx = React.useMemo(
        () => ({ value, onValueChange, variant, baseId }),
        [value, onValueChange, variant, baseId]
    )
    return (
        <TabsContext.Provider value={ctx}>
            <div className={cn("w-full", className)}>{children}</div>
        </TabsContext.Provider>
    )
}

/**
 * Tab list with roving focus: Left/Right/Home/End move focus and selection,
 * matching the SubtabBar pattern.
 */
const TabsList = ({ className, children, variant, ...props }: any) => {
    const ctx = React.useContext(TabsContext)
    const resolvedVariant = variant || ctx.variant || "default"
    const listRef = React.useRef<HTMLDivElement>(null)

    const tabs = () =>
        Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? [])

    const focusAndSelect = (index: number) => {
        const items = tabs()
        const target = items[index]
        if (!target) return
        const nextValue = target.dataset.value
        if (nextValue) ctx.onValueChange?.(nextValue)
        target.focus()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const current = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[role="tab"]')
        if (!current) return
        const items = tabs()
        const index = items.indexOf(current)
        if (index < 0) return
        const last = items.length - 1
        switch (event.key) {
            case "ArrowRight": event.preventDefault(); focusAndSelect(index === last ? 0 : index + 1); break
            case "ArrowLeft": event.preventDefault(); focusAndSelect(index === 0 ? last : index - 1); break
            case "Home": event.preventDefault(); focusAndSelect(0); break
            case "End": event.preventDefault(); focusAndSelect(last); break
        }
    }

    return (
        <div
            ref={listRef}
            role="tablist"
            onKeyDown={handleKeyDown}
            className={cn(tabsListVariants({ variant: resolvedVariant }), className)}
            {...props}
        >
            {children}
        </div>
    )
}

const TabsTrigger = ({ value, className, children, variant, ...props }: any) => {
    const { value: activeValue, onValueChange, variant: ctxVariant, baseId } = React.useContext(TabsContext)
    const isActive = activeValue === value
    const resolvedVariant = variant || ctxVariant || "default"
    return (
        <button
            type="button"
            role="tab"
            id={triggerId(baseId, value)}
            aria-selected={isActive}
            aria-controls={panelId(baseId, value)}
            tabIndex={isActive ? 0 : -1}
            data-value={value}
            data-state={isActive ? "active" : "inactive"}
            onClick={() => onValueChange?.(value)}
            className={cn(
                tabsTriggerVariants({ variant: resolvedVariant, state: isActive ? "active" : "inactive" }),
                className
            )}
            {...props}
        >
            {children}
        </button>
    )
}

const TabsContent = ({ value, className, children, ...props }: any) => {
    const { value: activeValue, baseId } = React.useContext(TabsContext)
    if (activeValue !== value) return null
    return (
        <div
            role="tabpanel"
            id={panelId(baseId, value)}
            aria-labelledby={triggerId(baseId, value)}
            tabIndex={0}
            className={cn("mt-2 outline-none", className)}
            {...props}
        >
            {children}
        </div>
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
