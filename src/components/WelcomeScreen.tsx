import { Handshake, Sparkles, GitPullRequest, ShieldCheck, ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
    onLoadDemo: () => void
}

const features = [
    {
        icon: Handshake,
        title: "QA ↔ Dev Handoff Workflow",
        description: "Structured bug handoffs with typed templates, acknowledgement tracking, and a full evidence trail — so nothing falls through the cracks.",
        color: "text-violet-400",
        bg: "bg-violet-400/10 border-violet-400/20",
    },
    {
        icon: Sparkles,
        title: "AI Test Case Generation",
        description: "Generate detailed test cases from your Linear or Jira issues in seconds. Preconditions, steps, test data, and expected results — all structured and linked.",
        color: "text-cyan-400",
        bg: "bg-cyan-400/10 border-cyan-400/20",
    },
    {
        icon: GitPullRequest,
        title: "Coverage & Traceability",
        description: "See exactly which tasks have test coverage and which don't. The coverage matrix links tasks → test cases → executions → handoffs end to end.",
        color: "text-emerald-400",
        bg: "bg-emerald-400/10 border-emerald-400/20",
    },
    {
        icon: ShieldCheck,
        title: "Release Quality Gates",
        description: "Configurable GO / NO-GO gates evaluate pass rate, critical bugs, and coverage before each deployment — right from the dashboard.",
        color: "text-amber-400",
        bg: "bg-amber-400/10 border-amber-400/20",
    },
]

export default function WelcomeScreen({ onLoadDemo }: Props) {
    function handleNewProject() {
        window.dispatchEvent(new CustomEvent('open-project-dialog'))
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-12 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
                <ClipboardCheck className="h-7 w-7 text-primary" />
            </div>

            <h1 className="text-2xl font-semibold text-foreground mb-2">Welcome to QAssistant</h1>
            <p className="text-sm text-muted-foreground max-w-md mb-8">
                Your QA workspace for test management, AI-assisted analysis, and structured developer collaboration.
                Create a project to get started, or load a demo to see it in action.
            </p>

            <div className="flex items-center gap-3 mb-12">
                <Button onClick={onLoadDemo} className="gap-2">
                    <ClipboardCheck className="h-4 w-4" />
                    Load Demo Project
                </Button>
                <Button variant="outline" onClick={handleNewProject} className="gap-2">
                    New Project
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl text-left">
                {features.map(({ icon: Icon, title, description, color, bg }) => (
                    <div key={title} className={`rounded-xl border p-4 ${bg}`}>
                        <div className={`flex items-center gap-2 mb-2 font-medium text-sm ${color}`}>
                            <Icon className="h-4 w-4 shrink-0" />
                            {title}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
