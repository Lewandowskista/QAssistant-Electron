import type Electron from 'electron'

export function registerProjectHandlers(ipcMain: Electron.IpcMain, deps: {
    getAllProjects: () => any
    saveAllProjects: (data: any) => void
    upsertProjectNote: (projectId: string, note: any) => void
    deleteProjectNote: (projectId: string, noteId: string) => void
    upsertProjectTask: (projectId: string, task: any) => void
    deleteProjectTask: (projectId: string, taskId: string) => void
    upsertProjectHandoff: (projectId: string, handoff: any) => void
    insertProjectCollaborationEvent: (projectId: string, event: any) => void
    upsertProjectTestPlan: (projectId: string, plan: any) => void
    deleteProjectTestPlan: (projectId: string, planId: string) => void
    upsertProjectEnvironment: (projectId: string, env: any) => void
    deleteProjectEnvironment: (projectId: string, envId: string) => void
    upsertProjectChecklist: (projectId: string, checklist: any) => void
    deleteProjectChecklist: (projectId: string, checklistId: string) => void
    upsertProjectTestRunSession: (projectId: string, session: any) => void
    deleteProjectTestRunSession: (projectId: string, sessionId: string) => void
    startTimer: () => number
    incrementCounter: (name: string) => void
    measureMainMetric: (name: string, startedAt: number) => void
    assertArray: (v: unknown, name: string, maxLen?: number) => void
    assertString: (v: unknown, name: string, maxLen?: number) => void
    assertObject: (v: unknown, name: string) => void
    APP_DATA_DIR: string
}): void {
    ipcMain.handle('get-app-data-path', () => deps.APP_DATA_DIR);
    ipcMain.handle('read-projects-file', () => {
        try {
            return deps.getAllProjects();
        } catch (e) {
            console.error('Error reading projects from SQLite:', e);
            return [];
        }
    });
    ipcMain.handle('write-projects-file', (_e: any, data: any) => {
        const startedAt = deps.startTimer();
        try {
            deps.assertArray(data, 'projects');
            deps.incrementCounter('fullProjectWrites');
            deps.saveAllProjects(data);
            deps.measureMainMetric('lastFullProjectWriteMs', startedAt);
            return true;
        } catch (e) {
            deps.measureMainMetric('lastFullProjectWriteMs', startedAt);
            console.error('Error writing projects to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-note', (_e: any, { projectId, note }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(note, 'note');
            deps.upsertProjectNote(projectId, note);
            deps.incrementCounter('granularNoteWrites');
            return true;
        } catch (e) {
            console.error('Error writing note to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('delete-project-note', (_e: any, { projectId, noteId }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertString(noteId, 'noteId', 200);
            deps.deleteProjectNote(projectId, noteId);
            deps.incrementCounter('granularNoteDeletes');
            return true;
        } catch (e) {
            console.error('Error deleting note from SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-task', (_e: any, { projectId, task }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(task, 'task');
            deps.upsertProjectTask(projectId, task);
            deps.incrementCounter('granularTaskWrites');
            return true;
        } catch (e) {
            console.error('Error writing task to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('delete-project-task', (_e: any, { projectId, taskId }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertString(taskId, 'taskId', 200);
            deps.deleteProjectTask(projectId, taskId);
            deps.incrementCounter('granularTaskDeletes');
            return true;
        } catch (e) {
            console.error('Error deleting task from SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-handoff', (_e: any, { projectId, handoff }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(handoff, 'handoff');
            deps.upsertProjectHandoff(projectId, handoff);
            deps.incrementCounter('granularHandoffWrites');
            return true;
        } catch (e) {
            console.error('Error writing handoff to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('insert-project-collaboration-event', (_e: any, { projectId, event }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(event, 'event');
            deps.insertProjectCollaborationEvent(projectId, event);
            deps.incrementCounter('granularCollaborationEventWrites');
            return true;
        } catch (e) {
            console.error('Error writing collaboration event to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-test-plan', (_e: any, { projectId, plan }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(plan, 'plan');
            deps.upsertProjectTestPlan(projectId, plan);
            deps.incrementCounter('granularTestPlanWrites');
            return true;
        } catch (e) {
            console.error('Error writing test plan to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('delete-project-test-plan', (_e: any, { projectId, planId }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertString(planId, 'planId', 200);
            deps.deleteProjectTestPlan(projectId, planId);
            deps.incrementCounter('granularTestPlanDeletes');
            return true;
        } catch (e) {
            console.error('Error deleting test plan from SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-environment', (_e: any, { projectId, env }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(env, 'env');
            deps.upsertProjectEnvironment(projectId, env);
            deps.incrementCounter('granularEnvironmentWrites');
            return true;
        } catch (e) {
            console.error('Error writing environment to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('delete-project-environment', (_e: any, { projectId, envId }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertString(envId, 'envId', 200);
            deps.deleteProjectEnvironment(projectId, envId);
            deps.incrementCounter('granularEnvironmentDeletes');
            return true;
        } catch (e) {
            console.error('Error deleting environment from SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-checklist', (_e: any, { projectId, checklist }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(checklist, 'checklist');
            deps.upsertProjectChecklist(projectId, checklist);
            deps.incrementCounter('granularChecklistWrites');
            return true;
        } catch (e) {
            console.error('Error writing checklist to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('delete-project-checklist', (_e: any, { projectId, checklistId }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertString(checklistId, 'checklistId', 200);
            deps.deleteProjectChecklist(projectId, checklistId);
            deps.incrementCounter('granularChecklistDeletes');
            return true;
        } catch (e) {
            console.error('Error deleting checklist from SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('upsert-project-test-run-session', (_e: any, { projectId, session }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertObject(session, 'session');
            deps.upsertProjectTestRunSession(projectId, session);
            deps.incrementCounter('granularTestRunSessionWrites');
            return true;
        } catch (e) {
            console.error('Error writing test run session to SQLite:', e);
            return false;
        }
    });
    ipcMain.handle('delete-project-test-run-session', (_e: any, { projectId, sessionId }: any) => {
        try {
            deps.assertString(projectId, 'projectId', 200);
            deps.assertString(sessionId, 'sessionId', 200);
            deps.deleteProjectTestRunSession(projectId, sessionId);
            deps.incrementCounter('granularTestRunSessionDeletes');
            return true;
        } catch (e) {
            console.error('Error deleting test run session from SQLite:', e);
            return false;
        }
    });
}
