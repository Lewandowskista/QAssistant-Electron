import type { Project, QaEnvironment } from '@/types/project'

export function sanitizeEnvironmentForPersistence(environment: QaEnvironment): QaEnvironment {
    const { ...sanitized } = environment
    delete (sanitized as QaEnvironment & { username?: string }).username
    delete (sanitized as QaEnvironment & { password?: string }).password
    return sanitized
}

export function sanitizeProjectForPersistence(project: Project): Project {
    return {
        ...project,
        environments: (project.environments || []).map(sanitizeEnvironmentForPersistence),
    }
}
