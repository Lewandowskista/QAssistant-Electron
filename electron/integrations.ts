// cspell:ignore unstarted duedate issuetype
import { getCredential } from './credentialService';

// ── Status / Priority Mapping ────────────────────────────────────────────────

// ... existing code ...

function mapLinearPriority(priority: number): string {
    if (priority === 1) return 'critical'
    if (priority === 2) return 'high'
    if (priority === 3) return 'medium'
    return 'low'
}

// ── Description Cleaner ───────────────────────────────────────────────────────

function cleanDescription(raw?: string | null): string {
    if (!raw) return ''
    let s = raw
    // We used to strip everything here to get "clean" text, but since the frontend 
    // now uses FormattedText (markdown renderer), we should preserve formatting 
    // and especially images.
    s = s.replace(/<[^>]+>/g, '') // still strip HTML tags just in case
    s = s.replace(/\n{3,}/g, '\n\n').trim()
    return s
}

function getJiraBaseUrl(domain: string): string {
    const normalized = domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    return normalized.includes('.') ? `https://${normalized}` : `https://${normalized}.atlassian.net`
}

// ── Linear API ────────────────────────────────────────────────────────────────

const API_TIMEOUT_MS = 30_000

async function linearGraphQL(apiKey: string, query: string, variables?: Record<string, any>) {
    const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey.startsWith('lin_api_') || apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })

    const result = await res.json() as any
    if (!res.ok) {
        const msg = result.errors?.[0]?.message || res.statusText
        throw new Error(`Linear API HTTP ${res.status}: ${msg}`)
    }

    if (result.errors?.length > 0) throw new Error(result.errors[0].message)

    return result
}

async function resolveLinearTeamUuid(apiKey: string, teamId: string): Promise<string | null> {
    // If it looks like a UUID, return as-is
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) {
        return teamId
    }
    const teams = await getLinearTeams(apiKey)
    const found = teams.find((t: any) =>
        t.key?.toLowerCase() === teamId.toLowerCase() ||
        t.name?.toLowerCase() === teamId.toLowerCase() ||
        t.id === teamId
    )
    return found?.id || null
}

export async function getLinearTeams(apiKey: string): Promise<any[]> {
    const query = `{ teams { nodes { id key name } } }`
    const result = await linearGraphQL(apiKey, query)
    return result.data?.teams?.nodes || []
}

export async function fetchLinearIssues(apiKey: string, teamKey: string, connectionId?: string): Promise<any[]> {
    const resolvedTeamId = teamKey ? await resolveLinearTeamUuid(apiKey, teamKey) : null

    const allTasks: any[] = []
    let cursor: string | null = null
    let pagesFetched = 0
    const MAX_PAGES = 10

    do {
        let result: any
        if (resolvedTeamId) {
            const query = `
            query($teamId: String!, $after: String) {
                team(id: $teamId) {
                    issues(first: 250, after: $after) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                            id identifier title description priority
                            state { name }
                            assignee { name }
                            dueDate url
                            labels { nodes { name } }
                            attachments { nodes { url title } }
                            cycle { name startsAt endsAt }
                        }
                    }
                }
            }`
            const vars: any = { teamId: resolvedTeamId }
            if (cursor) vars.after = cursor
            result = await linearGraphQL(apiKey, query, vars)
            const issuesEl = result.data?.team?.issues
            parseLinearNodes(issuesEl?.nodes || [], allTasks, connectionId)
            cursor = null
            if (issuesEl?.pageInfo?.hasNextPage) cursor = issuesEl.pageInfo.endCursor
        } else {
            const query = `
            query($after: String) {
                issues(first: 250, after: $after) {
                    pageInfo { hasNextPage endCursor }
                    nodes {
                        id identifier title description priority
                        state { name }
                        assignee { name }
                        dueDate url
                        labels { nodes { name } }
                        attachments { nodes { url title } }
                        cycle { name startsAt endsAt }
                    }
                }
            }`
            const vars: any = {}
            if (cursor) vars.after = cursor
            result = await linearGraphQL(apiKey, query, vars)
            const issuesEl = result.data?.issues
            parseLinearNodes(issuesEl?.nodes || [], allTasks, connectionId)
            cursor = null
            if (issuesEl?.pageInfo?.hasNextPage) cursor = issuesEl.pageInfo.endCursor
        }

        pagesFetched++
    } while (cursor && pagesFetched < MAX_PAGES)

    return allTasks
}

