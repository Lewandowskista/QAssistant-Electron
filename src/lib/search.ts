import { Project } from "@/store/useProjectStore"

export type SearchResult = {
    id: string
    title: string
    type: 'task' | 'note' | 'testplan' | 'testcase' | 'api' | 'runbook' | 'testData' | 'checklist'
    projectId: string
    projectName: string
    content?: string
    metadata?: string
}

/**
 * Searches across all projects for a query string.
 * @param maxResults - Maximum number of results to return (default 50). Enables early
 *   termination on large datasets so the caller never processes more than needed.
 */
export function searchProjects(projects: Project[], query: string, maxResults = 50): SearchResult[] {
    if (!query || query.length < 2) return []

    const results: SearchResult[] = []
    const q = query.toLowerCase()

    for (const project of projects) {
        if (results.length >= maxResults) break
        const projectName = project.name
        const projectId = project.id

        // 1. Search Tasks
        for (const task of project.tasks) {
            if (results.length >= maxResults) break
            if (task.title.toLowerCase().includes(q) || (task.description && task.description.toLowerCase().includes(q)) || (task.sourceIssueId && task.sourceIssueId.toLowerCase().includes(q))) {
                results.push({
                    id: task.id,
                    title: task.title,
                    type: 'task',
                    projectId,
                    projectName,
                    content: task.description,
                    metadata: task.sourceIssueId || task.status
                })
            }
        }

        // 2. Search Notes
        for (const note of project.notes) {
            if (results.length >= maxResults) break
            if (note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q)) {
                results.push({
                    id: note.id,
                    title: note.title,
                    type: 'note',
                    projectId,
                    projectName,
                    content: note.content
                })
            }
        }

        // 3. Search Test Plans + Test Cases
        for (const plan of project.testPlans) {
            if (results.length >= maxResults) break
            if (plan.name.toLowerCase().includes(q) || (plan.description && plan.description.toLowerCase().includes(q))) {
                results.push({
                    id: plan.id,
                    title: plan.name,
                    type: 'testplan',
                    projectId,
                    projectName,
                    content: plan.description,
                    metadata: `${plan.testCases?.length || 0} cases`
                })
            }

            for (const tc of plan.testCases) {
                if (results.length >= maxResults) break
                const searchable = `${tc.title} ${tc.displayId} ${tc.tags?.join(' ') || ''} ${tc.sapModule || ''} ${tc.priority}`.toLowerCase()
                if (searchable.includes(q)) {
                    results.push({
                        id: tc.id,
                        title: tc.title,
                        type: 'testcase',
                        projectId,
                        projectName,
                        content: tc.steps,
                        metadata: `${tc.displayId} | ${plan.name}`
                    })
                }
            }
        }

        // 4. Search API Requests
        if (project.apiRequests) {
            for (const api of project.apiRequests) {
                if (results.length >= maxResults) break
                if (api.name.toLowerCase().includes(q) || api.url.toLowerCase().includes(q)) {
                    results.push({
                        id: api.id,
                        title: api.name,
                        type: 'api',
                        projectId,
                        projectName,
                        content: api.url,
                        metadata: `${api.method} | ${api.category}`
                    })
                }
            }
        }

        // 5. Search Runbooks
        if (project.runbooks) {
            for (const rb of project.runbooks) {
                if (results.length >= maxResults) break
                if (rb.name.toLowerCase().includes(q) || (rb.description && rb.description.toLowerCase().includes(q))) {
                    results.push({
                        id: rb.id,
                        title: rb.name,
                        type: 'runbook',
                        projectId,
                        projectName,
                        content: rb.description,
                        metadata: `${rb.category} | ${rb.steps?.length || 0} steps`
                    })
                }
            }
        }

        // 6. Search Test Data
        if (project.testDataGroups) {
            for (const group of project.testDataGroups) {
                if (results.length >= maxResults) break
                for (const entry of group.entries) {
                    if (results.length >= maxResults) break
                    if (entry.key.toLowerCase().includes(q) || entry.value.toLowerCase().includes(q) || entry.tags.toLowerCase().includes(q)) {
                        results.push({
                            id: entry.id,
                            title: entry.key,
                            type: 'testData',
                            projectId,
                            projectName,
                            content: entry.value,
                            metadata: `${group.name} | ${entry.environment}`
                        })
                    }
                }
            }
        }

        // 7. Checklists
        if (project.checklists) {
            for (const cl of project.checklists) {
                if (results.length >= maxResults) break
                if (cl.name.toLowerCase().includes(q)) {
                    results.push({
                        id: cl.id,
                        title: cl.name,
                        type: 'checklist',
                        projectId,
                        projectName,
                        metadata: `${cl.category} | ${cl.items?.length || 0} items`
                    })
                }
            }
        }
    }

    return results
}
