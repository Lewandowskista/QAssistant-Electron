#!/usr/bin/env node
/**
 * One-shot codemod: rewrite arbitrary-hex Tailwind classes (bg-[#13131A],
 * text-[#10B981]/60, ...) onto the semantic token classes defined in
 * tailwind.config.js / index.css, so every surface responds to the theme.
 *
 * Usage: node scripts/hex-to-token-codemod.mjs [--dry]
 * Prints any hex class it has no mapping for and leaves it untouched.
 */
import fs from 'node:fs'
import path from 'node:path'

const DRY = process.argv.includes('--dry')
const SRC = path.resolve(process.cwd(), 'src')

// Semantic hue groups (hexes normalized uppercase, no '#').
const STATE = {
    success: ['10B981', '34D399', '6EE7B7', '84CC16'],
    danger: ['EF4444', 'F87171', 'FCA5A5', 'F97373', 'FECACA', 'DC2626', 'E11D48'],
    warning: ['F59E0B', 'FBBF24', 'FCD34D', 'FDBA74', 'EA580C'],
    info: ['3B82F6', '38BDF8', '7DD3FC', '0EA5E9', '06B6D4', '8FB7D9'],
}
// Pre-blended "soft" dark backgrounds of those hues.
const STATE_SOFT = {
    success: ['064E3B', '1E3C28', '14281C', '1F3D2D', '2D3D1F', '1A3A2A'],
    danger: ['451A1F', '522525', '3F1F1F', '3F1A1A', '3D1F2D'],
    warning: ['422006', '2D2010', '3D2D1F', '2F2D1F', '1C1210', '7C2D12'],
    info: ['1E3A5F', '1F2D3D'],
}
const ACCENT = ['A78BFA', 'C4B5FD', '8B5CF6', '9061F9', '9B7CF4', '6366F1', '818CF8', 'A5B4FC', 'EC4899', '9271E0', '9370EA']
const ACCENT_HOVER = ['7C3AED']
const ACCENT_SOFT = ['2D1F3D', '1E1B2E']

const groupOf = (hex) => {
    for (const [g, list] of Object.entries(STATE)) if (list.includes(hex)) return { kind: 'state', g }
    for (const [g, list] of Object.entries(STATE_SOFT)) if (list.includes(hex)) return { kind: 'state-soft', g }
    if (ACCENT.includes(hex)) return { kind: 'accent' }
    if (ACCENT_HOVER.includes(hex)) return { kind: 'accent-hover' }
    if (ACCENT_SOFT.includes(hex)) return { kind: 'accent-soft' }
    return null
}

