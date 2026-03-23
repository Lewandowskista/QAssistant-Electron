import type { ReactNode } from "react"
import { TraceabilityResult } from "@/store/useProjectStore"

interface TraceabilityPanelProps {
    traceability: TraceabilityResult
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{title}</h3>
            {children}
        </section>
    )
}

function Empty({ children }: { children: string }) {
    return <p className="text-xs italic text-[#6B7280]">{children}</p>
}

export function TraceabilityPanel({ traceability }: TraceabilityPanelProps) {
    const linkedPrs = traceability.handoffs.flatMap((handoff) => handoff.linkedPrs || [])
    const activeHandoff = traceability.activeHandoff || traceability.handoffs[0]
    const evidenceCount = (activeHandoff?.linkedExecutionRefs?.length ?? 0) + (activeHandoff?.linkedFileIds?.length ?? 0) + (activeHandoff?.linkedNoteIds?.length ?? 0)

    return (
        <div className="space-y-5">
            <Section title="Workflow Summary">
                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Coverage</div>
                        <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">{traceability.linkedTestCases.length} linked tests</div>
                    </div>
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Evidence</div>
                        <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">{evidenceCount} linked artifacts</div>
                    </div>
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">PR Context</div>
                        <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">{linkedPrs.length} linked PRs</div>
                    </div>
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Handoff Health</div>
                        <div className="mt-2 text-sm font-semibold text-[#E2E8F0]">
                            {activeHandoff ? (activeHandoff.isComplete ? 'Ready to send' : 'Needs fields') : 'No handoff'}
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Linked Test Cases">
                {traceability.linkedTestCases.length === 0 ? (
                    <Empty>No linked test cases.</Empty>
                ) : (
                    <div className="space-y-2">
                        {traceability.linkedTestCases.map((testCase) => (
                            <div key={testCase.id} className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3">
                                <div className="text-[10px] font-bold text-[#A78BFA]">{testCase.displayId}</div>
                                <div className="text-xs text-[#E2E8F0]">{testCase.title}</div>
                                <div className="mt-2 text-[10px] text-[#6B7280]">
                                    {(testCase.components || []).join(", ") || "No components"} • {testCase.status}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Linked Notes">
                {traceability.linkedNotes.length === 0 ? (
                    <Empty>No linked notes.</Empty>
                ) : (
                    <div className="space-y-2">
                        {traceability.linkedNotes.map((note) => (
                            <div key={note.id} className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3 text-xs text-[#E2E8F0]">
                                {note.title}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Linked Files">
                {traceability.linkedFiles.length === 0 ? (
                    <Empty>No linked files.</Empty>
                ) : (
                    <div className="space-y-2">
                        {traceability.linkedFiles.map((file) => (
                            <div key={file.id} className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3 text-xs text-[#E2E8F0]">
                                {file.fileName}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Linked PRs">
                {linkedPrs.length === 0 ? (
                    <Empty>No PRs linked through handoffs.</Empty>
                ) : (
                    <div className="space-y-2">
                        {linkedPrs.map((pr) => (
                            <div key={`${pr.repoFullName}-${pr.prNumber}`} className="rounded-lg border border-[#2A2A3A] bg-[#1A1A24] p-3 text-xs text-[#E2E8F0]">
                                {pr.repoFullName} #{pr.prNumber}
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    )
}
