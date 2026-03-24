import { describe, expect, it } from 'vitest'
import { sanitizeToonList, sanitizeToonScalar, ToonWriter } from './toon'

describe('toon serializer', () => {
    it('sanitizes structural characters in scalar values', () => {
        const value = sanitizeToonScalar('alpha:beta|gamma`delta[one]{two}\n@---', 200)

        expect(value).not.toContain(':')
        expect(value).not.toContain('|')
        expect(value).not.toContain('`')
        expect(value).not.toContain('[')
        expect(value).not.toContain(']')
        expect(value).not.toContain('{')
        expect(value).not.toContain('}')
        expect(value).not.toContain('\n')
        expect(value).not.toContain('@')
        expect(value).not.toContain('---')
        expect(value).toContain('˸')
        expect(value).toContain('∣')
    })

    it('omits empty fields while keeping a stable TOON envelope', () => {
        const writer = new ToonWriter()
        writer.object('root', (root) => {
            root.field('keep', 'value')
            root.field('empty', '')
            root.field('missing', undefined)
            root.field('list', sanitizeToonList(['one', 'two']), { style: 'literal' })
        })

        expect(writer.toString()).toBe([
            'root{',
            ' keep:value',
            ' list:one,two',
            '}',
        ].join('\n'))
    })
})
