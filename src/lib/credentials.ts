/**
 * Credential retrieval helpers.
 * Always checks for a project-scoped key first, then falls back to a global key.
 */

type ElectronAPI = typeof window.electronAPI

/**
 * Retrieve an API key, checking the project-scoped credential first.
 * @param keyName  The credential name, e.g. 'gemini_api_key'
 * @param projectId  The active project ID (optional). When provided, checks `project:<id>:<keyName>` first.
 */
export async function getApiKey(
    api: ElectronAPI,
    keyName: string,
    projectId?: string | null
): Promise<string | null> {
    if (!api) return null
    if (projectId) {
        const projectKey = await api.secureStoreGet(`project:${projectId}:${keyName}`)
        if (projectKey) return projectKey
    }
    return (await api.secureStoreGet(keyName)) ?? null
}

/**
 * Retrieve a connection-scoped API key (e.g. per Linear/Jira connection),
 * checking project-scoped → connection-scoped → global in order.
 * @param keyName   Base credential name, e.g. 'linear_api_key'
 * @param connectionId  The connection identifier (optional).
 * @param projectId     The active project ID (optional).
 */
export async function getConnectionApiKey(
    api: ElectronAPI,
    keyName: string,
    connectionId?: string | null,
    projectId?: string | null
): Promise<string | null> {
    if (!api) return null
    const suffix = connectionId ? `${keyName}_${connectionId}` : keyName
    if (projectId) {
        const projectKey = await api.secureStoreGet(`project:${projectId}:${suffix}`)
        if (projectKey) return projectKey
    }
    const connKey = await api.secureStoreGet(suffix)
    if (connKey) return connKey
    // Final fallback to bare key name
    if (connectionId) return (await api.secureStoreGet(keyName)) ?? null
    return null
}
