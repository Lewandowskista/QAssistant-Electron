/**
 * Report Builder — Composable report section rendering
 * Refactors report.ts generation functions into reusable section renderers
 * Allows QA leads to create custom reports by selecting and ordering sections
 */

import { computeHealthScore, buildImpactAssessment, buildSessionSummaries } from './report'
import type { ReportTemplate, ReportSection } from '../src/types/report'

interface Project {
  id: string
  name: string
  testPlans?: any[]
  testExecutions?: any[]
  testRunSessions?: any[]
  tasks?: any[]
}

/**
 * Render a single report section given its type and configuration
 */
function renderSection(
  section: ReportSection,
  _project: Project,
  context: {
    plans: any[]
    allCases: any[]
    allExecs: any[]
    tasks: any[]
    sessions: any[]
  }
): string {
  if (!section.enabled) return ''

  const config = section.config || {}

  switch (section.type) {
    case 'overview_stats':
      return renderOverviewStats(context, config)
    case 'status_breakdown':
      return renderStatusBreakdown(context, config)
    case 'health_score':
      return renderHealthScore(context, config)
    case 'impact_assessment':
      return renderImpactAssessment(context, config)
    case 'test_plan_details':
      return renderTestPlanDetails(context, config)
    case 'execution_history':
      return renderExecutionHistory(context, config)
    case 'session_summary':
      return renderSessionSummary(context, config)
    case 'task_summary':
      return renderTaskSummary(context, config)
    default:
      return ''
  }
}

function renderOverviewStats(context: any, _config: any): string {
  const { plans, allCases, allExecs } = context
  const passed = allCases.filter((c: any) => c.status === 'passed').length
  const total = allCases.length
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0'

  return `
    <h2>Overview</h2>
    <div>
        <div class="metric-box"><div class="metric-value">${plans.length}</div><div class="metric-label">Test Plans</div></div>
        <div class="metric-box"><div class="metric-value">${total}</div><div class="metric-label">Test Cases</div></div>
        <div class="metric-box"><div class="metric-value">${allExecs.length}</div><div class="metric-label">Executions</div></div>
        <div class="metric-box"><div class="metric-value" style="color: ${Number(passRate) >= 80 ? '#10b981' : Number(passRate) >= 60 ? '#f59e0b' : '#ef4444'}">${passRate}%</div><div class="metric-label">Pass Rate</div></div>
    </div>
  `
}

function renderStatusBreakdown(context: any, _config: any): string {
  const { allCases } = context
  const passed = allCases.filter((c: any) => c.status === 'passed').length
  const failed = allCases.filter((c: any) => c.status === 'failed').length
  const blocked = allCases.filter((c: any) => c.status === 'blocked').length
  const skipped = allCases.filter((c: any) => c.status === 'skipped').length
  const notRun = allCases.filter((c: any) => !c.status || c.status === 'not-run').length
  const total = allCases.length

  return `
    <h2>Status Breakdown</h2>
    <table>
        <tr><th>Status</th><th>Count</th><th>Percentage</th></tr>
        <tr><td><span class="status-icon bg-passed"></span> Passed</td><td>${passed}</td><td>${total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0'}%</td></tr>
        <tr><td><span class="status-icon bg-failed"></span> Failed</td><td>${failed}</td><td>${total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0'}%</td></tr>
        <tr><td><span class="status-icon bg-blocked"></span> Blocked</td><td>${blocked}</td><td>${total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0'}%</td></tr>
        <tr><td><span class="status-icon bg-skipped"></span> Skipped</td><td>${skipped}</td><td>${total > 0 ? ((skipped / total) * 100).toFixed(1) : '0.0'}%</td></tr>
        <tr><td><span class="status-icon bg-notrun"></span> Not Run</td><td>${notRun}</td><td>${total > 0 ? ((notRun / total) * 100).toFixed(1) : '0.0'}%</td></tr>
    </table>
  `
}

function renderHealthScore(context: any, _config: any): string {
  const { tasks } = context
  if (!tasks || tasks.length === 0) return ''

  const health = computeHealthScore(tasks)
  if (!health) return ''

  return `
    <h2>Project Health Status</h2>
    <div class="health-banner" style="background:${health.bg}; border: 2px solid ${health.border};">
        <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:6px;">Overall Health</div>
            <div class="health-label" style="color:${health.color};">${health.label}</div>
            <div class="health-detail">${health.openCount} open issue${health.openCount !== 1 ? 's' : ''} &nbsp;&middot;&nbsp; ${health.criticalCount} critical &nbsp;&middot;&nbsp; ${health.highCount} high priority</div>
        </div>
        <div>
            <div class="health-score-num" style="color:${health.color};">${health.score}</div>
            <div class="health-score-caption">HEALTH SCORE</div>
        </div>
    </div>
  `
}

function renderImpactAssessment(context: any, _config: any): string {
  const { plans, tasks } = context
  if (!tasks || tasks.length === 0) return ''

  const impact = buildImpactAssessment(plans, tasks)
  if (!impact) return ''

  let html = '<h2>Impact Assessment</h2>'

  const uncoveredAll = [...(impact.uncoveredCritical || []), ...(impact.uncoveredHigh || [])]
  if (uncoveredAll.length > 0) {
    html += `<table><tr><th>Issue ID</th><th>Title</th><th>Priority</th><th>Coverage</th></tr>`
    for (const t of uncoveredAll) {
      html += `<tr><td>${t.sourceIssueId || t.externalId || t.id}</td><td>${t.title}</td><td>${t.priority}</td><td>No Tests</td></tr>`
    }
    html += '</table>'
  }

  return html
}