function parseLinearNodes(nodes: any[], tasks: any[], connectionId?: string): void {
    const now = Date.now()
    for (const node of nodes) {
        const stateName = node.state?.name || ''
        const labels = (node.labels?.nodes || []).map((l: any) => l.name).join(', ')
        const attachmentUrls = (node.attachments?.nodes || []).map((a: any) => a.url).filter(Boolean)

        let sprint: any = undefined
        if (node.cycle) {
            const start = node.cycle.startsAt ? new Date(node.cycle.startsAt).getTime() : undefined
            const end = node.cycle.endsAt ? new Date(node.cycle.endsAt).getTime() : undefined
            const isActive = start && end ? (now >= start && now <= end) : false
            sprint = {
                name: node.cycle.name || 'Untitled Cycle',
                isActive,
                startDate: start,
                endDate: end
            }
        }

        tasks.push({
            id: crypto.randomUUID(),
            externalId: node.id,
            sourceIssueId: node.identifier || '',
            title: node.title || '',
            description: cleanDescription(node.description),
            rawDescription: node.description || '',
            status: stateName,
            priority: mapLinearPriority(node.priority || 0),
            ticketUrl: node.url || '',
            assignee: node.assignee?.name || '',
            labels,
            dueDate: node.dueDate ? new Date(node.dueDate).getTime() : undefined,
            source: 'linear',
            connectionId: connectionId,
            attachmentUrls,
            sprint,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        })
    }
}

export async function getLinearComments(apiKey: string, issueId: string): Promise<any[]> {
    const query = `
    query($issueId: String!) {
        issue(id: $issueId) {
            comments {
                nodes { body createdAt user { name } }
            }
        }
    }`
    const result = await linearGraphQL(apiKey, query, { issueId })
    const nodes = result.data?.issue?.comments?.nodes || []
    return nodes.map((n: any) => ({
        body: cleanDescription(n.body),
        authorName: n.user?.name || 'Unknown',
        createdAt: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
    }))
}

export async function addLinearComment(apiKey: string, issueId: string, body: string): Promise<void> {
    const mutation = `
    mutation($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`
    await linearGraphQL(apiKey, mutation, { issueId, body })
}

export async function getLinearWorkflowStates(apiKey: string, teamId?: string): Promise<any[]> {
    let query: string
    if (teamId) {
        // Fetch states for a specific team
        query = `
            query($teamId: String!) {
                team(id: $teamId) {
                    states {
                        nodes { id name type color }
                    }
                }
            }
        `
        const result = await linearGraphQL(apiKey, query, { teamId })
        return result.data?.team?.states?.nodes || []
    } else {
        // Fallback to global states
        query = `{ workflowStates(first: 200) { nodes { id name type color } } }`
        const result = await linearGraphQL(apiKey, query)
        return result.data?.workflowStates?.nodes || []
    }
}

export async function updateLinearIssueStatus(apiKey: string, issueId: string, stateId: string): Promise<void> {
    const mutation = `
    mutation($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }`
    await linearGraphQL(apiKey, mutation, { issueId, stateId })
}

export async function getLinearIssueHistory(apiKey: string, issueId: string): Promise<any[]> {
    console.log(`[Linear] Fetching history for issue ${issueId}`);
    const query = `
    query($issueId: String!) {
        issue(id: $issueId) {
            history(first: 50) {
                nodes {
                    createdAt
                    actor { 
                        __typename
                        ... on User { name } 
                    }
                    fromState { name } toState { name }
                    fromPriority toPriority
                    fromAssignee { name } toAssignee { name }
                    fromEstimate toEstimate
                    fromProject { name } toProject { name }
                    fromCycle { number } toCycle { number }
                }
            }
        }
    }`
    try {
        const result = await linearGraphQL(apiKey, query, { issueId })
        const nodes = result.data?.issue?.history?.nodes || []
        console.log(`[Linear] Found ${nodes.length} history nodes`);

        const entries: any[] = []
        for (const node of nodes) {
            // Robust actor name resolution
            let author = 'System'
            const actor = (node as any).actor
            if (actor) {
                if (actor.__typename === 'User') author = actor.name || 'Unknown User'
                else if (actor.name) author = actor.name // Fallback for other actor types that might have name
                else author = actor.__typename || 'System'

                // If it's a known non-user actor, try to be more specific
                if (actor.__typename !== 'User') {
                    console.log(`[Linear] Non-user actor detected: ${actor.__typename}`, actor);
                }
            }

            const timestamp = node.createdAt ? new Date(node.createdAt).getTime() : Date.now()

            if (node.fromState && node.toState) {
                entries.push({ timestamp, author, field: 'Status', fromValue: node.fromState.name, toValue: node.toState.name })
            }
            if (node.fromPriority != null && node.toPriority != null) {
                entries.push({ timestamp, author, field: 'Priority', fromValue: linearPriorityName(node.fromPriority), toValue: linearPriorityName(node.toPriority) })
            }
            if (node.fromAssignee !== undefined && node.toAssignee !== undefined) {
                const from = node.fromAssignee?.name || 'Unassigned'
                const to = node.toAssignee?.name || 'Unassigned'
                if (from !== to) entries.push({ timestamp, author, field: 'Assignee', fromValue: from, toValue: to })
            }
            if (node.fromEstimate !== undefined && node.toEstimate !== undefined) {
                const f = node.fromEstimate ?? 'No estimate'; const t = node.toEstimate ?? 'No estimate'
                if (f !== t) entries.push({ timestamp, author, field: 'Estimate', fromValue: String(f), toValue: String(t) })
            }
            if (node.fromProject && node.toProject) {
                entries.push({ timestamp, author, field: 'Project', fromValue: node.fromProject.name, toValue: node.toProject.name })
            }
            if (node.fromCycle && node.toCycle) {
                entries.push({ timestamp, author, field: 'Cycle', fromValue: `Cycle ${node.fromCycle.number}`, toValue: `Cycle ${node.toCycle.number}` })
            }
        }
        return entries;
    } catch (e: any) {
        console.error(`[Linear] History fetch failed: ${e.message}`);
        return [];
    }
}

