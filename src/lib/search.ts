import { Project } from "@/store/useProjectStore"

export type SearchResult = {
    id: string
    title: string
    type: 'task' | 'note' | 'testplan'
    projectId: string
    projectName: string
    content?: string
}

/**
 * Searches across all projects for a query string
 */
export function searchProjects(projects: Project[], query: string): SearchResult[] {
    if (!query || query.length < 2) return []

    const results: SearchResult[] = []
    const q = query.toLowerCase()

    projects.forEach(project => {
        // Search Tasks
        project.tasks.forEach(task => {
            if (task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q)) {
                results.push({
                    id: task.id,
                    title: task.title,
                    type: 'task',
                    projectId: project.id,
                    projectName: project.name,
                    content: task.description
                })
            }
        })

        // Search Notes
        project.notes.forEach(note => {
            if (note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q)) {
                results.push({
                    id: note.id,
                    title: note.title,
                    type: 'note',
                    projectId: project.id,
                    projectName: project.name,
                    content: note.content
                })
            }
        })


        // Search Test Plans
        project.testPlans.forEach(plan => {
            if (plan.name.toLowerCase().includes(q) || plan.description.toLowerCase().includes(q)) {
                results.push({
                    id: plan.id,
                    title: plan.name,
                    type: 'testplan',
                    projectId: project.id,
                    projectName: project.name,
                    content: plan.description
                })
            }
        })
    })

    return results
}
