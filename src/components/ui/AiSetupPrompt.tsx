import { Sparkles, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"

type Props = {
    featureName: string
    description: string
    /** Which provider the project is set to, so the CTA points at the right setup. */
    provider?: 'gemini' | 'nim' | 'ollama'
    /** Why the provider is not usable yet (missing key, daemon down, no models pulled). */
    reason?: string
}

const CTA_LABEL: Record<string, string> = {
    gemini: 'Configure Google AI Studio',
    nim: 'Configure NVIDIA NIM',
    ollama: 'Configure Ollama',
}

export function AiSetupPrompt({ featureName, description, provider = 'gemini', reason }: Props) {
    const navigate = useNavigate()

    return (
        <div className="rounded-xl border border-dashed border-qa-accent/30 bg-qa-accent/5 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-brand">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">{featureName}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            {reason && (
                <p className="text-xs text-state-warning leading-relaxed">{reason}</p>
            )}
            <div className="rounded-lg border border-ui bg-surface-app/60 p-3 text-xs text-muted-ui font-mono leading-relaxed">
                <span className="text-brand">// Sample output</span>{"\n"}
                {"{"}
                {"\n"}  title: <span className="text-state-success">"Verify guest checkout with VISA card"</span>,{"\n"}
                {"  "}preConditions: <span className="text-state-success">"Cart has 1 in-stock product"</span>,{"\n"}
                {"  "}priority: <span className="text-cyan-400">"blocker"</span>,{"\n"}
                {"  "}steps: <span className="text-state-success">"1. Add product → 2. Continue as guest → ..."</span>{"\n"}
                {"}"}
            </div>
            <Button
                size="sm"
                variant="outline"
                className="self-start gap-2 border-qa-accent/40 text-brand hover:bg-qa-accent/10 hover:border-qa-accent"
                onClick={() => navigate('/settings')}
            >
                {CTA_LABEL[provider] ?? 'Configure AI provider'}
                <ArrowRight className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}
