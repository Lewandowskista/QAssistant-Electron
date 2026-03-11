import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <p className="text-6xl font-bold text-qa-purple/30">404</p>
            <h1 className="text-xl font-semibold text-qa-text">Page not found</h1>
            <p className="text-sm text-qa-text-muted">The page you navigated to doesn't exist.</p>
            <Button asChild variant="outline" size="sm" className="mt-2 border-qa-border text-qa-purple">
                <Link to="/"><Home className="h-4 w-4 mr-2" />Go to Dashboard</Link>
            </Button>
        </div>
    )
}