function renderTestPlanDetails(context: any, _config: any): string {
  const { plans } = context
  if (!plans || plans.length === 0) return ''

  let html = '<h2>Test Plans</h2>'
  for (const plan of plans) {
    const cases = plan.testCases || []
    const planPassed = cases.filter((c: any) => c.status === 'passed').length
    const planFailed = cases.filter((c: any) => c.status === 'failed').length
    const planRate = cases.length > 0 ? ((planPassed / cases.length) * 100).toFixed(0) : '0'

    html += `<h3>${plan.name}</h3><p>${cases.length} cases · ${planRate}% pass rate (${planPassed} passed, ${planFailed} failed)</p>`
    if (cases.length > 0) {
      html += '<table><tr><th>ID</th><th>Title</th><th>Status</th><th>Priority</th></tr>'
      for (const tc of cases) {
        html += `<tr><td>${tc.testCaseId || ''}</td><td>${tc.title}</td><td>${tc.status || 'not-run'}</td><td>${tc.priority || 'medium'}</td></tr>`
      }
      html += '</table>'
    }
  }

  return html
}

function renderExecutionHistory(context: any, _config: any): string {
  const { allExecs } = context
  if (!allExecs || allExecs.length === 0) return ''

  const recentExecs = [...allExecs].slice(0, 30)
  let html = '<h2>Recent Executions</h2><table><tr><th>Execution</th><th>Test Case</th><th>Result</th><th>Date</th></tr>'
  for (const exec of recentExecs) {
    html += `<tr><td>${exec.id || ''}</td><td>${exec.snapshotTestCaseTitle || 'N/A'}</td><td>${exec.result || ''}</td><td>${exec.executedAt || ''}</td></tr>`
  }
  html += '</table>'

  return html
}

function renderSessionSummary(context: any, _config: any): string {
  const { sessions, plans } = context
  if (!sessions || sessions.length === 0) return ''

  const summaries = buildSessionSummaries(sessions, plans)
  if (!summaries || summaries.length === 0) return ''

  let html = '<h2>Test Run Sessions</h2>'
  for (const s of summaries) {
    const date = new Date(s.timestamp).toLocaleString()
    const rateColor = s.passRate >= 80 ? '#16a34a' : s.passRate >= 60 ? '#d97706' : '#dc2626'
    html += `
        <div class="session-card">
            <div style="display:flex;justify-content:space-between;">
                <div><strong>${date}</strong></div>
                <div style="text-align:right;"><span style="font-size:18px;font-weight:800;color:${rateColor};">${s.passRate}%</span></div>
            </div>
        </div>
    `
  }

  return html
}

function renderTaskSummary(context: any, _config: any): string {
  const { tasks } = context
  if (!tasks || tasks.length === 0) return ''

  const openTasks = tasks.filter((t: any) => t.status !== 'done' && t.status !== 'cancelled' && t.status !== 'completed')
  if (openTasks.length === 0) return ''

  let html = '<h2>Open Tasks</h2><table><tr><th>Title</th><th>Priority</th><th>Status</th></tr>'
  for (const t of openTasks.slice(0, 20)) {
    html += `<tr><td>${t.title}</td><td>${t.priority}</td><td>${t.status}</td></tr>`
  }
  html += '</table>'

  return html
}

/**
 * Generate a custom report by composing sections from a template
 */
export function generateCustomReport(
  project: Project,
  template: ReportTemplate
): string {
  // Build context once for efficiency
  const plans = template.filters?.planIds
    ? (project.testPlans || []).filter(p => template.filters!.planIds!.includes(p.id))
    : (project.testPlans || [])

  const allCases = plans.flatMap(p => p.testCases || [])
  const allExecs = project.testExecutions || []
  const tasks = project.tasks || []
  const sessions = project.testRunSessions || []

  const context = { plans, allCases, allExecs, tasks, sessions }

  // Sort sections by order and render enabled ones
  const sortedSections = [...template.sections].sort((a, b) => a.order - b.order)

  const now = new Date().toLocaleString()
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
            .metric-box { display: inline-block; padding: 15px 25px; margin: 0 15px 15px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; min-width: 120px; }
            .metric-value { font-size: 24px; font-weight: 700; color: #0f0f13; }
            .metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-top: 4px; }
            .status-icon { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; }
            .bg-passed { background-color: #10b981; }
            .bg-failed { background-color: #ef4444; }
            .bg-blocked { background-color: #f59e0b; }
            .bg-skipped { background-color: #64748b; }
            .bg-notrun { background-color: #cbd5e1; }
            .health-banner { page-break-inside: avoid; border-radius: 12px; padding: 20px 24px; margin: 16px 0 20px 0; display: flex; align-items: center; justify-content: space-between; }
            .health-label { font-size: 26px; font-weight: 900; }
            .health-detail { font-size: 13px; color: #475569; margin-top: 4px; }
            .health-score-num { font-size: 52px; font-weight: 900; line-height: 1; opacity: 0.18; text-align: right; }
            .health-score-caption { font-size: 10px; color: #94a3b8; text-align: right; letter-spacing: 0.08em; }
            .session-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 8px 0; page-break-inside: avoid; background: #fafafa; }
            .footer { margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        </style>
    </head>
    <body>
        <h1>${template.name}</h1>
        <div style="color: #64748b; font-size: 14px; margin-bottom: 30px;">
            <strong>Project:</strong> ${project.name} <br/>
            <strong>Generated:</strong> ${now}
        </div>
  `

  // Render enabled sections in order
  for (const section of sortedSections) {
    html += renderSection(section, project, context)
  }

  html += `
        <div class="footer">QAssistant · ${project.name} · ${new Date().toISOString().substring(0, 10)}</div>
    </body>
    </html>
  `

  return html
}