function linearPriorityName(priority: number): string {
    const names: Record<number, string> = { 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' }
    return names[priority] ?? `Priority ${priority}`
}

export async function createLinearIssue(apiKey: string, teamId: string, title: string, description: string, priority = 3): Promise<string | null> {
    const resolvedTeamId = await resolveLinearTeamUuid(apiKey, teamId)
    if (!resolvedTeamId) throw new Error(`Could not resolve Linear team '${teamId}'.`)

    const mutation = `
    mutation($teamId: String!, $title: String!, $description: String!, $priority: Int!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority }) {
            success issue { url identifier }
        }
    }`
    const result = await linearGraphQL(apiKey, mutation, { teamId: resolvedTeamId, title, description, priority })
    return result.data?.issueCreate?.issue?.url || null
}

// ── Jira REST API ─────────────────────────────────────────────────────────────

// ... existing code ...

function mapJiraPriority(priorityName?: string): string {
    if (!priorityName) return 'medium'
    const p = priorityName.toLowerCase()
    if (p === 'blocker' || p === 'critical') return 'critical'
    if (p === 'major' || p === 'high') return 'high'
    if (p === 'minor' || p === 'low') return 'low'
    return 'medium'
}

function extractJiraDescription(adfOrText: any): string {
    if (!adfOrText) return ''
    if (typeof adfOrText === 'string') return adfOrText

    // Atlassian Document Format (ADF) extraction
    if (adfOrText.type === 'doc') {
        return extractAdfText(adfOrText)
    }
    return JSON.stringify(adfOrText)
}

function extractAdfText(node: any): string {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''

    const parts: string[] = []
    if (node.content) {
        for (const child of node.content) {
            parts.push(extractAdfText(child))
        }
    }

    const separator = ['paragraph', 'bulletList', 'orderedList', 'listItem', 'heading'].includes(node.type) ? '\n' : ''
    return parts.join(separator)
}

export async function fetchJiraIssues(domain: string, email: string, apiKey: string, projectKey: string, connectionId?: string): Promise<any[]> {
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const base = getJiraBaseUrl(domain)

    const allIssues: any[] = []
    let startAt = 0
    const maxResults = 100
    const MAX_PAGES = 25

    for (let page = 0; page < MAX_PAGES; page++) {
        const jql = projectKey ? `project=${projectKey}` : 'ORDER BY updated DESC'
        const url = `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,priority,status,assignee,duedate,labels,issuetype,comment,attachment,url`

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
        })

        if (!res.ok) throw new Error(`Jira API error: ${res.status} ${res.statusText}`)

        const data = await res.json() as any
        const issues = data.issues || []

        for (const issue of issues) {
            const f = issue.fields
            const labels = (f.labels || []).join(', ')
            const attachmentUrls = (f.attachment || []).map((a: any) => a.content).filter(Boolean)

            // Jira Sprint detection (often customfield_10020 or similar, or just 'sprint')
            let sprint: any = undefined
            const sprintData = f.sprint || f.customfield_10020 || f.customfield_10000 
            if (Array.isArray(sprintData) && sprintData.length > 0) {
                // Take the active one if possible
                const active = sprintData.find((s: any) => s.state === 'ACTIVE' || s.state === 'active') || sprintData[0]
                if (typeof active === 'object') {
                    sprint = {
                        name: active.name,
                        isActive: active.state === 'ACTIVE' || active.state === 'active',
                        startDate: active.startDate ? new Date(active.startDate).getTime() : undefined,
                        endDate: active.endDate ? new Date(active.endDate).getTime() : undefined
                    }
                } else if (typeof active === 'string' && active.includes('name=')) {
                    // Handle legacy string format
                    const nameMatch = active.match(/name=([^,\]]+)/)
                    const stateMatch = active.match(/state=([^,\]]+)/)
                    sprint = {
                        name: nameMatch ? nameMatch[1] : 'Unknown Sprint',
                        isActive: stateMatch ? stateMatch[1] === 'ACTIVE' : false
                    }
                }
            }

            allIssues.push({
                id: crypto.randomUUID(),
                externalId: issue.id,
                sourceIssueId: issue.key,
                title: f.summary || '',
                description: cleanDescription(extractJiraDescription(f.description)),
                status: f.status?.name || '',
                priority: mapJiraPriority(f.priority?.name),
                assignee: f.assignee?.displayName || '',
                labels,
                dueDate: f.duedate ? new Date(f.duedate).getTime() : undefined,
                issueType: f.issuetype?.name || '',
                ticketUrl: `${base}/browse/${issue.key}`,
                source: 'jira',
                connectionId: connectionId,
                attachmentUrls,
                rawDescription: extractJiraDescription(f.description),
                sprint,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            })
        }

        if (issues.length < maxResults || startAt + issues.length >= (data.total || 0)) break
        startAt += issues.length
    }

    return allIssues
}

