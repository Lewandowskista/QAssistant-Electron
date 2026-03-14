import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GitHubStoreState {
    acknowledgedReviews: string[]
    acknowledge: (key: string) => void
    unacknowledge: (key: string) => void
    isAcknowledged: (key: string) => boolean
}

export const useGitHubStore = create<GitHubStoreState>()(
    persist(
        (set, get) => ({
            acknowledgedReviews: [],
            acknowledge: (key: string) =>
                set(state => ({
                    acknowledgedReviews: state.acknowledgedReviews.includes(key)
                        ? state.acknowledgedReviews
                        : [...state.acknowledgedReviews, key],
                })),
            unacknowledge: (key: string) =>
                set(state => ({
                    acknowledgedReviews: state.acknowledgedReviews.filter(k => k !== key),
                })),
            isAcknowledged: (key: string) => get().acknowledgedReviews.includes(key),
        }),
        {
            name: 'github-store',
        }
    )
)