// Explicit grey/surface table: `${util}|${hex}` -> [classWithoutAlpha, classForAlpha]
// classForAlpha gets `/${alpha}` appended; null second entry = drop the alpha.
const GREY = {
    // dark app backgrounds
    ...Object.fromEntries(['0F0F13', '0B0D13', '0D0D11', '0A0A0D', '0A0A0E', '11131A', '0F1118'].map(h => [`bg|${h}`, ['bg-app', 'bg-surface-app']])),
    ...Object.fromEntries(['13131A', '161625', '171925', '1A1D28'].map(h => [`bg|${h}`, ['bg-panel', 'bg-surface']])),
    ...Object.fromEntries(['1A1A24', '1F1F24', '1E1E32', '1E1E2E', '1A1A2A'].map(h => [`bg|${h}`, ['bg-panel-muted', 'bg-surface-alt']])),
    'bg|1A1A2E': ['bg-selected', 'bg-surface-selected'],
    ...Object.fromEntries(['2D2D44', '2A2A3A', '252535', '1E1E2A', '1F2937'].map(h => [`bg|${h}`, ['bg-elevated', 'bg-surface-elevated']])),
    ...Object.fromEntries(['3D3D5F', '4B5563', '6B7280', '9CA3AF'].map(h => [`bg|${h}`, ['bg-line-strong', 'bg-line-strong']])),
    'bg|E2E8F0': ['bg-text-primary', 'bg-text-primary'],
    // borders
    ...Object.fromEntries(['2D2D44', '2A2A3A'].map(h => [`border|${h}`, ['border-ui', 'border-line']])),
    ...Object.fromEntries(['3A3A4A', '3D3D5F', '3A3A52', '4B5563'].map(h => [`border|${h}`, ['border-ui-strong', 'border-line-strong']])),
    ...Object.fromEntries(['222430', '1F1F24'].map(h => [`border|${h}`, ['border-ui-subtle', 'border-line-subtle']])),
    // text
    'text|0F0F13': ['text-primary-foreground', null],
    ...Object.fromEntries(['E5E7EB', 'E2E8F0', 'E2E8E0', 'CBD5E1', 'D1D5DB'].map(h => [`text|${h}`, ['text-foreground', 'text-text-primary']])),
    ...Object.fromEntries(['9CA3AF', '94A3B8', '8E9196'].map(h => [`text|${h}`, ['text-soft', 'text-text-secondary']])),
    ...Object.fromEntries(['6B7280', '4B5563', '4A5568', '64748B', 'A3A3A3'].map(h => [`text|${h}`, ['text-muted-ui', 'text-text-muted']])),
    'text|2A2A3A': ['text-text-muted/40', null],
    // misc utilities
    'ring|0F0F13': ['ring-surface-app', 'ring-surface-app'],
    'ring-offset|0F0F13': ['ring-offset-surface-app', 'ring-offset-surface-app'],
    'ring|2A2A3A': ['ring-line', 'ring-line'],
    'divide|2A2A3A': ['divide-line', 'divide-line'],
    'placeholder|4B5563': ['placeholder-text-muted', 'placeholder-text-muted'],
    'placeholder|6B7280': ['placeholder-text-muted', 'placeholder-text-muted'],
}

function mapClass(util, hexRaw, alpha) {
    const hex = hexRaw.toUpperCase()
    const grey = GREY[`${util}|${hex}`]
    if (grey) {
        if (alpha == null) return grey[0]
        return grey[1] == null ? grey[0] : `${grey[1]}/${alpha}`
    }
    const grp = groupOf(hex)
    if (!grp) return null
    if (grp.kind === 'accent' || grp.kind === 'accent-hover') {
        const base = grp.kind === 'accent-hover' ? 'qa-accent-hover' : 'qa-accent'
        return alpha == null ? `${util}-${base}` : `${util}-${base}/${alpha}`
    }
    if (grp.kind === 'accent-soft') {
        return util === 'border' ? 'border-qa-accent/20' : `${util}-qa-accent/10`
    }
    const g = grp.g
    if (grp.kind === 'state-soft') {
        if (util === 'border') return `border-state-${g}-border`
        if (util === 'bg') return `bg-state-${g}-soft`
        return `${util}-state-${g}`
    }
    // Base state hue.
    if (alpha == null) return `${util}-state-${g}`
    const a = Number(alpha)
    if (util === 'bg' && a <= 12) return `bg-state-${g}-soft`
    if (util === 'border' && a <= 30) return `border-state-${g}-border`
    return `${util}-state-${g}/${alpha}`
}

