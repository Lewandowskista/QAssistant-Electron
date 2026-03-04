import { useState, useEffect } from "react"
import { Minus, Square, X, Copy } from "lucide-react"

export function WindowControls() {
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        if (window.electronAPI?.onMaximizedStatus) {
            return window.electronAPI.onMaximizedStatus((status: boolean) => {
                setIsMaximized(status)
            })
        }
    }, [])

    const handleMinimize = () => window.electronAPI?.minimize()
    const handleMaximize = () => window.electronAPI?.maximize()
    const handleClose = () => window.electronAPI?.close()

    return (
        <div className="flex items-center app-region-no-drag">
            <button
                onClick={handleMinimize}
                className="h-10 w-10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title="Minimize"
            >
                <Minus className="h-4 w-4" />
            </button>
            <button
                onClick={handleMaximize}
                className="h-10 w-10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                title={isMaximized ? "Restore" : "Maximize"}
            >
                {isMaximized ? (
                    <Copy className="h-3.5 w-3.5 rotate-180" />
                ) : (
                    <Square className="h-3.5 w-3.5" />
                )}
            </button>
            <button
                onClick={handleClose}
                className="h-10 w-12 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                title="Close"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
