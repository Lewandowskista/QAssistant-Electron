import { useState, useEffect } from 'react'
import { GitHubRepo } from '@/types/github'

export function useGitHubRepos() {
    const api = window.electronAPI

    const [repos, setRepos] = useState<GitHubRepo[]>([])
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        (async () => {
            try {
                const result = await api.githubGetRepos()
                if ('__isError' in result) {
                    setError(result.message)
                } else {
                    setRepos(result)
                    if (result.length > 0 && !selectedRepo) {
                        setSelectedRepo(result[0])
                    }
                }
            } catch (e: any) {
                setError(e.message)
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    return { repos, selectedRepo, setSelectedRepo, loading, error, setError }
}