const CLASS_RE = /([a-zA-Z]+(?:-[a-zA-Z]+)*)-\[#([0-9a-fA-F]{6})\](?:\/(\d{1,3}))?/g

// ── Pass 2: raw Tailwind-palette classes → state/surface tokens ──────────
// Solid categorical swatches (bg-{hue}-500 with no alpha) are deliberately
// NOT rewritten: avatar/project/label palettes need distinct hues.
const HUE_GROUP = {
    red: 'danger', rose: 'danger',
    emerald: 'success', green: 'success',
    amber: 'warning', yellow: 'warning', orange: 'warning',
    sky: 'info', blue: 'info',
}
const HUES = Object.keys(HUE_GROUP).join('|')
const PASS2 = [
    // exact multi-class idioms first
    [/hover:bg-red-500 hover:text-white/g, 'hover:bg-state-danger hover:text-primary-foreground'],
    [/\bbg-primary hover:bg-qa-accent text-black\b/g, 'bg-primary hover:bg-qa-accent text-primary-foreground'],
    // brighten-on-hover intents
    [/(group-hover|hover):text-white\b/g, '$1:text-foreground'],
    [/(group-hover|hover):bg-white\/(?:5|10)\b/g, '$1:bg-elevated'],
    [/\btext-white\b/g, 'text-primary-foreground'],
    // dark blended chips/overlays
    [new RegExp(`\\bbg-(${HUES})-9\\d0(?:/\\d+)?`, 'g'), (m, h) => `bg-state-${HUE_GROUP[h]}-soft`],
    [new RegExp(`\\bborder-(${HUES})-9\\d0(?:/\\d+)?`, 'g'), (m, h) => `border-state-${HUE_GROUP[h]}-border`],
    [/\bbg-(?:zinc|slate)-950\/\d+/g, 'bg-surface-overlay/70'],
    [/\bbg-slate-800\b/g, 'bg-elevated'],
    [/\bbg-(?:slate|zinc)-500\/\d+/g, 'bg-surface-elevated/60'],
    [/\bborder-(?:slate|zinc)-500\/\d+/g, 'border-line/50'],
    [/\btext-(?:slate|zinc|gray)-(?:400|500)\b/g, 'text-muted-ui'],
    // hue text (100–600 shades are all status text) — preserve alpha
    [new RegExp(`\\btext-(${HUES})-[1-6]00(/\\d+)?\\b`, 'g'), (m, h, a) => `text-state-${HUE_GROUP[h]}${a ?? ''}`],
    [/\btext-(violet|purple)-[1-6]00(\/\d+)?\b/g, (m, h, a) => `text-qa-accent${a ?? ''}`],
    // translucent hue tints
    [new RegExp(`\\bbg-(${HUES})-[4-6]00/(\\d+)\\b`, 'g'), (m, h, a) =>
        Number(a) <= 15 ? `bg-state-${HUE_GROUP[h]}-soft` : `bg-state-${HUE_GROUP[h]}/${a}`],
    [new RegExp(`\\bborder-(${HUES})-[4-6]00/(\\d+)\\b`, 'g'), (m, h, a) =>
        Number(a) <= 30 ? `border-state-${HUE_GROUP[h]}-border` : `border-state-${HUE_GROUP[h]}/${a}`],
    [new RegExp(`\\bborder-(${HUES})-500\\b(?!/)`, 'g'), (m, h) => `border-state-${HUE_GROUP[h]}`],
    [/\bbg-(violet|purple)-[4-6]00\/(\d+)\b/g, (m, h, a) => `bg-qa-accent/${Math.min(Number(a), 20)}`],
    [/\bborder-(violet|purple)-[4-6]00\/(\d+)\b/g, () => 'border-qa-accent/20'],
]

const unmapped = new Map()
let filesChanged = 0
let replaced = 0

const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) return walk(p)
        return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : []
    })

for (const file of walk(SRC)) {
    const before = fs.readFileSync(file, 'utf8')
    let after = before.replace(CLASS_RE, (whole, util, hex, alpha) => {
        const out = mapClass(util, hex, alpha ?? null)
        if (out == null) {
            unmapped.set(whole, (unmapped.get(whole) ?? 0) + 1)
            return whole
        }
        replaced++
        return out
    })
    for (const [re, sub] of PASS2) {
        const matches = after.match(re)
        if (!matches) continue
        replaced += matches.length
        after = after.replace(re, sub)
    }
    if (after !== before) {
        filesChanged++
        if (!DRY) fs.writeFileSync(file, after)
    }
}

console.log(`${DRY ? '[dry] ' : ''}replaced ${replaced} classes across ${filesChanged} files`)
if (unmapped.size) {
    console.log('\nUNMAPPED (left in place):')
    for (const [cls, n] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${cls}`)
    process.exitCode = 1
}
