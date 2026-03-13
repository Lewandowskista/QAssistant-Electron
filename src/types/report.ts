/**
 * Report Template System Types
 * Enables QA leads to compose custom reports by selecting, reordering, and configuring sections.
 */

export type ReportSectionType =
  | 'overview_stats'
  | 'status_breakdown'
  | 'health_score'
  | 'impact_assessment'
  | 'test_plan_details'
  | 'execution_history'
  | 'session_summary'
  | 'flaky_tests'
  | 'coverage_matrix'
  | 'quality_gates'
  | 'defect_density'
  | 'pass_rate_trend'
  | 'burndown_chart'
  | 'ai_criticality'
  | 'task_summary'
  | 'per_tester_breakdown'
  | 'custom_kpi'

export type ReportSection = {
  id: string
  type: ReportSectionType
  label: string
  enabled: boolean
  order: number
  config: Record<string, any> // section-specific options (e.g., chart date range, filter by plan)
}

export type ReportTemplate = {
  id: string
  name: string
  description: string
  sections: ReportSection[]
  filters: {
    planIds?: string[]
    dateRange?: { from: number; to: number }
    sprintName?: string
    environment?: string
  }
  format: 'pdf' | 'markdown' | 'csv' | 'html'
  createdAt: number
  updatedAt: number
}

export type ReportSchedule = {
  id: string
  templateId: string
  projectId: string
  frequency: 'daily' | 'weekly' | 'sprint_end' | 'manual'
  dayOfWeek?: number // 0-6 for weekly
  timeOfDay: string // "09:00"
  isEnabled: boolean
  lastRunAt?: number
  nextRunAt?: number
  deliveryMethod: 'file' | 'webhook'
  deliveryConfig: Record<string, string> // e.g., { webhookUrl, filePath, emailTo }
}

export type ReportSnapshot = {
  id: string
  templateId: string
  templateName: string
  projectId: string
  generatedAt: number
  format: 'pdf' | 'markdown' | 'html'
  filePath: string // path to stored report file
  fileSizeBytes: number
  metrics: {
    // snapshot of key metrics for comparison
    totalCases: number
    passRate: number
    failedCount: number
    healthScore: number
    blockerCount: number
  }
}

export type CustomKpi = {
  id: string
  name: string
  formula:
    | 'pass_rate'
    | 'defect_escape_rate'
    | 'test_execution_rate'
    | 'mean_time_to_detect'
    | 'coverage_ratio'
    | 'custom_formula'
  customFormula?: string // e.g., "passed / (passed + failed + blocked)"
  target: number
  unit: '%' | 'hours' | 'count' | 'ratio'
  trendDirection: 'higher_is_better' | 'lower_is_better'
}
