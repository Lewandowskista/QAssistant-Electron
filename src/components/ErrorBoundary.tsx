import React from 'react'
import { Button } from '@/components/ui/button'

interface Props {
    children: React.ReactNode
    name?: string
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[ErrorBoundary${this.props.name ? ` – ${this.props.name}` : ''}] Uncaught error:`, error, info.componentStack)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-xl m-6">
                    <h2 className="text-lg font-bold text-red-400 mb-2">
                        {this.props.name ? `Error in ${this.props.name}` : 'Something went wrong'}
                    </h2>
                    <p className="text-sm text-red-400/80 font-mono whitespace-pre-wrap mb-4">
                        {this.state.error?.message}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-red-500/30 text-red-400"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Try to Recover
                    </Button>
                </div>
            )
        }
        return this.props.children
    }
}

export default ErrorBoundary
