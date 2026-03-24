/**
 * GitHub REST API integration module.
 *
 * All calls go through githubFetch() which handles:
 *  - Bearer token auth from credentialService
 *  - Rate-limit tracking (X-RateLimit-Remaining / Reset)
 *  - In-memory response cache with per-endpoint TTLs
 *  - Standard headers (User-Agent, API version, Accept)
 */

import https from 'node:https'
import { getCredential } from './credentialService'

// ── Rate-limit state ───────────────────────────────────────────────────────

let rateLimitRemaining: number | null = null
let rateLimitReset: number | null = null // epoch seconds

// ── In-memory cache ────────────────────────────────────────────────────────

const cache = new Map<string, { data: any; fetchedAt: number }>()

const DEFAULT_TTL_MS = 60_000

function getCached(key: string, ttlMs: number): any | null {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.fetchedAt > ttlMs) {
        cache.delete(key)
        return null
    }
    return entry.data
}

function setCache(key: string, data: any): void {
    cache.set(key, { data, fetchedAt: Date.now() })
}

// ── Core fetch helper ──────────────────────────────────────────────────────

interface FetchOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: string
    cacheTtlMs?: number
    forceRefresh?: boolean
}

async function getToken(): Promise<string> {
    const token = await getCredential('oauth_github_access_token')
    if (!token) throw new Error('GitHub not connected. Please connect your GitHub account in Settings → Account & Identity.')
    return token
}

async function githubFetch<T = any>(path: string, opts: FetchOptions = {}): Promise<T> {
    const { method = 'GET', body, cacheTtlMs = DEFAULT_TTL_MS, forceRefresh = false } = opts

    // Check cache for GET requests
    if (method === 'GET' && !forceRefresh) {
        const cached = getCached(path, cacheTtlMs)
        if (cached !== null) return cached as T
    }

    // Check rate limit
    if (rateLimitRemaining !== null && rateLimitRemaining <= 0 && rateLimitReset !== null) {
        const resetMs = rateLimitReset * 1000
        if (Date.now() < resetMs) {
            const waitSec = Math.ceil((resetMs - Date.now()) / 1000)
            throw new Error(`GitHub API rate limit exceeded. Resets in ${waitSec}s.`)
        }
    }

    const token = await getToken()

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'QAssistant-Electron',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if (body) {
        headers['Content-Type'] = 'application/json'
    }

    const responseData = await new Promise<{ body: string; headers: Record<string, string>; status: number }>((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path,
            method,
            headers: { ...headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) },
            timeout: 30_000,
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => {
                // Track rate limits
                const remaining = res.headers['x-ratelimit-remaining']
                const reset = res.headers['x-ratelimit-reset']
                if (remaining !== undefined) rateLimitRemaining = Number(remaining)
                if (reset !== undefined) rateLimitReset = Number(reset)

                const resHeaders: Record<string, string> = {}
                for (const [k, v] of Object.entries(res.headers)) {
                    if (typeof v === 'string') resHeaders[k] = v
                }
                resolve({ body: data, headers: resHeaders, status: res.statusCode || 0 })
            })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('GitHub API request timed out')) })
        if (body) req.write(body)
        req.end()
    })

    if (responseData.status === 403 && rateLimitRemaining === 0) {
        const resetSec = rateLimitReset ? Math.ceil((rateLimitReset * 1000 - Date.now()) / 1000) : 60
        throw new Error(`GitHub API rate limit exceeded. Resets in ${resetSec}s.`)
    }

    if (responseData.status === 401) {
        throw new Error('GitHub token is invalid or expired. Please re-connect in Settings → Account & Identity.')
    }

    if (responseData.status >= 400) {
        let msg = `GitHub API error ${responseData.status}`
        try { msg += `: ${JSON.parse(responseData.body).message}` } catch { /* ignore */ }
        throw new Error(msg)
    }

    // 204 No Content (e.g. workflow rerun)
    if (responseData.status === 204 || !responseData.body) {
        const result = {} as T
        return result
    }

    const parsed = JSON.parse(responseData.body) as T

    // Cache GET responses
    if (method === 'GET') {
        setCache(path, parsed)
    }

    return parsed
}

// ── Scope check ────────────────────────────────────────────────────────────

/**
 * Checks whether the stored GitHub token has the `repo` scope.
 * Returns { hasRepoScope, scopes } or throws if not connected.
 */
export async function checkTokenScope(): Promise<{ hasRepoScope: boolean; scopes: string }> {
    const token = await getToken()

    const result = await new Promise<{ scopes: string }>((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path: '/user',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'QAssistant-Electron',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        }, (res) => {
            // Consume body
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => {
                const scopes = res.headers['x-oauth-scopes'] || ''
                resolve({ scopes: typeof scopes === 'string' ? scopes : '' })
            })
        })
        req.on('error', reject)
        req.end()
    })

    const scopeList = result.scopes.split(',').map(s => s.trim())
    return {
        hasRepoScope: scopeList.includes('repo'),
        scopes: result.scopes,
    }
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function getRepos(forceRefresh = false) {
    const data = await githubFetch<any[]>('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
        cacheTtlMs: 5 * 60_000, forceRefresh,
    })
    return data.map((r: any) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at,
        owner: { login: r.owner.login, avatarUrl: r.owner.avatar_url },
    }))
}

