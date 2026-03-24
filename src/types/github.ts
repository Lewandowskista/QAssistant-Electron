export interface GitHubRepo {
    id: number
    name: string
    fullName: string
    private: boolean
    htmlUrl: string
    defaultBranch: string
    updatedAt: string
    owner: { login: string; avatarUrl: string }
}

export interface GitHubPullRequest {
    number: number
    title: string
    state: 'open' | 'closed'
    htmlUrl: string
    author: string
    authorAvatar: string
    createdAt: string
    updatedAt: string
    headBranch: string
    baseBranch: string
    draft: boolean
    requestedReviewers: string[]
    additions: number
    deletions: number
    changedFiles: number
    labels: { name: string; color: string }[]
    checkStatus: 'success' | 'failure' | 'pending' | null
}

export interface GitHubPrDetail extends GitHubPullRequest {
    mergeable: boolean | null
    mergeableState: string
    body: string
    files: GitHubPrFile[]
}

export interface GitHubPrFile {
    filename: string
    status: string
    additions: number
    deletions: number
    changes: number
    patch?: string
}

export interface GitHubCommit {
    sha: string
    shortSha: string
    message: string
    authorName: string
    authorLogin: string
    authorAvatar: string
    date: string
    htmlUrl: string
}

export interface GitHubReview {
    id: number
    user: string
    userAvatar: string
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
    submittedAt: string
    body: string
}

export interface GitHubWorkflowRun {
    id: number
    name: string
    status: 'queued' | 'in_progress' | 'completed' | 'waiting'
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null
    headBranch: string
    event: string
    createdAt: string
    htmlUrl: string
    durationMs: number | null
}

export interface GitHubDeployment {
    id: number
    environment: string
    ref: string
    sha: string
    creator: string
    createdAt: string
    latestStatus: {
        state: 'success' | 'failure' | 'error' | 'pending' | 'inactive' | 'in_progress'
        description: string
        createdAt: string
        targetUrl: string | null
    } | null
}

export interface GitHubComment {
    id: number
    user: string
    userAvatar: string
    body: string
    createdAt: string
}

export interface GitHubWorkflowJob {
    id: number
    name: string
    status: string
    conclusion: string | null
    startedAt: string
    completedAt: string | null
    steps: { name: string; status: string; conclusion: string | null }[]
}

export interface GitHubWorkflow {
    id: number
    name: string
    state: string
    path: string
}

export interface GitHubSearchItem {
    number: number
    title: string
    htmlUrl: string
    author: string
    authorAvatar: string
    createdAt: string
    repoFullName: string
}
