import { cn } from "@/lib/utils"

export interface TaskSummaryCard {
    id: string
    title: string
    description: string
    count: number
}

interface TaskBoardSummaryProps {
    items: TaskSummaryCard[]
    onSelect: (id: string) => void
}

export function TaskBoardSummary({ items, onSelect }: TaskBoardSummaryProps) {
    return (
        <div className="grid grid-cols-5 gap-3">
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={cn(
                        "rounded-xl border border-[#2A2A3A] bg-[#13131A] p-4 text-left transition-colors hover:border-[#A78BFA]/40 hover:bg-[#181822]"
                    )}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{item.title}</div>
                            <p className="mt-1 text-[11px] leading-relaxed text-[#9CA3AF]">{item.description}</p>
                        </div>
                        <div className="rounded-lg border border-[#A78BFA]/20 bg-[#A78BFA]/10 px-2.5 py-1 text-sm font-black text-[#C4B5FD]">
                            {item.count}
                        </div>
                    </div>
                </button>
            ))}
        </div>
    )
}
