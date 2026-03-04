// @ts-ignore
import electron from 'electron'
const { Notification, BrowserWindow } = electron as any
import fs from 'fs'
import path from 'path'

let projectsFilePath = ''

export function startReminderService(filePath: string) {
    projectsFilePath = filePath

    // Check every minute
    setInterval(() => {
        checkDueDateReminders()
    }, 60_000)

    // Daily summary at a minute boundary (check every minute if we should send daily summary)
    setInterval(() => {
        const now = new Date()
        // Send daily summary at 9:00 AM
        if (now.getHours() === 9 && now.getMinutes() === 0) {
            sendDailySummary()
        }
    }, 60_000)

    // Initial check after 30 seconds (to give app time to fully load)
    setTimeout(() => {
        checkDueDateReminders()
    }, 30_000)
}

function readProjects(): any[] {
    try {
        if (!fs.existsSync(projectsFilePath)) return []
        return JSON.parse(fs.readFileSync(projectsFilePath, 'utf8'))
    } catch {
        return []
    }
}

function checkDueDateReminders() {
    try {
        const projects = readProjects()
        const now = Date.now()
        const ONE_DAY = 24 * 60 * 60 * 1000
        const THREE_DAYS = 3 * ONE_DAY

        for (const project of projects) {
            const tasks = project.tasks || []

            // Check for overdue tasks
            const overdue = tasks.filter((t: any) =>
                t.dueDate &&
                t.dueDate < now &&
                !['done', 'canceled', 'duplicate'].includes(t.status)
            )

            if (overdue.length > 0) {
                showNotification(
                    `Overdue Tasks — ${project.name}`,
                    `${overdue.length} task${overdue.length === 1 ? '' : 's'} overdue: ${overdue.slice(0, 2).map((t: any) => t.title).join(', ')}${overdue.length > 2 ? '...' : ''}`
                )
            }

            // Check for tasks due within 3 days
            const dueSoon = tasks.filter((t: any) =>
                t.dueDate &&
                t.dueDate >= now &&
                t.dueDate <= now + THREE_DAYS &&
                !['done', 'canceled', 'duplicate'].includes(t.status)
            )

            if (dueSoon.length > 0) {
                const nearest = dueSoon.sort((a: any, b: any) => a.dueDate - b.dueDate)[0]
                const daysLeft = Math.ceil((nearest.dueDate - now) / ONE_DAY)
                showNotification(
                    `Due Soon — ${project.name}`,
                    `"${nearest.title}" is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
                )
            }

            // Check for runbook steps that are overdue
            const runbooks = project.runbooks || []
            for (const rb of runbooks) {
                const overdueSteps = (rb.steps || []).filter((s: any) =>
                    s.dueDate && s.dueDate < now && s.status !== 'done'
                )
                if (overdueSteps.length > 0) {
                    showNotification(
                        `Runbook Alert — ${project.name}`,
                        `${overdueSteps.length} overdue step(s) in runbook: ${rb.name}`
                    )
                }
            }
        }
    } catch (e) {
        console.error('[Reminders] Error checking due dates:', e)
    }
}

function sendDailySummary() {
    try {
        const projects = readProjects()
        const now = Date.now()
        const ONE_DAY = 24 * 60 * 60 * 1000

        let totalTasks = 0
        let overdue = 0
        let dueToday = 0
        let failedTests = 0

        for (const project of projects) {
            const tasks = (project.tasks || []).filter((t: any) => !['done', 'canceled', 'duplicate'].includes(t.status))
            totalTasks += tasks.length

            overdue += tasks.filter((t: any) => t.dueDate && t.dueDate < now).length
            dueToday += tasks.filter((t: any) => t.dueDate && t.dueDate >= now && t.dueDate <= now + ONE_DAY).length

            const allCases = (project.testPlans || []).flatMap((tp: any) => tp.testCases || [])
            failedTests += allCases.filter((tc: any) => tc.status === 'failed').length
        }

        if (totalTasks === 0 && failedTests === 0) return

        const parts: string[] = []
        if (totalTasks > 0) parts.push(`${totalTasks} active task${totalTasks === 1 ? '' : 's'}`)
        if (overdue > 0) parts.push(`${overdue} overdue`)
        if (dueToday > 0) parts.push(`${dueToday} due today`)
        if (failedTests > 0) parts.push(`${failedTests} failed test${failedTests === 1 ? '' : 's'}`)

        showNotification(
            'QAssistant Daily Summary',
            parts.join(' · ')
        )
    } catch (e) {
        console.error('[Reminders] Daily summary error:', e)
    }
}

export function showNotification(title: string, body: string) {
    if (Notification.isSupported()) {
        const n = new Notification({ title, body, silent: false })

        // Click to show main window
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