export async function getJiraComments(domain: string, email: string, apiKey: string, issueKey: string): Promise<any[]> {
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const base = getJiraBaseUrl(domain)

    const res = await fetch(`${base}/rest/api/3/issue/${issueKey}/comment`, {
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })

    if (!res.ok) return []

    const data = await res.json() as any
    return (data.comments || []).map((c: any) => ({
        body: cleanDescription(extractJiraDescription(c.body)),
        authorName: c.author?.displayName || 'Unknown',
        createdAt: new Date(c.created).getTime(),
    }))
}

export async function addJiraComment(domain: string, email: string, apiKey: string, issueKey: string, body: string): Promise<void> {
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const base = getJiraBaseUrl(domain)

    await fetch(`${base}/rest/api/3/issue/${issueKey}/comment`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] }
        }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
}

export async function transitionJiraIssue(domain: string, email: string, apiKey: string, issueKey: string, transitionName: string): Promise<void> {
    const creds = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const baseUrl = `${getJiraBaseUrl(domain)}/rest/api/3`

    const transResp = await fetch(`${baseUrl}/issue/${issueKey}/transitions`, {
        headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    if (!transResp.ok) throw new Error(`Failed to get transitions: ${transResp.status}`)
    const transData: any = await transResp.json()

    const match = transData.transitions?.find((t: any) =>
        t.name?.toLowerCase() === transitionName.toLowerCase() ||
        t.to?.name?.toLowerCase() === transitionName.toLowerCase()
    )
    if (!match) throw new Error(`Transition '${transitionName}' not available for ${issueKey}`)

    const doResp = await fetch(`${baseUrl}/issue/${issueKey}/transitions`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ transition: { id: match.id } }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    if (!doResp.ok) throw new Error(`Transition failed: ${doResp.status}`)
}

export async function getJiraIssueHistory(domain: string, email: string, apiKey: string, issueKey: string): Promise<any[]> {
    console.log(`[Jira] Fetching history for issue ${issueKey}`);
    const auth = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const base = getJiraBaseUrl(domain)
    const url = `${base}/rest/api/3/issue/${issueKey}?expand=changelog&fields=summary`

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
        })

        if (!res.ok) {
            console.error(`[Jira] API error ${res.status}: ${res.statusText}`);
            return [];
        }

        const data = await res.json() as any
        const entries: any[] = []

        if (data.changelog && data.changelog.histories) {
            console.log(`[Jira] Found ${data.changelog.histories.length} history events`);
            for (const history of data.changelog.histories) {
                const author = history.author?.displayName || 'Unknown'
                const timestamp = new Date(history.created).getTime()

                if (history.items) {
                    for (const item of history.items) {
                        entries.push({
                            timestamp,
                            author,
                            field: item.field || 'Unknown',
                            fromValue: item.fromString || '',
                            toValue: item.toString || '',
                        })
                    }
                }
            }
        }
        return entries
    } catch (e: any) {
        console.error(`[Jira] History fetch failed: ${e.message}`);
        return [];
    }
}

/**
 * Fetch the list of Jira projects (lightweight validation / test-connection call).
 * Mirrors C# JiraService.GetProjectsAsync().
 */
