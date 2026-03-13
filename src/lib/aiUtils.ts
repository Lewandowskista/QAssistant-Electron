/**
 * Shared utilities for AI feature preparation.
 * Centralizes project sanitization so all AI entry points send a consistent,
 * IPC-safe context object without circular references or massive test case arrays.
 */

/**
 * Sanitizes a project object for use in AI API calls.
 * - Strips testCases arrays from testPlans (too large; the AI only needs plan metadata)
 * - Strips internal fields that could cause IPC structured-clone failures
 * - Keeps tasks, environments, checklists, testDataGroups, and SAP HAC flag
 */
export function sanitizeProjectForAi(project: any): any {
    if (!project) return undefined
    return {
        name: project.name,
        description: project.description,
        environments: project.environments,
        tasks: project.tasks,
        testPlans: project.testPlans?.map((tp: any) => ({
            id: tp.id,
            name: tp.name,
            source: tp.source,
            // testCases intentionally omitted — too large for IPC and not needed for most prompts
        })),
        testDataGroups: project.testDataGroups?.map((tdg: any) => ({ name: tdg.name, category: tdg.category })),
        checklists: project.checklists?.map((cl: any) => ({ name: cl.name, category: cl.category })),
        sapHac: project.sapHac,
        geminiModel: project.geminiModel,
    }
}
