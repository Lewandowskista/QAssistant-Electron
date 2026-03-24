export type ToonFieldStyle = 'scalar' | 'block' | 'opaque' | 'literal'

export interface ToonFieldOptions {
    style?: ToonFieldStyle
    maxLength?: number
}

export interface ToonInlineField extends ToonFieldOptions {
    key: string
    value: unknown
}

function truncate(value: string, maxLength: number): string {
    if (maxLength <= 0) return ''
    return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value
}

function normalizeToSingleLine(value: string): string {
    return value.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ')
}

function escapeStructuralCharacters(value: string): string {
    return value
        .replace(/{/g, '(')
        .replace(/}/g, ')')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/@/g, '(at)')
        .replace(/---/g, '- - -')
        .replace(/:/g, '\u02F8')
        .replace(/\|/g, '\u2223')
        .replace(/`/g, "'")
}

export function sanitizeToonScalar(value: string | null | undefined, maxLength = 500): string {
    if (!value?.trim()) return ''
    return escapeStructuralCharacters(normalizeToSingleLine(truncate(value, maxLength)))
}

export function sanitizeToonBlock(value: string | null | undefined, maxLength = 2000): string {
    if (!value?.trim()) return ''
    const truncated = truncate(value.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), maxLength)
    return escapeStructuralCharacters(truncated)
}

export function sanitizeToonOpaque(value: string | null | undefined, maxLength = 6000): string {
    if (!value?.trim()) return '""'
    let sanitized = truncate(value, maxLength)
    sanitized = normalizeToSingleLine(sanitized)
    sanitized = sanitized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    sanitized = sanitized
        .replace(/{/g, '(')
        .replace(/}/g, ')')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
    return `"${sanitized}"`
}

export function sanitizeToonList(values: Array<string | null | undefined>, itemMaxLength = 80, maxItems = values.length): string {
    return values
        .slice(0, maxItems)
        .map((value) => sanitizeToonScalar(value, itemMaxLength))
        .filter(Boolean)
        .join(',')
}

function formatValue(value: unknown, options: ToonFieldOptions = {}): string | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
    if (typeof value === 'boolean') return value ? 'true' : 'false'

    const str = String(value)
    const style = options.style ?? 'scalar'
    const maxLength = options.maxLength ?? (style === 'opaque' ? 6000 : style === 'block' ? 2000 : 500)

    if (style === 'literal') return str
    if (style === 'opaque') return sanitizeToonOpaque(str, maxLength)
    if (style === 'block') return sanitizeToonBlock(str, maxLength)
    return sanitizeToonScalar(str, maxLength)
}

export class ToonWriter {
    private readonly lines: string[] = []
    private readonly indentStep: number
    private readonly indentLevel: number

    constructor(indentStep = 1, indentLevel = 0) {
        this.indentStep = indentStep
        this.indentLevel = indentLevel
    }

    private prefix(extra = 0): string {
        return ' '.repeat(this.indentLevel + extra)
    }

    private child(): ToonWriter {
        return new ToonWriter(this.indentStep, this.indentLevel + this.indentStep)
    }

    private appendChild(child: ToonWriter): void {
        this.lines.push(...child.lines)
    }

    line(text: string): void {
        this.lines.push(`${this.prefix()}${text}`)
    }

    separator(): void {
        this.line('---')
    }

    raw(text: string): void {
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        for (const line of normalized.split('\n')) {
            this.line(line)
        }
    }

    field(key: string, value: unknown, options?: ToonFieldOptions): void {
        const formatted = formatValue(value, options)
        if (!formatted) return
        this.line(`${key}:${formatted}`)
    }

    object(name: string, render: (writer: ToonWriter) => void): void {
        this.line(`${name}{`)
        const child = this.child()
        render(child)
        this.appendChild(child)
        this.line('}')
    }

    list<T>(name: string, items: T[], renderItem: (writer: ToonWriter, item: T, index: number) => void): void {
        this.line(`${name}[`)
        const child = this.child()
        items.forEach((item, index) => renderItem(child, item, index))
        this.appendChild(child)
        this.line(']')
    }

    inlineObject(fields: ToonInlineField[]): string {
        const parts = fields
            .map((field) => {
                const formatted = formatValue(field.value, field)
                return formatted ? `${field.key}:${formatted}` : null
            })
            .filter((part): part is string => Boolean(part))

        return `{${parts.join(',')}}`
    }

    itemObject(fields: ToonInlineField[]): void {
        const rendered = this.inlineObject(fields)
        if (rendered !== '{}') {
            this.line(rendered)
        }
    }

    toString(): string {
        return this.lines.join('\n')
    }

    lineCount(): number {
        return this.lines.length
    }
}
