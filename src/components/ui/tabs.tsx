"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
    value?: string
    onValueChange?: (value: string) => void
}>({})

const Tabs = ({ value, onValueChange, children, className }: any) => {
    return (
        <TabsContext.Provider value={{ value, onValueChange }}>
            <div className={cn("w-full", className)}>{children}</div>
        </TabsContext.Provider>
    )
}

const TabsList = ({ className, children }: any) => {
    return (
        <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-zinc-100 p-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400", className)}>
            {children}
        </div>
    )
}

const TabsTrigger = ({ value, className, children }: any) => {
    const { value: activeValue, onValueChange } = React.useContext(TabsContext)
    const isActive = activeValue === value
    return (
        <button
            onClick={() => onValueChange?.(value)}
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
                isActive ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50" : "hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50",
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
    return <div className={cn("mt-2 outline-none", className)}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
