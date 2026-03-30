import type Electron from 'electron'

export function registerSyncHandlers(ipcMain: Electron.IpcMain, deps: {
    getSyncConfig: () => Promise<any>
    getSyncStatus: () => any
    initSync: () => Promise<any>
    createWorkspace: (name: string, displayName?: string) => Promise<any>
    joinWorkspace: (inviteCode: string, displayName?: string) => Promise<any>
    disconnectWorkspace: () => Promise<void>
    getWorkspaceInfo: () => Promise<any>
    getWorkspaceInvite: () => Promise<any>
    rotateWorkspaceInvite: () => Promise<any>
    triggerManualSync: () => Promise<any>
    pushTaskCollab: (projectId: string, taskId: string, collabState: string, activeHandoffId: string | null, updatedAt: number) => void
    pushHandoff: (projectId: string, handoff: any) => void
    pushCollabEvent: (projectId: string, event: any) => void
    pushArtifactLink: (projectId: string, link: any) => void
    getTaskById: (taskId: string) => any
    getHandoffById: (handoffId: string) => any
    getCollaborationEventById: (eventId: string) => any
    getArtifactLinkById: (linkId: string) => any
    scheduleCloudStateUpload: () => void
    assertString: (v: unknown, name: string, maxLen?: number) => void
    assertOptionalString: (v: unknown, name: string, maxLen?: number) => void
    assertNumber: (v: unknown, name: string, min?: number) => void
    assertObject: (v: unknown, name: string) => void
    assertSyncTaskCollabArgs: (args: unknown) => void
    assertSyncHandoffArgs: (args: unknown) => void
    assertSyncCollabEventArgs: (args: unknown) => void
    assertSyncArtifactLinkArgs: (args: unknown) => void
}): void {
    // ── Cloud Sync (Phase 2) ──────────────────────────────────────────────
    ipcMain.handle('sync-get-config', async () => {
        try { return await deps.getSyncConfig(); }
        catch (e: any) { return { configured: false, error: e.message }; }
    });
    ipcMain.handle('sync-get-status', () => deps.getSyncStatus());
    ipcMain.handle('sync-init', async () => {
        try { return await deps.initSync(); }
        catch (e: any) { return { ok: false, status: 'error', error: e.message }; }
    });
    ipcMain.handle('sync-create-workspace', async (_e: any, { workspaceName, displayName }: any) => {
        try {
            deps.assertString(workspaceName, 'workspaceName', 200);
            if (displayName !== undefined && displayName !== null) deps.assertString(displayName, 'displayName', 100);
            const result = await deps.createWorkspace(workspaceName, displayName);
            if (result?.ok) deps.scheduleCloudStateUpload();
            return result;
        } catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-join-workspace', async (_e: any, { inviteCode, displayName }: any) => {
        try {
            deps.assertString(inviteCode, 'inviteCode', 64);
            if (displayName !== undefined && displayName !== null) deps.assertString(displayName, 'displayName', 100);
            const result = await deps.joinWorkspace(inviteCode, displayName);
            if (result?.ok) deps.scheduleCloudStateUpload();
            return result;
        } catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-disconnect', async () => {
        try {
            await deps.disconnectWorkspace();
            deps.scheduleCloudStateUpload();
            return { ok: true };
        }
        catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-get-workspace-info', async () => {
        try { return await deps.getWorkspaceInfo(); }
        catch (e: any) { return { workspaceId: null, error: e.message }; }
    });
    ipcMain.handle('sync-get-workspace-invite', async () => {
        try { return await deps.getWorkspaceInvite(); }
        catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-rotate-workspace-invite', async () => {
        try { return await deps.rotateWorkspaceInvite(); }
        catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-manual', async () => {
        try { return await deps.triggerManualSync(); }
        catch (e: any) { return { ok: false, error: e.message }; }
    });

    // Granular sync push handlers — called by the renderer after collaborative mutations
    ipcMain.handle('sync-push-task-collab', (_e: any, args: any) => {
        try {
            deps.assertSyncTaskCollabArgs(args);
            const { projectId, taskId, collabState, activeHandoffId, updatedAt } = args;
            deps.pushTaskCollab(projectId, taskId, collabState, activeHandoffId ?? null, updatedAt ?? Date.now());
            return { ok: true };
        } catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-push-handoff', (_e: any, args: any) => {
        try {
            deps.assertSyncHandoffArgs(args);
            const { projectId, handoff } = args;
            deps.pushHandoff(projectId, handoff);
            return { ok: true };
        } catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-push-collab-event', (_e: any, args: any) => {
        try {
            deps.assertSyncCollabEventArgs(args);
            const { projectId, event } = args;
            deps.pushCollabEvent(projectId, event);
            return { ok: true };
        } catch (e: any) { return { ok: false, error: e.message }; }
    });
    ipcMain.handle('sync-push-artifact-link', (_e: any, args: any) => {
        try {
            deps.assertSyncArtifactLinkArgs(args);
            const { projectId, link } = args;
            deps.pushArtifactLink(projectId, link);
            return { ok: true };
        } catch (e: any) { return { ok: false, error: e.message }; }
    });

    // Granular DB queries for post-sync targeted refresh (Improvement 5)
    ipcMain.handle('get-task-by-id', (_e: any, taskId: string) => {
        try {
            deps.assertString(taskId, 'taskId', 200);
            return deps.getTaskById(taskId);
        } catch { return null; }
    });
    ipcMain.handle('get-handoff-by-id', (_e: any, handoffId: string) => {
        try {
            deps.assertString(handoffId, 'handoffId', 200);
            return deps.getHandoffById(handoffId);
        } catch { return null; }
    });
    ipcMain.handle('get-collaboration-event-by-id', (_e: any, eventId: string) => {
        try {
            deps.assertString(eventId, 'eventId', 200);
            return deps.getCollaborationEventById(eventId);
        } catch { return null; }
    });
    ipcMain.handle('get-artifact-link-by-id', (_e: any, linkId: string) => {
        try {
            deps.assertString(linkId, 'linkId', 200);
            return deps.getArtifactLinkById(linkId);
        } catch { return null; }
    });
}
