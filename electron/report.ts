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

interface Project {
    id: string;
    name: string;
    testPlans?: TestPlan[];
    testExecutions?: TestExecution[];
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
                const shortTitle = tc.title.length > 60 ? tc.title.substring(0, 57) + '...' : tc.title;
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
            const tcLabel = tc ? `\`${tc.testCaseId}\` ${tc.title.substring(0, 30)}...` : 'Deleted';
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

                const shortTitle = tc.title.length > 70 ? tc.title.substring(0, 67) + '...' : tc.title;
                html += `<tr><td><code>${tc.testCaseId || ''}</code></td><td>${shortTitle}</td><td class="${sClass}">${sText}</td><td>${tc.priority || 'medium'}</td></tr>`;
            }
            html += `</table>`;
        }
    }

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
            const tcLabel = tc ? `<code>${tc.testCaseId}</code> ${tc.title.substring(0, 40)}...` : 'Deleted';
            const date = exec.executedAt ? exec.executedAt.substring(0, 16).replace('T', ' ') : '';

            let sClass = "text-notrun", sText = "Not Run";
            if (exec.result === 'passed') { sClass = "text-passed"; sText = "Passed"; }
            else if (exec.result === 'failed') { sClass = "text-failed"; sText = "Failed"; }
            else if (exec.result === 'blocked') { sClass = "text-blocked"; sText = "Blocked"; }

            html += `<tr><td><code>${exec.executionId || exec.id || ''}</code></td><td>${tcLabel}</td><td class="${sClass}">${sText}</td><td>${date}</td></tr>`;
        }
        html += `</table>`;
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
