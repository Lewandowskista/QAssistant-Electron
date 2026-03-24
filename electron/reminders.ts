// @ts-expect-error — electron default import may not match type declarations
import electron from 'electron'
const { Notification, BrowserWindow } = electron as any
import { REMINDER_COOLDOWN_MS } from './constants'
import {
    getTasksForReminders,
    getRunbookStepsForReminders,
    getTestCaseStatusCountsForReminders,
    isDatabaseInitialized,
} from './database'

const notifiedIds = new Map<string, number>()
const COOLDOWN = REMINDER_COOLDOWN_MS

export function startReminderService(): () => void {
    // Check periodically
    const dueDateInterval = setInterval(() => {
        checkDueDateReminders()
    }, 60_000)

    // Daily summary at 9:00 AM
    const dailyInterval = setInterval(() => {
        const now = new Date()
        if (now.getHours() === 9 && now.getMinutes() === 0) {
            sendDailySummary()
        }
    }, 60_000)

    const initialTimeout = setTimeout(() => {
        checkDueDateReminders()
    }, 30_000)

    return () => {
        clearInterval(dueDateInterval)
        clearInterval(dailyInterval)
        clearTimeout(initialTimeout)
    }
}

function checkDueDateReminders() {
    if (!isDatabaseInitialized()) return

    try {
        const tasks = getTasksForReminders()
        const runbookSteps = getRunbookStepsForReminders()
        const now = Date.now()
        const ONE_DAY = 24 * 60 * 60 * 1000
        const THREE_DAYS = 3 * ONE_DAY

        // Check for overdue tasks
        for (const t of tasks) {
            if (!t.dueDate || ['done', 'canceled', 'duplicate'].includes(t.status)) continue
            if (t.dueDate < now) {
                const id = `overdue-${t.projectId}-${t.taskId}`
                const last = notifiedIds.get(id) || 0
                if (now - last > COOLDOWN) {
                    showNotification(
                        `Overdue Task — ${t.projectName}`,
                        `"${t.taskTitle}" was due on ${new Date(t.dueDate).toLocaleDateString()}`
                    )
                    notifiedIds.set(id, now)
                }
            } else if (t.dueDate <= now + THREE_DAYS) {
                const id = `soon-${t.projectId}-${t.taskId}`
                const last = notifiedIds.get(id) || 0
                if (now - last > COOLDOWN) {
                    const daysLeft = Math.ceil((t.dueDate - now) / ONE_DAY)
                    showNotification(
                        `Due Soon — ${t.projectName}`,
                        `"${t.taskTitle}" is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
                    )
                    notifiedIds.set(id, now)
                }
            }
        }

        // Check for overdue runbook steps
        for (const s of runbookSteps) {
            if (s.status === 'done') continue
            const id = `overdue-rb-${s.projectId}-${s.runbookId}-${s.stepId}`
            const last = notifiedIds.get(id) || 0
            if (now - last > COOLDOWN) {
                showNotification(
                    `Runbook Alert — ${s.projectName}`,
                    `Overdue step "${s.stepTitle}" in ${s.runbookName}`
                )
                notifiedIds.set(id, now)
            }
        }
    } catch (e) {
        console.error('[Reminders] Error checking due dates:', e)
    }
}

function sendDailySummary() {
    if (!isDatabaseInitialized()) return

    try {
        const tasks = getTasksForReminders()
        const statusCounts = getTestCaseStatusCountsForReminders()
        const now = Date.now()
        const ONE_DAY = 24 * 60 * 60 * 1000

        const activeTasks = tasks.filter(t => !['done', 'canceled', 'duplicate'].includes(t.status))
        const totalTasks = activeTasks.length
        const overdue = activeTasks.filter(t => t.dueDate && t.dueDate < now).length
        const dueToday = activeTasks.filter(t => t.dueDate && t.dueDate >= now && t.dueDate <= now + ONE_DAY).length
        const failedTests = statusCounts.filter(s => s.status === 'failed').reduce((acc, s) => acc + s.count, 0)

        if (totalTasks === 0 && failedTests === 0 && overdue === 0 && dueToday === 0) return

        const parts: string[] = []
        if (overdue > 0) parts.push(`❗ ${overdue} Overdue`)
        if (dueToday > 0) parts.push(`📅 ${dueToday} Due Today`)
        if (failedTests > 0) parts.push(`❌ ${failedTests} Failed Tests`)

        showNotification(
            'QAssistant Daily Briefing',
            parts.length > 0 ? parts.join(' · ') : `You have ${totalTasks} active tasks.`
        )
    } catch (e) {
        console.error('[Reminders] Daily summary error:', e)
    }
}

export function showNotification(title: string, body: string) {
    if (Notification.isSupported()) {
        const n = new Notification({ title, body, silent: false })
        n.on('click', () => {
            const wins = BrowserWindow.getAllWindows()
            if (wins.length > 0) {
                wins[0].show()
                wins[0].focus()
            }
        })
        n.show()
    }
}
