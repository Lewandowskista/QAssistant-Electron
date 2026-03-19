import { useState, useEffect } from 'react'
import { GitHubRepo } from '@/types/github'
import { safeInvoke } from '@/lib/safeInvoke'

export function useGitHubRepos() {
    const [repos, setRepos] = useState<GitHubRepo[]>([])
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        (async () => {
            const result = await safeInvoke(
                () => window.electronAPI.githubGetRepos(),
                'Failed to load GitHub repositories',
            )
            if (result === null) {
                setError('Failed to load repositories')
            } else {
                setRepos(result)
                if (result.length > 0) {
                    setSelectedRepo(result[0])
                }
            }
            setLoading(false)
        })()
    }, [])

    return { repos, selectedRepo, setSelectedRepo, loading, error, setError }
}
