import { AlertTriangle, CheckCircle2, Clock3, FlaskConical, GitPullRequest, Handshake } from 'lucide-react'
import { useMemo } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { getCollaborationMetrics, getReleaseQueue, type ReleaseQueueItem } from '@/lib/collaboration'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
    return (
        <div className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
        </div>
    )
}

export default function ReleaseQueuePage() {
    const navigate = useNavigate()
    const projects = useProjectStore((state) => state.projects)
    const activeProjectId = useProjectStore((state) => state.activeProjectId)
    const activeProject = projects.find((project) => project.id === activeProjectId)

    const queue = useMemo(() => activeProject ? getReleaseQueue(activeProject) : null, [activeProject])
    const metrics = useMemo(() => activeProject ? getCollaborationMetrics(activeProject) : null, [activeProject])

    if (!activeProject || !queue || !metrics) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-semibold text-[#E2E8F0]">Release Queue</h1>
                <p className="text-sm text-[#6B7280]">Select or create a project to review verification work.</p>
            </div>
        )
    }

    const sections: Array<{ title: string; icon: typeof CheckCircle2; items: ReleaseQueueItem[]; empty: string }> = [
        {
            title: 'Ready for QA',
            icon: CheckCircle2,
            items: queue.tasksReadyForQa,
            empty: 'No fixes are currently waiting for QA verification.',
        },
        {
            title: 'Missing Evidence',
            icon: AlertTriangle,
            items: queue.handoffsMissingEvidence,
            empty: 'All active handoffs currently include evidence.',
        },
        {
            title: 'PRs Waiting for Retest',
            icon: GitPullRequest,
            items: queue.prsLinkedButNotRetested,
            empty: 'No linked PRs are waiting on QA retest.',
        },
        {
            title: 'Failed Verification',
            icon: FlaskConical,
            items: queue.failedVerificationsNeedingDev,
            empty: 'No failed verifications are waiting on developer follow-up.',
        },
    ]

    return (
        <div className="space-y-6 max-w-[1600px] pb-10">
            <header className="flex items-center justify-between border-b border-[#2A2A3A] pb-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B7280]">Verification Workflow</p>
                    <h1 className="text-2xl font-semibold text-[#E2E8F0] tracking-tight">Release Queue</h1>
                    <p className="text-xs text-[#6B7280]">One view for ready-for-QA fixes, evidence quality, and retest priority.</p>
                </div>
                <Button className="bg-[#A78BFA] text-[#0F0F13] hover:bg-[#C4B5FD]" onClick={() => navigate('/tasks')}>
                    Open Task Board
                </Button>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label="Ready for QA" value={queue.tasksReadyForQa.length} tone="text-[#38BDF8]" />
                <MetricCard label="Missing Evidence" value={queue.handoffsMissingEvidence.length} tone="text-[#EF4444]" />
                <MetricCard label="Avg Dev Ack" value={metrics.avgDevAcknowledgementHours === null ? 'n/a' : `${metrics.avgDevAcknowledgementHours}h`} tone="text-[#F59E0B]" />
                <MetricCard label="Reopen Rate" value={`${metrics.reopenRate}%`} tone="text-[#A78BFA]" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {sections.map((section) => (
                    <section key={section.title} className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <section.icon className="h-4 w-4 text-[#A78BFA]" />
                            <h2 className="text-sm font-bold text-[#E2E8F0]">{section.title}</h2>
                            <span className="rounded-full bg-[#1A1A24] px-2 py-0.5 text-[10px] font-bold text-[#6B7280]">{section.items.length}</span>
                        </div>
                        <div className="space-y-3">
                            {section.items.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-[#2A2A3A] p-4 text-xs text-[#6B7280]">{section.empty}</p>
                            ) : section.items.map((item) => (
                                <div key={`${section.title}-${item.task.id}`} className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs font-bold text-[#E2E8F0]">{item.task.title}</div>
                                            <div className="mt-1 text-[11px] text-[#6B7280]">
                                                {item.handoff?.environmentName || 'No environment'} · {item.task.collabState || 'draft'}
                                            </div>
                                        </div>
                                        <Button variant="outline" className="border-[#2A2A3A] text-[#E2E8F0]" onClick={() => navigate('/tasks')}>
                                            Review
                                        </Button>
                                    </div>
                                    {item.handoff?.missingFields?.length ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {item.handoff.missingFields.map((field) => (
                                                <span key={field} className="rounded-full bg-[#EF4444]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#EF4444]">
                                                    Missing {field}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                    {item.handoff?.linkedPrs?.length ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {item.handoff.linkedPrs.map((pr) => (
                                                <span key={`${pr.repoFullName}-${pr.prNumber}`} className="rounded-full bg-[#38BDF8]/10 px-2 py-1 text-[10px] font-bold text-[#38BDF8]">
                                                    {pr.repoFullName}#{pr.prNumber}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            <section className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-5">
                <div className="mb-4 flex items-center gap-2">
                    <Handshake className="h-4 w-4 text-[#A78BFA]" />
                    <h2 className="text-sm font-bold text-[#E2E8F0]">Collaboration SLAs</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-4">
                        <div className="flex items-center gap-2 text-[#F59E0B]"><Clock3 className="h-4 w-4" /><span className="text-xs font-bold">Dev Acknowledgement</span></div>
                        <p className="mt-2 text-lg font-semibold text-[#E2E8F0]">{metrics.avgDevAcknowledgementHours === null ? 'No data yet' : `${metrics.avgDevAcknowledgementHours} hours average`}</p>
                    </div>
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-4">
                        <div className="flex items-center gap-2 text-[#38BDF8]"><FlaskConical className="h-4 w-4" /><span className="text-xs font-bold">Ready for QA to Verify</span></div>
                        <p className="mt-2 text-lg font-semibold text-[#E2E8F0]">{metrics.avgReadyForQaToVerificationHours === null ? 'No data yet' : `${metrics.avgReadyForQaToVerificationHours} hours average`}</p>
                    </div>
                    <div className="rounded-lg border border-[#2A2A3A] bg-[#0F0F13] p-4">
                        <div className="flex items-center gap-2 text-[#A78BFA]"><GitPullRequest className="h-4 w-4" /><span className="text-xs font-bold">Verification Reopen Rate</span></div>
                        <p className="mt-2 text-lg font-semibold text-[#E2E8F0]">{metrics.reopenRate}%</p>
                    </div>
                </div>
            </section>
        </div>
    )
}
