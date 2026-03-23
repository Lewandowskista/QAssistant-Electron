/**
 * Phase 3 — @mention textarea
 * Drop-in replacement for <textarea> that shows a member picker when the user
 * types "@". Falls back to a plain textarea when sync is not configured.
 */
import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { useSyncStore } from '@/store/useSyncStore'
import type { WorkspaceMember } from '@/types/sync'

interface MentionTextareaProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    rows?: number
    className?: string
    disabled?: boolean
}

function initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
]
const EMPTY_MEMBERS: WorkspaceMember[] = []

function colorForName(name: string): string {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function MentionTextarea({
    value,
    onChange,
    placeholder,
    rows = 3,
    className,
    disabled,
}: MentionTextareaProps) {
    const members = useSyncStore(s => s.workspaceInfo?.members ?? EMPTY_MEMBERS)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionStart, setMentionStart] = useState(0)
    const [selectedIdx, setSelectedIdx] = useState(0)

    const filtered = mentionQuery !== null
        ? members.filter(m =>
            m.display_name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(mentionQuery.toLowerCase())
          )
        : []

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        const val = e.target.value
        onChange(val)

        const cursor = e.target.selectionStart ?? val.length
        // Find the last '@' before cursor on the same line
        const textBeforeCursor = val.slice(0, cursor)
        const atIdx = textBeforeCursor.lastIndexOf('@')
        if (atIdx !== -1) {
            const between = textBeforeCursor.slice(atIdx + 1)
            if (!between.includes(' ') && !between.includes('\n')) {
                setMentionQuery(between)
                setMentionStart(atIdx)
                setSelectedIdx(0)
                return
            }
        }
        setMentionQuery(null)
    }

    function insertMention(displayName: string) {
        const before = value.slice(0, mentionStart)
        const after = value.slice(textareaRef.current?.selectionStart ?? mentionStart + 1 + (mentionQuery?.length ?? 0))
        const newVal = `${before}@${displayName} ${after}`
        onChange(newVal)
        setMentionQuery(null)
        // Restore focus
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                const pos = before.length + displayName.length + 2
                textareaRef.current.focus()
                textareaRef.current.setSelectionRange(pos, pos)
            }
        })
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (mentionQuery === null || filtered.length === 0) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIdx(i => (i + 1) % filtered.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIdx(i => (i - 1 + filtered.length) % filtered.length)
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            insertMention(filtered[selectedIdx].display_name)
        } else if (e.key === 'Escape') {
            setMentionQuery(null)
        }
    }

    // Close picker when clicking outside
    useEffect(() => {
        const handler = () => setMentionQuery(null)
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [])

    return (
        <div className="relative">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={rows}
                disabled={disabled}
                className={cn(
                    'w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-lg px-3 py-2 text-sm text-[#E2E8F0]',
                    'placeholder-[#4B5563] focus:outline-none focus:border-[#A78BFA] transition-colors resize-none',
                    disabled && 'opacity-50 cursor-not-allowed',
                    className
                )}
            />

            {/* Mention picker */}
            {mentionQuery !== null && filtered.length > 0 && (
                <div
                    className="absolute z-50 left-0 mt-1 w-64 rounded-xl border border-[#2D2D44] bg-[#13131A] shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="px-3 py-1.5 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider border-b border-[#2D2D44]">
                        Mention a teammate
                    </div>
                    {filtered.map((m, idx) => (
                        <button
                            key={m.user_id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); insertMention(m.display_name) }}
                            className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                                idx === selectedIdx ? 'bg-[#A78BFA]/10' : 'hover:bg-[#1A1A2E]'
                            )}
                        >
                            <div className={cn(
                                'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                                colorForName(m.display_name)
                            )}>
                                {initials(m.display_name || '?')}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-[#E2E8F0] truncate">{m.display_name}</p>
                                <p className="text-[10px] text-[#6B7280] truncate">{m.email}</p>
                            </div>
                            <span className={cn(
                                'ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0',
                                m.role === 'owner'
                                    ? 'bg-[#A78BFA]/10 text-[#A78BFA]'
                                    : 'bg-[#2D2D44] text-[#6B7280]'
                            )}>
                                {m.role}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Hint */}
            {members.length > 0 && (
                <p className="mt-1 text-[10px] text-[#4B5563]">Type @ to mention a teammate</p>
            )}
        </div>
    )
}
