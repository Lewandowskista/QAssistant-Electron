import electron from "electron";
import fs from "fs";
const { Notification, BrowserWindow } = electron;
let projectsFilePath = "";
function startReminderService(filePath) {
  projectsFilePath = filePath;
  setInterval(() => {
    checkDueDateReminders();
  }, 6e4);
  setInterval(() => {
    const now = /* @__PURE__ */ new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      sendDailySummary();
    }
  }, 6e4);
  setTimeout(() => {
    checkDueDateReminders();
  }, 3e4);
}
function readProjects() {
  try {
    if (!fs.existsSync(projectsFilePath)) return [];
    return JSON.parse(fs.readFileSync(projectsFilePath, "utf8"));
  } catch {
    return [];
  }
}
function checkDueDateReminders() {
  try {
    const projects = readProjects();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1e3;
    const THREE_DAYS = 3 * ONE_DAY;
    for (const project of projects) {
      const tasks = project.tasks || [];
      const overdue = tasks.filter(
        (t) => t.dueDate && t.dueDate < now && !["done", "canceled", "duplicate"].includes(t.status)
      );
      if (overdue.length > 0) {
        showNotification(
          `Overdue Tasks — ${project.name}`,
          `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue: ${overdue.slice(0, 2).map((t) => t.title).join(", ")}${overdue.length > 2 ? "..." : ""}`
        );
      }
      const dueSoon = tasks.filter(
        (t) => t.dueDate && t.dueDate >= now && t.dueDate <= now + THREE_DAYS && !["done", "canceled", "duplicate"].includes(t.status)
      );
      if (dueSoon.length > 0) {
        const nearest = dueSoon.sort((a, b) => a.dueDate - b.dueDate)[0];
        const daysLeft = Math.ceil((nearest.dueDate - now) / ONE_DAY);
        showNotification(
          `Due Soon — ${project.name}`,
          `"${nearest.title}" is due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
        );
      }
      const runbooks = project.runbooks || [];
      for (const rb of runbooks) {
        const overdueSteps = (rb.steps || []).filter(
          (s) => s.dueDate && s.dueDate < now && s.status !== "done"
        );
        if (overdueSteps.length > 0) {
          showNotification(
            `Runbook Alert — ${project.name}`,
            `${overdueSteps.length} overdue step(s) in runbook: ${rb.name}`
          );
        }
      }
    }
  } catch (e) {
    console.error("[Reminders] Error checking due dates:", e);
  }
}
function sendDailySummary() {
  try {
    const projects = readProjects();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1e3;
    let totalTasks = 0;
    let overdue = 0;
    let dueToday = 0;
    let failedTests = 0;
    for (const project of projects) {
      const tasks = (project.tasks || []).filter((t) => !["done", "canceled", "duplicate"].includes(t.status));
      totalTasks += tasks.length;
      overdue += tasks.filter((t) => t.dueDate && t.dueDate < now).length;
      dueToday += tasks.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate <= now + ONE_DAY).length;
      const allCases = (project.testPlans || []).flatMap((tp) => tp.testCases || []);
      failedTests += allCases.filter((tc) => tc.status === "failed").length;
    }
    if (totalTasks === 0 && failedTests === 0) return;
    const parts = [];
    if (totalTasks > 0) parts.push(`${totalTasks} active task${totalTasks === 1 ? "" : "s"}`);
    if (overdue > 0) parts.push(`${overdue} overdue`);
    if (dueToday > 0) parts.push(`${dueToday} due today`);
    if (failedTests > 0) parts.push(`${failedTests} failed test${failedTests === 1 ? "" : "s"}`);
    showNotification(
      "QAssistant Daily Summary",
      parts.join(" · ")
    );
  } catch (e) {
    console.error("[Reminders] Daily summary error:", e);
  }
}
function showNotification(title, body) {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.on("click", () => {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        wins[0].show();
        wins[0].focus();
      }
    });
    n.show();
  }
}
export {
  showNotification,
  startReminderService
};
