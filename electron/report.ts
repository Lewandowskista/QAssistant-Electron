/**
 * ReportService — mirrors C# ReportService.cs
 * Generates CSV exports and Markdown test summary reports.
 * (PDF generation is handled via HTML string that the renderer can save.)
 */

interface TestCase {
    id?: string;
    testCaseId?: string;
    title: string;
    status?: string;
    priority?: string;
    preConditions?: string;
    steps?: string;
    testSteps?: string;
    testData?: string;
    expectedResult?: string;
    actualResult?: string;
    sourceIssueId?: string;
    source?: string;
    createdAt?: string;
    testPlanId?: string;
    sapModule?: string;
}

interface TestPlan {
    id: string;
    testPlanId?: string;
    name: string;
    testCases?: TestCase[];
    isArchived?: boolean;
    createdAt?: string;
}

interface TestExecution {
    id?: string;
    executionId?: string;
    testCaseId?: string;
    testPlanId?: string;
    result?: string;
    actualResult?: string;
    notes?: string;
    executedAt?: string;
}

interface Task {
    id: string;
    title: string;
    status: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    sourceIssueId?: string;
    externalId?: string;
    ticketUrl?: string;
    issueType?: string;
    assignee?: string;
    labels?: string;
}

interface TestCaseExecution {
    id: string;
    testCaseId: string;
    result: string;
    snapshotTestCaseTitle?: string;
    durationSeconds?: number;
}

interface TestPlanExecution {
    id: string;
    testPlanId: string;
    snapshotTestPlanName: string;
    caseExecutions: TestCaseExecution[];
}

interface TestRunSession {
    id: string;
    timestamp: number;
    isArchived?: boolean;
    planExecutions: TestPlanExecution[];
}

interface Project {
    id: string;
    name: string;
    testPlans?: TestPlan[];
    testExecutions?: TestExecution[];
    tasks?: Task[];
    testRunSessions?: TestRunSession[];
}

