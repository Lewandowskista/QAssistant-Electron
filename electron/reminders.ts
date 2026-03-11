// @ts-ignore
import electron from 'electron'
const { Notification, BrowserWindow } = electron as any
import fs from 'fs'
import { REMINDER_COOLDOWN_MS } from './constants'

const notifiedIds = new Map<string, number>()
const COOLDOWN = REMINDER_COOLDOWN_MS
let projectsFilePath = ''

export function startReminderService(filePath: string): () => void {
    projectsFilePath = filePath

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

function readProjects(): any[] {
    try {
        if (!fs.existsSync(projectsFilePath)) return []
        return JSON.parse(fs.readFileSync(projectsFilePath, 'utf8'))
    } catch (e) {
        console.warn('[Reminders] Failed to read projects file:', e)
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

            for (const t of overdue) {
                const id = `overdue-${project.id}-${t.id}`
                const last = notifiedIds.get(id) || 0
                if (now - last > COOLDOWN) {
                    showNotification(
                        `Overdue Task — ${project.name}`,
                        `"${t.title}" was due on ${new Date(t.dueDate).toLocaleDateString()}`
                    )
                    notifiedIds.set(id, now)
                }
            }

            // Check for tasks due soon
            const dueSoon = tasks.filter((t: any) =>
                t.dueDate &&
                t.dueDate >= now &&
                t.dueDate <= now + THREE_DAYS &&
                !['done', 'canceled', 'duplicate'].includes(t.status)
            )

            for (const t of dueSoon) {
                const id = `soon-${project.id}-${t.id}`
                const last = notifiedIds.get(id) || 0
                if (now - last > COOLDOWN) {
                    const daysLeft = Math.ceil((t.dueDate - now) / ONE_DAY)
                    showNotification(
                        `Due Soon — ${project.name}`,
                        `"${t.title}" is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
                    )
                    notifiedIds.set(id, now)
                }
            }

            const runbooks = project.runbooks || []
            for (const rb of runbooks) {
                const overdueSteps = (rb.steps || []).filter((s: any) =>
                    s.dueDate && s.dueDate < now && s.status !== 'done'
                )
                for (const s of overdueSteps) {
                    const id = `overdue-rb-${project.id}-${rb.id}-${s.id}`
                    const last = notifiedIds.get(id) || 0
                    if (now - last > COOLDOWN) {
                        showNotification(
                            `Runbook Alert — ${project.name}`,
                            `Overdue step "${s.text}" in ${rb.name}`
                        )
                        notifiedIds.set(id, now)
                    }
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
