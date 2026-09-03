import { useEffect, useState } from 'react'
import type { AiProvider } from '@/types/ai'
import type { Project } from '@/types/project'

export interface AiProviderStatus {
    provider: AiProvider
    /** null while still resolving, so callers can avoid flashing a setup prompt. */
    configured: boolean | null
    /** Human-readable reason when not configured. */
    reason?: string
}

/** Label shown in setup prompts and settings. */
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
    gemini: 'Google AI Studio',
    nim: 'NVIDIA NIM',
    ollama: 'Ollama (local)',
}

export function resolveActiveProvider(project?: Project | null): AiProvider {
    const p = project?.aiProvider
    return p === 'nim' ? 'nim' : p === 'ollama' ? 'ollama' : 'gemini'
}

/**
 * Reports whether the active project's AI provider is ready to use.
 *
 * Readiness is provider-specific: the hosted providers need a stored API key, while Ollama has
 * no credential at all and is instead ready when its daemon answers and has at least one chat
 * model pulled. Checking only for a Gemini key — as the pages used to — reports a working local
 * setup as unconfigured.
 */
export function useAiProviderStatus(project?: Project | null): AiProviderStatus {
    const provider = resolveActiveProvider(project)
    const projectId = project?.id
    const ollamaBaseUrl = project?.ollamaBaseUrl
    const [status, setStatus] = useState<AiProviderStatus>({ provider, configured: null })

    useEffect(() => {
        const api = window.electronAPI
        if (!api) {
            setStatus({ provider, configured: false, reason: 'Desktop bridge unavailable.' })
            return
        }
        let cancelled = false
        const done = (configured: boolean, reason?: string) => {
            if (!cancelled) setStatus({ provider, configured, reason })
        }

        setStatus({ provider, configured: null })

        if (provider === 'ollama') {
            api.ollamaStatus({ baseUrl: ollamaBaseUrl || undefined })
                .then((res: any) => {
                    if (res?.__isError) return done(false, res.message)
                    if (!res?.reachable) return done(false, 'Ollama is not running. Start it and try again.')
                    if (!res.models?.length) return done(false, 'Ollama is running but no chat models are installed. Pull one, e.g. `ollama pull gpt-oss:20b`.')
                    return done(true)
                })
                .catch((e: any) => done(false, String(e?.message ?? e)))
            return () => { cancelled = true }
        }

        const keyName = provider === 'nim' ? 'nim_api_key' : 'gemini_api_key'
        Promise.all([
            projectId ? api.secureStoreGet(`project:${projectId}:${keyName}`) : Promise.resolve(null),
            api.secureStoreGet(keyName),
        ])
            .then(([scoped, global]) => {
                const configured = !!(scoped || global)
                // Only carry a reason when there is something to explain.
                done(configured, configured ? undefined : `No ${AI_PROVIDER_LABELS[provider]} API key saved.`)
            })
            .catch(() => done(false, 'Could not read stored credentials.'))

        return () => { cancelled = true }
    }, [provider, projectId, ollamaBaseUrl])

    return status
}
