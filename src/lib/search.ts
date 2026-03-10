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
 * Searches across all projects for a query string
 */
export function searchProjects(projects: Project[], query: string): SearchResult[] {
    if (!query || query.length < 2) return []

    const results: SearchResult[] = []
    const q = query.toLowerCase()

    projects.forEach(project => {
        const projectName = project.name
        const projectId = project.id

        // 1. Search Tasks
        project.tasks.forEach(task => {
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
        })

        // 2. Search Notes
        project.notes.forEach(note => {
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
        })

        // 3. Search Test Plans
        project.testPlans.forEach(plan => {
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

            // 4. Search Test Cases (Inside Plans)
            plan.testCases.forEach(tc => {
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
            })
        })

        // 5. Search API Requests
        project.apiRequests?.forEach(api => {
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
        })

        // 6. Search Runbooks
        project.runbooks?.forEach(rb => {
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
        })

        // 7. Search Test Data
        project.testDataGroups?.forEach(group => {
            group.entries.forEach(entry => {
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
            })
        })

        // 8. Checklists
        project.checklists?.forEach(cl => {
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
        })
    })

    return results
}
