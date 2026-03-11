import { useProjectStore } from '@/store/useProjectStore'
import { FolderOpen } from 'lucide-react'

interface Props {
    children: React.ReactNode
}

/**
 * Route guard that shows a "no project selected" fallback
 * when no project is active. Wrap routes that require an active project.
 */
export function RequireProject({ children }: Props) {
    const activeProjectId = useProjectStore(s => s.activeProjectId)

    if (!activeProjectId) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface-overlay gap-4 text-center p-8">
                <div className="w-20 h-20 rounded-full bg-surface-elevated flex items-center justify-center opacity-40">
                    <FolderOpen className="h-10 w-10 text-qa-purple" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-qa-text mb-1">No Project Selected</h2>
                    <p className="text-sm text-qa-text-muted">Select or create a project from the sidebar to get started.</p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}

export default RequireProject