function csvEscape(value: string): string {
    if (!value) return '';
    let s = value;
    // Formula injection mitigation
    if (s.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(s[0])) {
        s = "'" + s;
    }
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function htmlEscape(s: string | undefined): string {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface HealthResult {
    score: number;
    label: string;
    color: string;
    bg: string;
    border: string;
    openCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
}

export function computeHealthScore(tasks: Task[]): HealthResult {
    const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'completed');
    const criticalCount = openTasks.filter(t => t.priority === 'critical').length;
    const highCount = openTasks.filter(t => t.priority === 'high').length;
    const mediumCount = openTasks.filter(t => t.priority === 'medium').length;
    const lowCount = openTasks.filter(t => t.priority === 'low').length;

    const deduction =
        Math.min(criticalCount * 25, 50) +
        Math.min(highCount * 10, 30) +
        Math.min(mediumCount * 3, 15) +
        Math.min(lowCount * 1, 5);
    const score = Math.max(0, Math.min(100, 100 - deduction));

    if (score >= 75) {
        return { score, label: 'Healthy', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', openCount: openTasks.length, criticalCount, highCount, mediumCount, lowCount };
    } else if (score >= 45) {
        return { score, label: 'At Risk', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', openCount: openTasks.length, criticalCount, highCount, mediumCount, lowCount };
    } else {
        return { score, label: 'Critical', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', openCount: openTasks.length, criticalCount, highCount, mediumCount, lowCount };
    }
}

interface CoveredIssue {
    task: Task;
    coveringPlanNames: string[];
    caseCount: number;
}

interface ImpactResult {
    coveredIssues: CoveredIssue[];
    uncoveredCritical: Task[];
    uncoveredHigh: Task[];
    totalOpenIssues: number;
}

export function buildImpactAssessment(plans: TestPlan[], tasks: Task[]): ImpactResult {
    const taskByKey = new Map<string, Task>();
    for (const t of tasks) {
        if (t.sourceIssueId) taskByKey.set(t.sourceIssueId, t);
        if (t.externalId) taskByKey.set(t.externalId, t);
        taskByKey.set(t.id, t);
    }

    // issueKey -> { planNames, caseCount }
    const coverageMap = new Map<string, { planNames: Set<string>; caseCount: number }>();

    for (const plan of plans) {
        for (const tc of plan.testCases || []) {
            if (!tc.sourceIssueId) continue;
            const key = tc.sourceIssueId;
            const existing = coverageMap.get(key) || { planNames: new Set<string>(), caseCount: 0 };
            existing.planNames.add(plan.name);
            existing.caseCount += 1;
            coverageMap.set(key, existing);
        }
    }

    const openTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'completed');
    const coveredIssues: CoveredIssue[] = [];
    const uncoveredCritical: Task[] = [];
    const uncoveredHigh: Task[] = [];

    for (const t of openTasks) {
        const keys = [t.sourceIssueId, t.externalId, t.id].filter(Boolean) as string[];
        const coverage = keys.map(k => coverageMap.get(k)).find(c => c != null);
        if (coverage) {
            if (coveredIssues.length < 50) {
                coveredIssues.push({ task: t, coveringPlanNames: [...coverage.planNames], caseCount: coverage.caseCount });
            }
        } else {
            if (t.priority === 'critical' && uncoveredCritical.length < 20) uncoveredCritical.push(t);
            else if (t.priority === 'high' && uncoveredHigh.length < 20) uncoveredHigh.push(t);
        }
    }

    return { coveredIssues, uncoveredCritical, uncoveredHigh, totalOpenIssues: openTasks.length };
}

interface SessionSummary {
    timestamp: number;
    planNames: string[];
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    passRate: number;
    trend: 'up' | 'down' | 'flat';
}

export function buildSessionSummaries(sessions: TestRunSession[], plans: TestPlan[]): SessionSummary[] {
    const planNameById = new Map<string, string>();
    for (const p of plans) planNameById.set(p.id, p.name);

    const sorted = [...sessions]
        .filter(s => !s.isArchived)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

    const summaries: SessionSummary[] = sorted.map(session => {
        let total = 0, passed = 0, failed = 0, blocked = 0;
        const planNames: string[] = [];

        for (const pe of session.planExecutions) {
            const planName = planNameById.get(pe.testPlanId) || pe.snapshotTestPlanName || pe.testPlanId;
            if (!planNames.includes(planName)) planNames.push(planName);
            for (const ce of pe.caseExecutions) {
                total++;
                if (ce.result === 'passed') passed++;
                else if (ce.result === 'failed') failed++;
                else if (ce.result === 'blocked') blocked++;
            }
        }

        const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
        return { timestamp: session.timestamp, planNames, total, passed, failed, blocked, passRate, trend: 'flat' };
    });

    // Compute trend relative to next (older) session
    for (let i = 0; i < summaries.length - 1; i++) {
        const diff = summaries[i].passRate - summaries[i + 1].passRate;
        summaries[i].trend = diff > 2 ? 'up' : diff < -2 ? 'down' : 'flat';
    }

    return summaries;
}

export function generateTestCasesCsv(project: Project, filterPlanIds?: string[]): string {
    const plans = filterPlanIds
        ? (project.testPlans || []).filter(p => filterPlanIds.includes(p.id))
        : (project.testPlans || []);

    const rows: string[] = [
        'Test Plan ID,Test Plan Name,Test Case ID,Title,Status,Pre-Conditions,Test Steps,Test Data,Expected Result,Actual Result,Source,Generated At'
    ];

    for (const plan of [...plans].sort((a, b) => (a.testPlanId || a.name).localeCompare(b.testPlanId || b.name))) {
        const cases = (plan.testCases || []).sort((a, b) => (a.testCaseId || '').localeCompare(b.testCaseId || ''));
        for (const tc of cases) {
            rows.push([
                csvEscape(plan.testPlanId || ''),
                csvEscape(plan.name),
                csvEscape(tc.testCaseId || ''),
                csvEscape(tc.title),
                csvEscape(tc.status || ''),
                csvEscape(tc.preConditions || ''),
                csvEscape(tc.steps || tc.testSteps || ''),
                csvEscape(tc.testData || ''),
                csvEscape(tc.expectedResult || ''),
                csvEscape(tc.actualResult || ''),
                csvEscape(tc.source || 'Manual'),
                csvEscape(tc.createdAt || new Date().toISOString().substring(0, 16).replace('T', ' ')),
            ].join(','));
        }
    }

    return rows.join('\n');
}

export function generateExecutionsCsv(project: Project, filterIds?: string[]): string {
    const executions = filterIds
        ? (project.testExecutions || []).filter(e => filterIds.includes(e.id || ''))
        : (project.testExecutions || []);

    const testCaseLookup = new Map<string, TestCase>();
    const testPlanLookup = new Map<string, TestPlan>();

    for (const plan of project.testPlans || []) {
        testPlanLookup.set(plan.id, plan);
        for (const tc of plan.testCases || []) {
            if (tc.id) testCaseLookup.set(tc.id, tc);
        }
    }

    const rows: string[] = [
        'Execution ID,Test Case ID,Test Case Title,Test Plan ID,Result,Actual Result,Notes,Executed At'
    ];

    const sorted = [...executions].sort((a, b) =>
        new Date(b.executedAt || 0).getTime() - new Date(a.executedAt || 0).getTime()
    );

    for (const exec of sorted) {
        const tc = exec.testCaseId ? testCaseLookup.get(exec.testCaseId) : undefined;
        const plan = exec.testPlanId ? testPlanLookup.get(exec.testPlanId) : undefined;
        rows.push([
            csvEscape(exec.executionId || exec.id || ''),
            csvEscape(tc?.testCaseId || 'N/A'),
            csvEscape(tc?.title || 'Deleted'),
            csvEscape(plan?.testPlanId || plan?.name || 'N/A'),
            csvEscape(exec.result || ''),
            csvEscape(exec.actualResult || ''),
            csvEscape(exec.notes || ''),
            csvEscape(exec.executedAt ? exec.executedAt.substring(0, 16).replace('T', ' ') : ''),
        ].join(','));
    }

    return rows.join('\n');
}

export function generateTestSummaryMarkdown(
    project: Project,
    filterPlanIds?: string[],
    criticalityAssessment?: string
): string {
    const plans = filterPlanIds
        ? (project.testPlans || []).filter(p => filterPlanIds.includes(p.id))
        : (project.testPlans || []);

    const allExecs = project.testExecutions || [];
    const allCases = plans.flatMap(p => p.testCases || []);

    const passed = allCases.filter(c => c.status === 'passed').length;
    const failed = allCases.filter(c => c.status === 'failed').length;
    const blocked = allCases.filter(c => c.status === 'blocked').length;
    const skipped = allCases.filter(c => c.status === 'skipped').length;
    const notRun = allCases.filter(c => !c.status || c.status === 'not-run').length;
    const total = allCases.length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    const lines: string[] = [];
    const now = new Date().toLocaleString();

    lines.push(`# Test Summary Report`);
    lines.push(`**Project:** ${project.name}  `);
    lines.push(`**Generated:** ${now}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Test Plans | ${plans.length} |`);
    lines.push(`| Total Test Cases | ${total} |`);
    lines.push(`| Total Executions | ${allExecs.length} |`);
    lines.push(`| Pass Rate | ${passRate}% |`);
    lines.push('');

    lines.push('## Status Breakdown');
    lines.push('');
    lines.push('| Status | Count | % |');
    lines.push('|--------|-------|---|');
    const statuses = [
        ['✅ Passed', passed],
        ['❌ Failed', failed],
        ['🟡 Blocked', blocked],
        ['⏭️ Skipped', skipped],
        ['⬜ Not Run', notRun],
    ] as const;
    for (const [label, count] of statuses) {
        const pct = total > 0 ? ((+count / total) * 100).toFixed(1) : '0.0';
        lines.push(`| ${label} | ${count} | ${pct}% |`);
    }
    lines.push('');

    lines.push('## Test Plans');
    lines.push('');
    for (const plan of [...plans].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())) {
        const cases = plan.testCases || [];
        const planPassed = cases.filter(c => c.status === 'passed').length;
        const planFailed = cases.filter(c => c.status === 'failed').length;
        const planRate = cases.length > 0 ? ((planPassed / cases.length) * 100).toFixed(0) : '0';

        lines.push(`### ${plan.testPlanId || ''} — ${plan.name}`);
        lines.push(`*${cases.length} cases · ${planRate}% pass rate (${planPassed} passed, ${planFailed} failed)*`);
        lines.push('');

        if (cases.length > 0) {
            lines.push('| ID | Title | Status | Priority |');
            lines.push('|----|-------|--------|----------|');
            for (const tc of [...cases].sort((a, b) => (a.testCaseId || '').localeCompare(b.testCaseId || ''))) {
                const statusIcon = tc.status === 'passed' ? '✅' : tc.status === 'failed' ? '❌' : tc.status === 'blocked' ? '🟡' : '⬜';
                const titleText = tc.title || '';
                const shortTitle = titleText.length > 60 ? titleText.substring(0, 57) + '...' : titleText;
                lines.push(`| \`${tc.testCaseId || ''}\` | ${shortTitle} | ${statusIcon} ${tc.status || 'not-run'} | ${tc.priority || 'medium'} |`);
            }
            lines.push('');
        }
    }

    // Recent executions
    const recentExecs = [...allExecs]
        .sort((a, b) => new Date(b.executedAt || 0).getTime() - new Date(a.executedAt || 0).getTime())
        .slice(0, 30);

    if (recentExecs.length > 0) {
        const testCaseLookup = new Map<string, TestCase>();
        for (const plan of plans) {
            for (const tc of plan.testCases || []) {
                if (tc.id) testCaseLookup.set(tc.id, tc);
            }
        }

        lines.push('## Recent Executions');
        lines.push('');
        lines.push('| Execution | Test Case | Result | Date |');
        lines.push('|-----------|-----------|--------|------|');
        for (const exec of recentExecs) {
            const tc = exec.testCaseId ? testCaseLookup.get(exec.testCaseId) : undefined;
            const tcLabel = tc ? `\`${tc.testCaseId}\` ${(tc.title || '').substring(0, 30)}...` : 'Deleted';
            const date = exec.executedAt ? exec.executedAt.substring(0, 16).replace('T', ' ') : '';
            const resultIcon = exec.result === 'passed' ? '✅' : exec.result === 'failed' ? '❌' : '⬜';
            lines.push(`| \`${exec.executionId || exec.id || ''}\` | ${tcLabel} | ${resultIcon} ${exec.result || ''} | ${date} |`);
        }
        lines.push('');
    }

    if (criticalityAssessment) {
        lines.push('---');
        lines.push('');
        lines.push('## AI Criticality Assessment');
        lines.push('');
        lines.push('*AI-generated analysis based on project data, test cases, and execution results*');
        lines.push('');
        lines.push(criticalityAssessment);
        lines.push('');
    }

    lines.push('---');
    lines.push(`*QAssistant · ${project.name} · ${new Date().toISOString().substring(0, 10)}*`);

    return lines.join('\n');
}

export function generateTestSummaryHtml(
    project: Project,
    filterPlanIds?: string[],
    criticalityAssessment?: string
): string {
    const plans = filterPlanIds
        ? (project.testPlans || []).filter(p => filterPlanIds.includes(p.id))
        : (project.testPlans || []);

    const allExecs = project.testExecutions || [];
    const allCases = plans.flatMap(p => p.testCases || []);

    const passed = allCases.filter(c => c.status === 'passed').length;
    const failed = allCases.filter(c => c.status === 'failed').length;
    const blocked = allCases.filter(c => c.status === 'blocked').length;
    const skipped = allCases.filter(c => c.status === 'skipped').length;
    const notRun = allCases.filter(c => !c.status || c.status === 'not-run').length;
    const total = allCases.length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    const now = new Date().toLocaleString();

    const tasks = (project as any).tasks as Task[] | undefined;
    const testRunSessions = (project as any).testRunSessions as TestRunSession[] | undefined;

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #1a1a24; line-height: 1.5; }
            h1, h2, h3 { color: #0f0f13; margin-top: 1.5em; font-weight: 700; }
            h1 { font-size: 28px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 0; }
            h2 { font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
            h3 { font-size: 16px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; page-break-inside: avoid; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background-color: #f8fafc; font-weight: 600; color: #475569; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .header-info { color: #64748b; font-size: 14px; margin-bottom: 30px; }
            .metric-box { display: inline-block; padding: 15px 25px; margin: 0 15px 15px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; min-width: 120px; }
            .metric-value { font-size: 24px; font-weight: 700; color: #0f0f13; }
            .metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-top: 4px; }
            .status-icon { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; }
            .bg-passed { background-color: #10b981; }
            .bg-failed { background-color: #ef4444; }
            .bg-blocked { background-color: #f59e0b; }
            .bg-skipped { background-color: #64748b; }
            .bg-notrun { background-color: #cbd5e1; }
            .text-passed { color: #10b981; font-weight: 600; }
            .text-failed { color: #ef4444; font-weight: 600; }
            .text-blocked { color: #f59e0b; font-weight: 600; }
            .text-skipped { color: #64748b; font-weight: 600; }
            .text-notrun { color: #64748b; font-weight: 600; opacity: 0.6; }
            .footer { margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; }
            .ai-block { background: #fdf4ff; border-left: 4px solid #d946ef; padding: 15px 20px; margin: 20px 0; margin-bottom: 20px; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
            code { background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 11px; color: #334155; }
            .health-banner { page-break-inside: avoid; border-radius: 12px; padding: 20px 24px; margin: 16px 0 20px 0; display: flex; align-items: center; justify-content: space-between; }
            .health-label { font-size: 26px; font-weight: 900; }
            .health-detail { font-size: 13px; color: #475569; margin-top: 4px; }
            .health-score-num { font-size: 52px; font-weight: 900; line-height: 1; opacity: 0.18; text-align: right; }
            .health-score-caption { font-size: 10px; color: #94a3b8; text-align: right; letter-spacing: 0.08em; }
            .priority-critical { color: #dc2626; font-weight: 700; }
            .priority-high { color: #ea580c; font-weight: 700; }
            .priority-medium { color: #d97706; font-weight: 600; }
            .priority-low { color: #64748b; font-weight: 500; }
            .session-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 8px 0; page-break-inside: avoid; background: #fafafa; }
            .session-meta { font-size: 12px; color: #64748b; }
            .session-counts { display: flex; gap: 16px; font-size: 12px; margin-top: 8px; }
            .trend-up { color: #16a34a; font-weight: 700; }
            .trend-down { color: #dc2626; font-weight: 700; }
            .trend-flat { color: #94a3b8; font-weight: 600; }
            .warning-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-bottom: 14px; font-size: 13px; }
            .coverage-badge { display: inline-block; background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; border-radius: 4px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
            .no-coverage-badge { display: inline-block; background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
        </style>
    </head>
    <body>
        <h1>Test Summary Report</h1>
        <div class="header-info">
            <strong>Project:</strong> ${project.name} <br/>
            <strong>Generated:</strong> ${now}
        </div>

        <h2>Overview</h2>
        <div>
            <div class="metric-box"><div class="metric-value">${plans.length}</div><div class="metric-label">Test Plans</div></div>
            <div class="metric-box"><div class="metric-value">${total}</div><div class="metric-label">Test Cases</div></div>
            <div class="metric-box"><div class="metric-value">${allExecs.length}</div><div class="metric-label">Executions</div></div>
            <div class="metric-box"><div class="metric-value" style="color: ${Number(passRate) >= 80 ? '#10b981' : Number(passRate) >= 60 ? '#f59e0b' : '#ef4444'}">${passRate}%</div><div class="metric-label">Pass Rate</div></div>
        </div>

        <h2>Status Breakdown</h2>
        <table>
            <tr><th>Status</th><th>Count</th><th>Percentage</th></tr>
            <tr><td><span class="status-icon bg-passed"></span> Passed</td><td>${passed}</td><td>${total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0'}%</td></tr>
            <tr><td><span class="status-icon bg-failed"></span> Failed</td><td>${failed}</td><td>${total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0'}%</td></tr>
            <tr><td><span class="status-icon bg-blocked"></span> Blocked</td><td>${blocked}</td><td>${total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0'}%</td></tr>
            <tr><td><span class="status-icon bg-skipped"></span> Skipped</td><td>${skipped}</td><td>${total > 0 ? ((skipped / total) * 100).toFixed(1) : '0.0'}%</td></tr>
            <tr><td><span class="status-icon bg-notrun"></span> Not Run</td><td>${notRun}</td><td>${total > 0 ? ((notRun / total) * 100).toFixed(1) : '0.0'}%</td></tr>
        </table>

        <h2>Test Plans</h2>
    `;

    // --- Project Health Status ---
    if (tasks && tasks.length > 0) {
        const h = computeHealthScore(tasks);
        html += `
        <h2>Project Health Status</h2>
        <div class="health-banner" style="background:${h.bg}; border: 2px solid ${h.border};">
            <div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:6px;">Overall Health</div>
                <div class="health-label" style="color:${h.color};">${h.label}</div>
                <div class="health-detail">${h.openCount} open issue${h.openCount !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; ${h.criticalCount} critical &nbsp;&middot;&nbsp; ${h.highCount} high priority</div>
            </div>
            <div>
                <div class="health-score-num" style="color:${h.color};">${h.score}</div>
                <div class="health-score-caption">HEALTH SCORE</div>
            </div>
        </div>
        <table>
            <tr><th>Priority</th><th>Open Issues</th><th>Risk Level</th></tr>
            <tr><td class="priority-critical">&#9679; Critical</td><td>${h.criticalCount}</td><td>Release blocker</td></tr>
            <tr><td class="priority-high">&#9679; High</td><td>${h.highCount}</td><td>Significant regression risk</td></tr>
            <tr><td class="priority-medium">&#9679; Medium</td><td>${h.mediumCount}</td><td>Moderate concern</td></tr>
            <tr><td class="priority-low">&#9679; Low</td><td>${h.lowCount}</td><td>Minor / cosmetic</td></tr>
        </table>
        `;

        // --- Impact Assessment ---
        const impact = buildImpactAssessment(plans, tasks);
        const hasImpactData = impact.coveredIssues.length > 0 || impact.uncoveredCritical.length > 0 || impact.uncoveredHigh.length > 0;

        if (hasImpactData) {
            html += `<h2>Impact Assessment</h2>`;

            const uncoveredAll = [...impact.uncoveredCritical, ...impact.uncoveredHigh];
            if (uncoveredAll.length > 0) {
                html += `
                <div class="warning-box">
                    <strong>${uncoveredAll.length} critical/high issue${uncoveredAll.length !== 1 ? 's' : ''} have no test coverage</strong> — these carry release risk.
                </div>
                <table>
                    <tr><th style="width:15%">Issue ID</th><th style="width:45%">Title</th><th style="width:12%">Priority</th><th style="width:15%">Status</th><th style="width:13%">Coverage</th></tr>
                `;
                for (const t of uncoveredAll) {
                    const issueId = htmlEscape(t.sourceIssueId || t.externalId || t.id);
                    const titleText = t.title || '';
                    const title = htmlEscape(titleText.length > 60 ? titleText.substring(0, 57) + '...' : titleText);
                    html += `<tr>
                        <td><code>${issueId}</code></td>
                        <td>${title}</td>
                        <td class="priority-${t.priority}">${t.priority}</td>
                        <td>${htmlEscape(t.status)}</td>
                        <td><span class="no-coverage-badge">No Tests</span></td>
                    </tr>`;
                }
                html += `</table>`;
            }

            if (impact.coveredIssues.length > 0) {
                html += `
                <h3>Covered Issues</h3>
                <table>
                    <tr><th style="width:15%">Issue ID</th><th style="width:40%">Title</th><th style="width:12%">Priority</th><th style="width:13%">Test Cases</th><th style="width:20%">Plans</th></tr>
                `;
                for (const { task: t, coveringPlanNames, caseCount } of impact.coveredIssues) {
                    const issueId = htmlEscape(t.sourceIssueId || t.externalId || t.id);
                    const titleText = t.title || '';
                    const title = htmlEscape(titleText.length > 55 ? titleText.substring(0, 52) + '...' : titleText);
                    const planList = htmlEscape(coveringPlanNames.join(', ').substring(0, 60));
                    html += `<tr>
                        <td><code>${issueId}</code></td>
                        <td>${title}</td>
                        <td class="priority-${t.priority}">${t.priority}</td>
                        <td><span class="coverage-badge">${caseCount} case${caseCount !== 1 ? 's' : ''}</span></td>
                        <td style="font-size:11px;color:#64748b;">${planList}</td>
                    </tr>`;
                }
                html += `</table>`;
            }
        }
    }

    for (const plan of [...plans].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())) {
        const cases = plan.testCases || [];
        const planPassed = cases.filter(c => c.status === 'passed').length;
        const planFailed = cases.filter(c => c.status === 'failed').length;
        const planRate = cases.length > 0 ? ((planPassed / cases.length) * 100).toFixed(0) : '0';

        html += `
        <h3>${plan.testPlanId || ''} — ${plan.name}</h3>
        <p style="color: #64748b; font-size: 13px; margin-top: 0;">${cases.length} cases &middot; ${planRate}% pass rate (${planPassed} passed, ${planFailed} failed)</p>
        `;

        if (cases.length > 0) {
            html += `
            <table>
                <tr><th style="width: 15%">ID</th><th style="width: 55%">Title</th><th style="width: 15%">Status</th><th style="width: 15%">Priority</th></tr>
            `;
            for (const tc of [...cases].sort((a, b) => (a.testCaseId || '').localeCompare(b.testCaseId || ''))) {
                let sClass = "text-notrun", sText = "Not Run";
                if (tc.status === 'passed') { sClass = "text-passed"; sText = "Passed"; }
                else if (tc.status === 'failed') { sClass = "text-failed"; sText = "Failed"; }
                else if (tc.status === 'blocked') { sClass = "text-blocked"; sText = "Blocked"; }
                else if (tc.status === 'skipped') { sClass = "text-skipped"; sText = "Skipped"; }

                const titleText = tc.title || '';
                const shortTitle = titleText.length > 70 ? titleText.substring(0, 67) + '...' : titleText;
                html += `<tr><td><code>${tc.testCaseId || ''}</code></td><td>${shortTitle}</td><td class="${sClass}">${sText}</td><td>${tc.priority || 'medium'}</td></tr>`;
            }
            html += `</table>`;
        }
    }

    // Session-grouped execution history (preferred) or legacy flat table
    if (testRunSessions && testRunSessions.length > 0) {
        const sessionSummaries = buildSessionSummaries(testRunSessions, plans);
        if (sessionSummaries.length > 0) {
            html += `<h2>Test Run Sessions</h2>`;
            for (const s of sessionSummaries) {
                const date = new Date(s.timestamp).toLocaleString();
                const rateColor = s.passRate >= 80 ? '#16a34a' : s.passRate >= 60 ? '#d97706' : '#dc2626';
                const trendSymbol = s.trend === 'up' ? '&#9650;' : s.trend === 'down' ? '&#9660;' : '&#8594;';
                const trendClass = `trend-${s.trend}`;
                const planLabel = htmlEscape(s.planNames.join(', ').substring(0, 80));
                html += `
                <div class="session-card">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div>
                            <strong style="font-size:13px;">${date}</strong>
                            <div class="session-meta" style="margin-top:2px;">${planLabel}</div>
                        </div>
                        <div style="text-align:right;">
                            <span class="${trendClass}" style="font-size:13px;">${trendSymbol}</span>
                            <span style="font-size:18px;font-weight:800;color:${rateColor};margin-left:4px;">${s.passRate}%</span>
                            <div class="session-meta">pass rate</div>
                        </div>
                    </div>
                    <div class="session-counts">
                        <span class="text-passed">&#10003; ${s.passed} Passed</span>
                        <span class="text-failed">&#10007; ${s.failed} Failed</span>
                        <span class="text-blocked">&#9632; ${s.blocked} Blocked</span>
                        <span style="color:#64748b;">${s.total} Total</span>
                    </div>
                </div>`;
            }
        }
    } else {
        const recentExecs = [...allExecs]
            .sort((a, b) => new Date(b.executedAt || 0).getTime() - new Date(a.executedAt || 0).getTime())
            .slice(0, 30);

        if (recentExecs.length > 0) {
            const testCaseLookup = new Map<string, TestCase>();
            for (const plan of plans) {
                for (const tc of plan.testCases || []) {
                    if (tc.id) testCaseLookup.set(tc.id, tc);
                }
            }

            html += `<h2>Recent Executions</h2><table><tr><th style="width: 20%">Execution</th><th style="width: 45%">Test Case</th><th style="width: 15%">Result</th><th style="width: 20%">Date</th></tr>`;
            for (const exec of recentExecs) {
                const tc = exec.testCaseId ? testCaseLookup.get(exec.testCaseId) : undefined;
                const tcLabel = tc ? `<code>${htmlEscape(tc.testCaseId || '')}</code> ${htmlEscape((tc.title || '').substring(0, 40))}...` : 'Deleted';
                const date = exec.executedAt ? exec.executedAt.substring(0, 16).replace('T', ' ') : '';

                let sClass = "text-notrun", sText = "Not Run";
                if (exec.result === 'passed') { sClass = "text-passed"; sText = "Passed"; }
                else if (exec.result === 'failed') { sClass = "text-failed"; sText = "Failed"; }
                else if (exec.result === 'blocked') { sClass = "text-blocked"; sText = "Blocked"; }

                html += `<tr><td><code>${htmlEscape(exec.executionId || exec.id || '')}</code></td><td>${tcLabel}</td><td class="${sClass}">${sText}</td><td>${date}</td></tr>`;
            }
            html += `</table>`;
        }
    }

    if (criticalityAssessment) {
        html += `
        <h2>AI Criticality Assessment</h2>
        <p style="color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 2px;"><em>AI-generated analysis based on project data, test cases, and execution results</em></p>
        <div class="ai-block">${criticalityAssessment.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        `;
    }

    html += `
        <div class="footer">QAssistant &middot; ${project.name} &middot; ${new Date().toISOString().substring(0, 10)}</div>
    </body>
    </html>
    `;

    return html;
}

/**
 * Auto-detect column mappings from CSV headers.
 * Returns a map of { csvHeader -> tcFieldName }.
 */
export function autoDetectCsvMappings(headers: string[]): Record<string, string> {
    const aliases: Record<string, string[]> = {
        Title: ['Title', 'Name', 'Summary', 'Test Name', 'Test Case Name', 'Test Case', 'Subject'],
        testCaseId: ['ID', 'Test ID', 'Test Case ID', 'TestCaseId', 'Identifier', 'Key', 'Case ID', 'Ref', 'Number'],
        preConditions: ['PreConditions', 'Pre-conditions', 'Pre Conditions', 'Preconditions', 'Setup', 'Prerequisites'],
        steps: ['TestSteps', 'Test Steps', 'Steps', 'Steps to Reproduce', 'Actions', 'Test Actions', 'Step Description'],
        testData: ['TestData', 'Test Data', 'Data', 'Input Data', 'Test Input', 'Inputs'],
        expectedResult: ['ExpectedResult', 'Expected Result', 'Expected', 'Expected Outcome', 'Expected Output', 'Pass Criteria'],
        actualResult: ['ActualResult', 'Actual Result', 'Actual', 'Actual Outcome', 'Actual Output'],
        status: ['Status', 'Result', 'Test Result', 'Execution Status', 'Outcome', 'Run Status'],
        priority: ['Priority', 'Severity', 'Importance', 'Level', 'Criticality'],
        sourceIssueId: ['SourceIssueId', 'Issue ID', 'Issue Key', 'Linked Issue', 'Related Issue', 'Jira ID', 'Linear ID'],
    };

    const map: Record<string, string> = {};
    for (const header of headers) {
        for (const [field, aliasList] of Object.entries(aliases)) {
            if (aliasList.some(a => a.toLowerCase() === header.toLowerCase())) {
                if (!map[header]) map[header] = field;
                break;
            }
        }
        if (!map[header]) map[header] = '(Ignore)';
    }
    return map;
}

/**
 * Parse a CSV string into { headers, rows[] }
 */
export function parseCsvString(content: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = splitCsvLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = splitCsvLine(lines[i]);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = j < values.length ? values[j] : '';
        }
        rows.push(row);
    }

    return { headers, rows };
}

function splitCsvLine(line: string): string[] {
    const fields: string[] = [];
    let inQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += c;
        }
    }
    fields.push(current.trim());
    return fields;
}

/**
 * Map a CSV row to a test case object given a column mapping.
 */
export function mapCsvRowToTestCase(
    row: Record<string, string>,
    columnMap: Record<string, string>
): Partial<TestCase> {
    const tc: Partial<TestCase> = {};
    for (const [csvCol, tcField] of Object.entries(columnMap)) {
        if (tcField === '(Ignore)') continue;
        const val = row[csvCol];
        if (!val) continue;
        (tc as any)[tcField] = val;
    }
    return tc;
}
