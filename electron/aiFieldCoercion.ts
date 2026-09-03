/**
 * Normalisation helpers for model-supplied structured fields.
 *
 * Providers disagree on the shape of multi-line fields even under an identical prompt:
 * Gemini returns `testSteps` as one "\n"-joined string, while gpt-oss via Ollama returns an
 * array of step strings. A bare String(array) comma-joins it — producing
 * "...size to \"M\" for de.,2. Execute the ImpEx import via HAC" — so every provider's output
 * is funnelled through here before it reaches the store.
 */

/** Coerce a model-supplied value into newline-separated text. */
export function coerceMultilineText(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) {
        return value
            .map(entry => {
                if (entry === null || entry === undefined) return ''
                if (typeof entry === 'object') {
                    // Some models emit [{ step: 1, action: "..." }] instead of plain strings.
                    const obj = entry as Record<string, unknown>
                    const text = obj.text ?? obj.step ?? obj.action ?? obj.description
                    return text === undefined ? JSON.stringify(entry) : String(text)
                }
                return String(entry)
            })
            .filter(line => line.trim().length > 0)
            .join('\n')
    }
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

/** Coerce a model-supplied value into single-line text (titles, ids, enum-ish fields). */
export function coerceSingleLineText(value: unknown): string {
    return coerceMultilineText(value).replace(/\s*\n+\s*/g, ' ').trim()
}
