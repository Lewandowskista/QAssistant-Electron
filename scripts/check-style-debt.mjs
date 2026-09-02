#!/usr/bin/env node
/**
 * Style-debt guard, run as part of `npm run lint` (and therefore CI).
 *
 * Enforced invariants:
 *  1. No arbitrary-hex Tailwind classes (bg-[#13131A], text-[#10B981]/60, …).
 *     These bypass the theme tokens and break light/dark switching. Use the
 *     semantic classes instead: surface-*, line-*, text-*, state-*, qa-accent,
 *     or the utilities in index.css (bg-panel, border-ui, text-muted-ui, …).
 *  2. No qa-purple classes — the token was renamed to qa-accent.
 *  3. text-[Npx] arbitrary font sizes must not grow beyond the recorded
 *     baseline (they are being removed in the type-scale cleanup; new code
 *     should use the Tailwind scale: text-xs, text-sm, …).
 */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src')
const TEXT_PX_BASELINE = 718

const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return walk(p)
        return /\.(tsx?|jsx?|css)$/.test(e.name) ? [p] : []
    })

const HEX_CLASS_RE = /[a-zA-Z][\w-]*-\[#[0-9a-fA-F]{3,8}\](?:\/\d{1,3})?/g
const QA_PURPLE_RE = /qa-purple/g
const TEXT_PX_RE = /text-\[\d+px\]/g

const hexHits = []
const purpleHits = []
let textPxCount = 0

for (const file of walk(SRC)) {
    const rel = path.relative(process.cwd(), file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
        for (const m of line.match(HEX_CLASS_RE) ?? []) hexHits.push(`${rel}:${i + 1}  ${m}`)
        for (const m of line.match(QA_PURPLE_RE) ?? []) purpleHits.push(`${rel}:${i + 1}  ${m}`)
        textPxCount += (line.match(TEXT_PX_RE) ?? []).length
    })
}

let failed = false
if (hexHits.length) {
    failed = true
    console.error(`✗ ${hexHits.length} arbitrary-hex class(es) — use theme tokens instead:`)
    for (const h of hexHits.slice(0, 20)) console.error('   ' + h)
}
if (purpleHits.length) {
    failed = true
    console.error(`✗ ${purpleHits.length} qa-purple reference(s) — the token is now qa-accent:`)
    for (const h of purpleHits.slice(0, 20)) console.error('   ' + h)
}
if (textPxCount > TEXT_PX_BASELINE) {
    failed = true
    console.error(`✗ text-[Npx] count grew: ${textPxCount} > baseline ${TEXT_PX_BASELINE}. Use the Tailwind type scale (text-xs, text-sm, …).`)
} else if (textPxCount < TEXT_PX_BASELINE) {
    console.log(`ℹ text-[Npx] count is ${textPxCount} (baseline ${TEXT_PX_BASELINE}) — you can lower TEXT_PX_BASELINE in scripts/check-style-debt.mjs.`)
}

if (failed) process.exit(1)
console.log('✓ style-debt guard passed (no arbitrary hex classes, no qa-purple, text-[Npx] within baseline)')
