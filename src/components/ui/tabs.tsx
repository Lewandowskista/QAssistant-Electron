"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
    value?: string
    onValueChange?: (value: string) => void
    variant?: "default" | "underline" | "subtab"
}>({})

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
    return (
        <TabsContext.Provider value={{ value, onValueChange, variant }}>
            <div className={cn("w-full", className)}>{children}</div>
        </TabsContext.Provider>
    )
}

const TabsList = ({ className, children, variant }: any) => {
    const ctx = React.useContext(TabsContext)
    const resolvedVariant = variant || ctx.variant || "default"
    return (
        <div
            role="tablist"
            className={cn(tabsListVariants({ variant: resolvedVariant }), className)}
        >
            {children}
        </div>
    )
}

const TabsTrigger = ({ value, className, children, variant }: any) => {
    const { value: activeValue, onValueChange, variant: ctxVariant } = React.useContext(TabsContext)
    const isActive = activeValue === value
    const resolvedVariant = variant || ctxVariant || "default"
    return (
        <button
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-state={isActive ? "active" : "inactive"}
            onClick={() => onValueChange?.(value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onValueChange?.(value)
                }
            }}
            className={cn(
                tabsTriggerVariants({ variant: resolvedVariant, state: isActive ? "active" : "inactive" }),
                className
            )}
        >
            {children}
        </button>
    )
}

const TabsContent = ({ value, className, children }: any) => {
    const { value: activeValue } = React.useContext(TabsContext)
    if (activeValue !== value) return null
    return <div role="tabpanel" className={cn("mt-2 outline-none", className)}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