export async function getJiraProjects(domain: string, email: string, apiKey: string): Promise<any[]> {
    const creds = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const resp = await fetch(`${getJiraBaseUrl(domain)}/rest/api/3/project`, {
        headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    if (!resp.ok) throw new Error(`Jira API returned ${resp.status}: ${resp.statusText}`)
    const data: any = await resp.json()
    return Array.isArray(data) ? data.map((p: any) => ({ id: p.id, key: p.key, name: p.name })) : []
}

export async function getJiraStatuses(domain: string, email: string, apiKey: string, projectKey: string): Promise<any[]> {
    const creds = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const base = getJiraBaseUrl(domain)
    // We can fetch statuses for a project via the project statuses endpoint
    const resp = await fetch(`${base}/rest/api/3/project/${projectKey}/statuses`, {
        headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    if (!resp.ok) throw new Error(`Jira API returned ${resp.status}: ${resp.statusText}`)
    const data: any = await resp.json()
    
    const statuses: any[] = []
    if (Array.isArray(data)) {
        // Jira returns status categories which contain statuses
        for (const type of data) {
            if (type.statuses && Array.isArray(type.statuses)) {
                for (const s of type.statuses) {
                    statuses.push({
                        id: s.id,
                        name: s.name,
                        category: s.statusCategory?.name || 'To Do',
                        color: s.statusCategory?.colorName || 'medium-gray'
                    })
                }
            }
        }
    }
    return statuses
}

export async function createJiraIssue(domain: string, email: string, apiKey: string, projectKey: string, title: string, description: string, issueTypeName: string = 'Bug'): Promise<string | null> {
    const creds = Buffer.from(`${email}:${apiKey}`).toString('base64')
    const baseUrl = `${getJiraBaseUrl(domain)}/rest/api/3`

    // First, resolve the issue type ID. 
    // Jira requires the ID, so we fetch project metadata unless we just guess 'Bug' name works for /issue endpoints.
    // Instead of raw ID guessing, we can check the project or use the name directly in the issue creation if Jira allows it (it does!)
    // Wait, Jira API 3 `issuetype` field accepts `name` or `id`.

    const body = {
        fields: {
            project: { key: projectKey },
            summary: title,
            description: {
                type: 'doc',
                version: 1,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: description || 'No description provided.' }] }]
            },
            issuetype: { name: issueTypeName }
        }
    }

    const doResp = await fetch(`${baseUrl}/issue`, {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })

    if (!doResp.ok) {
        const text = await doResp.text()
        throw new Error(`Failed to create Jira issue: ${doResp.status} - ${text}`)
    }

    const data: any = await doResp.json()
    return data.key // e.g. "PROJ-123"
}

/**
 * Fetch media content with appropriate authentication based on source
 */
export async function fetchAuthenticatedMedia(url: string, source: string, connectionId?: string, projectId?: string): Promise<{ data: Buffer, mimeType: string }> {
    let headers: Record<string, string> = {};
    const projectPrefix = projectId ? `project:${projectId}:` : '';

    if (source === 'jira') {
        
        
        if (connectionId) {
            const email = (projectId ? await getCredential(`${projectPrefix}jira_email_${connectionId}`) : null) || 
                          await getCredential(`jira_email_${connectionId}`) || 
                          await getCredential(`jira_email`);
                          
            const apiKey = (projectId ? await getCredential(`${projectPrefix}jira_api_token_${connectionId}`) : null) || 
                           (projectId ? await getCredential(`${projectPrefix}jira_api_key_${connectionId}`) : null) ||
                           await getCredential(`jira_api_token_${connectionId}`) || 
                           await getCredential(`jira_api_key_${connectionId}`) || 
                           await getCredential(`jira_api_key`);
            
            if (email && apiKey) {
                const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
                headers['Authorization'] = `Basic ${auth}`;
            }
        }
    } else if (source === 'linear') {
        
        const apiKey = connectionId ? 
            ((projectId ? await getCredential(`${projectPrefix}linear_api_key_${connectionId}`) : null) || await getCredential(`linear_api_key_${connectionId}`)) : 
            ((projectId ? await getCredential(`${projectPrefix}linear_api_key`) : null) || await getCredential(`linear_api_key`));
            
        if (apiKey) {
            headers['Authorization'] = apiKey.startsWith('lin_api_') || apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        }
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Media fetch failed: ${res.status} ${res.statusText}`);

    const arrayBuffer = await res.arrayBuffer();
    return {
        data: Buffer.from(arrayBuffer),
        mimeType: res.headers.get('content-type') || 'application/octet-stream'
    };
}
