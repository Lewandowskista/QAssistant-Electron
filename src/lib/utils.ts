import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { TestCaseStatus, TestRunSession } from "@/types/project"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Analyze execution history to detect flaky tests
 * A test is flaky if results alternate between pass/fail within recent executions
 */
export function isFlakyTest(executionStatuses: TestCaseStatus[], windowSize: number = 5): boolean {
  if (executionStatuses.length < 2) return false

  // Look at last N executions
  const recent = executionStatuses.slice(-windowSize)

  // Count state changes (pass->fail or fail->pass)
  let stateChanges = 0
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]
    const curr = recent[i]
    const prevIsPassing = prev === 'passed'
    const currIsPassing = curr === 'passed'

    if (prevIsPassing !== currIsPassing) {
      stateChanges++
    }
  }

  // Flaky if at least 2 state changes (indicates alternating pattern)
  return stateChanges >= 2
}

/**
 * Calculate retest count for a test case
 * Returns the number of executions minus 1 (how many retests occurred)
 */
export function calculateRetestCount(executionStatuses: TestCaseStatus[]): number {
  return Math.max(0, executionStatuses.length - 1)
}

/**
 * Get flakiness score (0-100)
 * Based on how many times the result changed in recent executions
 */
export function getFlakinessScore(executionStatuses: TestCaseStatus[], windowSize: number = 10): number {
  if (executionStatuses.length < 2) return 0

  const recent = executionStatuses.slice(-windowSize)
  let stateChanges = 0

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]
    const curr = recent[i]
    const prevIsPassing = prev === 'passed'
    const currIsPassing = curr === 'passed'

    if (prevIsPassing !== currIsPassing) {
      stateChanges++
    }
  }

  // Score: (state changes / max possible changes) * 100
  const maxChanges = recent.length - 1
  return Math.round((stateChanges / maxChanges) * 100)
}

export type TestCaseFlakinessStats = {
  testCaseId: string
  executionCount: number
  flakinessScore: number
  isFlaky: boolean
  lastFiveResults: TestCaseStatus[]
  passRate: number
}

export function computeFlakinessStatsForProject(
  sessions: TestRunSession[],
  windowSize = 10
): Map<string, TestCaseFlakinessStats> {
  const resultsByCase = new Map<string, TestCaseStatus[]>()
  const sortedSessions = [...sessions].sort((a, b) => a.timestamp - b.timestamp)

  for (const session of sortedSessions) {
    for (const pe of session.planExecutions) {
      for (const ce of pe.caseExecutions) {
        if (!resultsByCase.has(ce.testCaseId)) resultsByCase.set(ce.testCaseId, [])
        resultsByCase.get(ce.testCaseId)!.push(ce.result)
      }
    }
  }

  const statsMap = new Map<string, TestCaseFlakinessStats>()
  for (const [testCaseId, results] of resultsByCase) {
    const passed = results.filter(r => r === 'passed').length
    statsMap.set(testCaseId, {
      testCaseId,
      executionCount: results.length,
      flakinessScore: getFlakinessScore(results, windowSize),
      isFlaky: isFlakyTest(results, Math.min(windowSize, results.length)),
      lastFiveResults: results.slice(-5),
      passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
    })
  }
  return statsMap
}

/**
 * Evaluate quality gate criteria against current metrics
 */
export function evaluateQualityGate(
  criterion: any,
  actualValue: number
): boolean {
  switch (criterion.operator) {
    case 'gte':
      return actualValue >= criterion.value
    case 'lte':
      return actualValue <= criterion.value
    case 'eq':
      return actualValue === criterion.value
    default:
      return false
  }
}

/**
 * Get quality gate status (GO/CAUTION/NO-GO)
 */
export function getQualityGateStatus(passedCount: number, totalCount: number): 'go' | 'caution' | 'no-go' {
  if (totalCount === 0) return 'go'
  const passedPercent = (passedCount / totalCount) * 100
  if (passedPercent === 100) return 'go'
  if (passedPercent >= 75) return 'caution'
  return 'no-go'
}

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${remSecs}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}
