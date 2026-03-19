import { Sparkles, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"

type Props = {
    featureName: string
    description: string
}

export function AiSetupPrompt({ featureName, description }: Props) {
    const navigate = useNavigate()

    return (
        <div className="rounded-xl border border-dashed border-[#A78BFA]/30 bg-[#A78BFA]/5 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[#A78BFA]">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">{featureName}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            <div className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13]/60 p-3 text-xs text-[#6B7280] font-mono leading-relaxed">
                <span className="text-[#A78BFA]">// Sample output</span>{"\n"}
                {"{"}
                {"\n"}  title: <span className="text-emerald-400">"Verify guest checkout with VISA card"</span>,{"\n"}
                {"  "}preConditions: <span className="text-emerald-400">"Cart has 1 in-stock product"</span>,{"\n"}
                {"  "}priority: <span className="text-cyan-400">"blocker"</span>,{"\n"}
                {"  "}steps: <span className="text-emerald-400">"1. Add product → 2. Continue as guest → ..."</span>{"\n"}
                {"}"}
            </div>
            <Button
                size="sm"
                variant="outline"
                className="self-start gap-2 border-[#A78BFA]/40 text-[#A78BFA] hover:bg-[#A78BFA]/10 hover:border-[#A78BFA]"
                onClick={() => navigate('/settings')}
            >
                Configure Gemini API
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}
