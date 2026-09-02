import React from 'react'
import { AlertTriangle, ClipboardCopy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    children: React.ReactNode
    name?: string
}

interface State {
    hasError: boolean
    error: Error | null
    componentStack: string | null
    copied: boolean
}

/**
 * Route-level error boundary. Shows a plain-language recovery card rather than
 * a raw stack trace; the technical detail stays available behind a disclosure
 * so it can still be copied into a bug report.
 */
export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null, componentStack: null, copied: false }
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.setState({ componentStack: info.componentStack ?? null })
        console.error(`[ErrorBoundary${this.props.name ? ` – ${this.props.name}` : ''}] Uncaught error:`, error, info.componentStack)
    }

    private details() {
        const where = this.props.name ? `Screen: ${this.props.name}\n` : ''
        return `${where}${this.state.error?.name ?? 'Error'}: ${this.state.error?.message ?? 'unknown'}\n\n${this.state.componentStack ?? ''}`.trim()
    }

    private handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(this.details())
            this.setState({ copied: true })
            window.setTimeout(() => this.setState({ copied: false }), 2000)
        } catch {
            // Clipboard can be unavailable; the details stay visible for manual copy.
        }
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null, componentStack: null, copied: false })
    }

    render() {
        if (!this.state.hasError) return this.props.children

        const where = this.props.name ? ` on ${this.props.name}` : ''

        return (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                <div className="app-panel w-full max-w-lg p-6">
                    <div className="flex items-start gap-4">
                        <div className="app-status-danger flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                            <AlertTriangle className="h-5 w-5 text-state-danger" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <h2 className="app-section-title text-lg">Something went wrong{where}</h2>
                            <p className="app-helper-text">
                                This screen stopped responding, but your work is saved. Try again — if it keeps
                                happening, copy the details and include them in a bug report.
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                        <Button onClick={this.handleRetry} className="gap-2">
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            Try again
                        </Button>
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            Reload app
                        </Button>
                        <Button variant="ghost" onClick={this.handleCopy} className="gap-2">
                            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                            {this.state.copied ? 'Copied' : 'Copy details'}
                        </Button>
                    </div>

                    <details className="mt-4 rounded-xl border border-ui bg-panel-muted">
                        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-soft">
                            Technical details
                        </summary>
                        <pre className="max-h-56 overflow-auto border-t border-ui px-4 py-3 text-xs leading-5 text-muted-ui whitespace-pre-wrap">
                            {this.details()}
                        </pre>
                    </details>
                </div>
            </div>
        )
    }
}

export default ErrorBoundary