export async function getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', forceRefresh = false) {
    const data = await githubFetch<any[]>(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=50&sort=updated`, {
        cacheTtlMs: 60_000, forceRefresh,
    })
    return data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        htmlUrl: pr.html_url,
        author: pr.user?.login || '',
        authorAvatar: pr.user?.avatar_url || '',
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        headBranch: pr.head?.ref || '',
        baseBranch: pr.base?.ref || '',
        draft: !!pr.draft,
        requestedReviewers: (pr.requested_reviewers || []).map((r: any) => r.login),
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
        labels: (pr.labels || []).map((l: any) => ({ name: l.name, color: l.color })),
        checkStatus: null, // filled by separate call if needed
    }))
}

export async function getPrDetail(owner: string, repo: string, prNumber: number) {
    const [pr, files] = await Promise.all([
        githubFetch<any>(`/repos/${owner}/${repo}/pulls/${prNumber}`, { cacheTtlMs: 60_000 }),
        githubFetch<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, { cacheTtlMs: 60_000 }),
    ])
    return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        htmlUrl: pr.html_url,
        author: pr.user?.login || '',
        authorAvatar: pr.user?.avatar_url || '',
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        headBranch: pr.head?.ref || '',
        baseBranch: pr.base?.ref || '',
        draft: !!pr.draft,
        requestedReviewers: (pr.requested_reviewers || []).map((r: any) => r.login),
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
        labels: (pr.labels || []).map((l: any) => ({ name: l.name, color: l.color })),
        mergeable: pr.mergeable,
        mergeableState: pr.mergeable_state,
        body: pr.body || '',
        files: files.map((file: any) => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions || 0,
            deletions: file.deletions || 0,
            changes: file.changes || 0,
            patch: file.patch,
        })),
        checkStatus: null,
    }
}

export async function getPrReviews(owner: string, repo: string, prNumber: number) {
    const data = await githubFetch<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, { cacheTtlMs: 60_000 })
    return data.map((r: any) => ({
        id: r.id,
        user: r.user?.login || '',
        userAvatar: r.user?.avatar_url || '',
        state: r.state,
        submittedAt: r.submitted_at,
        body: r.body || '',
    }))
}

export async function getPrCheckStatus(owner: string, repo: string, ref: string) {
    const data = await githubFetch<any>(`/repos/${owner}/${repo}/commits/${ref}/check-suites`, { cacheTtlMs: 30_000 })
    const suites = data.check_suites || []
    if (suites.length === 0) return null
    const hasFailure = suites.some((s: any) => s.conclusion === 'failure')
    const allSuccess = suites.every((s: any) => s.conclusion === 'success' || s.conclusion === 'skipped')
    if (hasFailure) return 'failure'
    if (allSuccess) return 'success'
    return 'pending'
}

export async function getCommits(owner: string, repo: string, branch?: string, forceRefresh = false) {
    const sha = branch ? `&sha=${encodeURIComponent(branch)}` : ''
    const data = await githubFetch<any[]>(`/repos/${owner}/${repo}/commits?per_page=30${sha}`, {
        cacheTtlMs: 60_000, forceRefresh,
    })
    return data.map((c: any) => ({
        sha: c.sha,
        shortSha: c.sha.substring(0, 7),
        message: c.commit?.message || '',
        authorName: c.commit?.author?.name || '',
        authorLogin: c.author?.login || '',
        authorAvatar: c.author?.avatar_url || '',
        date: c.commit?.author?.date || '',
        htmlUrl: c.html_url || '',
    }))
}

export async function getReviewRequests(forceRefresh = false) {
    const data = await githubFetch<any>('/search/issues?q=type:pr+state:open+review-requested:@me&per_page=50', {
        cacheTtlMs: 60_000, forceRefresh,
    })
    return (data.items || []).map((item: any) => {
        const repoUrl = item.repository_url || ''
        const repoParts = repoUrl.replace('https://api.github.com/repos/', '').split('/')
        return {
            number: item.number,
            title: item.title,
            htmlUrl: item.html_url,
            author: item.user?.login || '',
            authorAvatar: item.user?.avatar_url || '',
            createdAt: item.created_at,
            repoFullName: repoParts.length >= 2 ? `${repoParts[0]}/${repoParts[1]}` : '',
        }
    })
}

export async function getMyOpenPrs(forceRefresh = false) {
    const data = await githubFetch<any>('/search/issues?q=type:pr+state:open+author:@me&per_page=50', {
        cacheTtlMs: 60_000, forceRefresh,
    })
    return (data.items || []).map((item: any) => {
        const repoUrl = item.repository_url || ''
        const repoParts = repoUrl.replace('https://api.github.com/repos/', '').split('/')
        return {
            number: item.number,
            title: item.title,
            htmlUrl: item.html_url,
            author: item.user?.login || '',
            authorAvatar: item.user?.avatar_url || '',
            createdAt: item.created_at,
            repoFullName: repoParts.length >= 2 ? `${repoParts[0]}/${repoParts[1]}` : '',
        }
    })
}

export async function getWorkflowRuns(owner: string, repo: string, forceRefresh = false) {
    const data = await githubFetch<any>(`/repos/${owner}/${repo}/actions/runs?per_page=30`, {
        cacheTtlMs: 30_000, forceRefresh,
    })
    return (data.workflow_runs || []).map((r: any) => {
        let durationMs: number | null = null
        if (r.run_started_at && r.updated_at) {
            durationMs = new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()
        }
        return {
            id: r.id,
            name: r.name || '',
            status: r.status,
            conclusion: r.conclusion,
            headBranch: r.head_branch || '',
            event: r.event || '',
            createdAt: r.created_at,
            htmlUrl: r.html_url || '',
            durationMs,
        }
    })
}

export async function getDeployments(owner: string, repo: string, forceRefresh = false) {
    const deployments = await githubFetch<any[]>(`/repos/${owner}/${repo}/deployments?per_page=30`, {
        cacheTtlMs: 60_000, forceRefresh,
    })

    // Fetch latest status for each deployment
    const results = await Promise.all(deployments.map(async (d: any) => {
        let latestStatus = null
        try {
            const statuses = await githubFetch<any[]>(`/repos/${owner}/${repo}/deployments/${d.id}/statuses?per_page=1`, {
                cacheTtlMs: 60_000,
            })
            if (statuses.length > 0) {
                latestStatus = {
                    state: statuses[0].state,
                    description: statuses[0].description || '',
                    createdAt: statuses[0].created_at,
                    targetUrl: statuses[0].target_url || statuses[0].environment_url || null,
                }
            }
        } catch { /* status fetch failure is non-fatal */ }

        return {
            id: d.id,
            environment: d.environment || '',
            ref: d.ref || '',
            sha: d.sha?.substring(0, 7) || '',
            creator: d.creator?.login || '',
            createdAt: d.created_at,
            latestStatus,
        }
    }))

    return results
}

export async function getBranches(owner: string, repo: string, forceRefresh = false) {
    const data = await githubFetch<any[]>(`/repos/${owner}/${repo}/branches?per_page=100`, {
        cacheTtlMs: 2 * 60_000, forceRefresh,
    })
    return data.map((b: any) => ({
        name: b.name as string,
        sha: b.commit?.sha?.substring(0, 7) || '',
    }))
}

export async function rerunWorkflow(owner: string, repo: string, runId: number) {
    await githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {
        method: 'POST',
    })
    return { success: true }
}

export async function getPrComments(owner: string, repo: string, prNumber: number) {
    const [issueComments, reviewComments] = await Promise.all([
        githubFetch<any[]>(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=50`, { cacheTtlMs: 60_000 }),
        githubFetch<any[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=50`, { cacheTtlMs: 60_000 }),
    ])

    const all = [
        ...issueComments.map((c: any) => ({
            id: c.id,
            user: c.user?.login || '',
            userAvatar: c.user?.avatar_url || '',
            body: c.body || '',
            createdAt: c.created_at,
        })),
        ...reviewComments.map((c: any) => ({
            id: c.id,
            user: c.user?.login || '',
            userAvatar: c.user?.avatar_url || '',
            body: c.body || '',
            createdAt: c.created_at,
        })),
    ]

    all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return all
}

export async function getWorkflowJobs(owner: string, repo: string, runId: number) {
    const data = await githubFetch<any>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { cacheTtlMs: 30_000 })
    return (data.jobs || []).map((job: any) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at || '',
        completedAt: job.completed_at || null,
        steps: (job.steps || []).map((s: any) => ({
            name: s.name,
            status: s.status,
            conclusion: s.conclusion,
        })),
    }))
}

export async function getWorkflowsList(owner: string, repo: string) {
    const data = await githubFetch<any>(`/repos/${owner}/${repo}/actions/workflows?per_page=50`, { cacheTtlMs: 5 * 60_000 })
    return (data.workflows || []).map((w: any) => ({
        id: w.id,
        name: w.name,
        state: w.state,
        path: w.path,
    }))
}

export async function dispatchWorkflow(owner: string, repo: string, workflowId: number, ref: string) {
    await githubFetch(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref }),
    })
    return { success: true }
}
