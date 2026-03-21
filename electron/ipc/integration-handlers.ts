import type Electron from 'electron'

export function registerIntegrationHandlers(ipcMain: Electron.IpcMain, deps: {
    integrations: any
    health: any
    oauth: any
    github: any
    SapHacService: any
    MAX_SAP_HAC_INSTANCES: number
    isServerRunning: () => boolean
    startServer: (apiKey: string, port: number) => void
    crypto: typeof import('node:crypto')
    SETTINGS_FILE: string
    fsp: typeof import('node:fs/promises')
    fs: typeof import('node:fs')
    shell: any
    assertString: (v: unknown, name: string, maxLen?: number) => void
    errMsg: (err: unknown) => string
    assertAutomationArgs: (args: unknown) => void
    getServerPort: () => number | null
    stopServer: () => void
}): void {
    ipcMain.handle('automation-api-start', async (_e: any, args: any) => {
        deps.assertAutomationArgs(args);
        deps.startServer(args.apiKey, args.port);
        return { running: deps.isServerRunning(), port: deps.getServerPort() };
    });
    ipcMain.handle('automation-api-stop', () => deps.stopServer());
    ipcMain.handle('automation-api-restart', async (_e: any, args: any) => {
        deps.assertAutomationArgs(args);
        deps.stopServer();
        deps.startServer(args.apiKey, args.port);
        return { running: deps.isServerRunning(), port: deps.getServerPort() };
    });
    ipcMain.handle('automation-api-status', () => ({ running: deps.isServerRunning(), port: deps.getServerPort() }));
    ipcMain.handle('test-linear-connection', async (_e: any, { apiKey }: any) => await deps.integrations.getLinearTeams(apiKey));
    ipcMain.handle('test-jira-connection', async (_e: any, { domain, email, apiToken, token }: any) => await deps.integrations.getJiraProjects(domain, email, apiToken || token));
    ipcMain.handle('ccv2-get-environments', async (_e: any, { subscriptionCode, apiToken }: any) => await deps.health.ccv2GetEnvironments(subscriptionCode, apiToken));
    ipcMain.handle('ccv2-get-deployments', async (_e: any, { subscriptionCode, apiToken, environmentCode }: any) => await deps.health.ccv2GetDeployments(subscriptionCode, apiToken, environmentCode));
    ipcMain.handle('ccv2-get-build', async (_e: any, { subscriptionCode, apiToken, buildCode }: any) => await deps.health.ccv2GetBuild(subscriptionCode, apiToken, buildCode));
    ipcMain.handle('check-environments-health', async (_e: any, { environments }: any) => await deps.health.checkEnvironmentsNow(environments));
    ipcMain.handle('start-health-service', (_e: any, { environments, intervalMs }: any) => deps.health.startHealthService(environments, intervalMs));
    ipcMain.handle('stop-health-service', () => deps.health.stopHealthService());

    // Integration Handlers
    ipcMain.handle('sync-linear', async (_e: any, { apiKey, teamKey, connectionId }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(teamKey, 'teamKey'); deps.assertString(connectionId, 'connectionId');
        return deps.integrations.fetchLinearIssues(apiKey, teamKey, connectionId);
    });
    ipcMain.handle('get-linear-comments', async (_e: any, { apiKey, issueId }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(issueId, 'issueId');
        return deps.integrations.getLinearComments(apiKey, issueId);
    });
    ipcMain.handle('add-linear-comment', async (_e: any, { apiKey, issueId, body }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(issueId, 'issueId'); deps.assertString(body, 'body', 50_000);
        await deps.integrations.addLinearComment(apiKey, issueId, body); return { success: true };
    });
    ipcMain.handle('get-linear-workflow-states', async (_e: any, { apiKey, teamId }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(teamId, 'teamId');
        return deps.integrations.getLinearWorkflowStates(apiKey, teamId);
    });
    ipcMain.handle('update-linear-status', async (_e: any, { apiKey, issueId, stateId }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(issueId, 'issueId'); deps.assertString(stateId, 'stateId');
        await deps.integrations.updateLinearIssueStatus(apiKey, issueId, stateId); return { success: true };
    });
    ipcMain.handle('get-linear-history', async (_e: any, { apiKey, issueId }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(issueId, 'issueId');
        return deps.integrations.getLinearIssueHistory(apiKey, issueId);
    });
    ipcMain.handle('create-linear-issue', async (_e: any, { apiKey, teamId, title, description, priority }: any) => {
        deps.assertString(apiKey, 'apiKey'); deps.assertString(teamId, 'teamId'); deps.assertString(title, 'title', 500);
        return deps.integrations.createLinearIssue(apiKey, teamId, title, description, priority);
    });

    ipcMain.handle('sync-jira', async (_e: any, { domain, email, apiKey, projectKey, connectionId }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey');
        deps.assertString(projectKey, 'projectKey'); deps.assertString(connectionId, 'connectionId');
        return deps.integrations.fetchJiraIssues(domain, email, apiKey, projectKey, connectionId);
    });
    ipcMain.handle('get-jira-comments', async (_e: any, { domain, email, apiKey, issueKey }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey'); deps.assertString(issueKey, 'issueKey');
        return deps.integrations.getJiraComments(domain, email, apiKey, issueKey);
    });
    ipcMain.handle('add-jira-comment', async (_e: any, { domain, email, apiKey, issueKey, body }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey');
        deps.assertString(issueKey, 'issueKey'); deps.assertString(body, 'body', 50_000);
        await deps.integrations.addJiraComment(domain, email, apiKey, issueKey, body); return { success: true };
    });
    ipcMain.handle('transition-jira-issue', async (_e: any, { domain, email, apiKey, issueKey, transitionName }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey');
        deps.assertString(issueKey, 'issueKey'); deps.assertString(transitionName, 'transitionName');
        await deps.integrations.transitionJiraIssue(domain, email, apiKey, issueKey, transitionName); return { success: true };
    });
    ipcMain.handle('get-jira-history', async (_e: any, { domain, email, apiKey, issueKey }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey'); deps.assertString(issueKey, 'issueKey');
        return deps.integrations.getJiraIssueHistory(domain, email, apiKey, issueKey);
    });
    ipcMain.handle('get-jira-statuses', async (_e: any, { domain, email, apiKey, projectKey }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey'); deps.assertString(projectKey, 'projectKey');
        return deps.integrations.getJiraStatuses(domain, email, apiKey, projectKey);
    });
    ipcMain.handle('create-jira-issue', async (_e: any, { domain, email, apiKey, projectKey, title, description, issueTypeName }: any) => {
        deps.assertString(domain, 'domain'); deps.assertString(email, 'email'); deps.assertString(apiKey, 'apiKey');
        deps.assertString(projectKey, 'projectKey'); deps.assertString(title, 'title', 500);
        return deps.integrations.createJiraIssue(domain, email, apiKey, projectKey, title, description, issueTypeName);
    });

    // SAP HAC Handlers
    const sapHacInstances = new Map<string, any>();
    const getSapHac = (baseUrl: string, ignoreSsl = false) => {
        if (!sapHacInstances.has(baseUrl)) {
            // Evict oldest entry when cache is full to prevent unbounded growth
            if (sapHacInstances.size >= deps.MAX_SAP_HAC_INSTANCES) {
                const oldestKey = sapHacInstances.keys().next().value;
                if (typeof oldestKey === 'string') {
                    sapHacInstances.delete(oldestKey);
                }
            }
            sapHacInstances.set(baseUrl, new deps.SapHacService(baseUrl, ignoreSsl));
        }
        return sapHacInstances.get(baseUrl);
    };

    ipcMain.handle('sap-hac-login', async (_e: any, { baseUrl, user, pass, ignoreSsl }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        deps.assertString(user, 'user', 200);
        deps.assertString(pass, 'pass', 500);
        try {
            const svc = getSapHac(baseUrl, ignoreSsl);
            const success = await svc.login(user, pass);
            return success ? { success: true } : { success: false, error: 'Login failed' };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });
    ipcMain.handle('sap-hac-get-cronjobs', async (_e: any, { baseUrl }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        try {
            const data = await getSapHac(baseUrl).getCronJobs();
            return { success: true, data };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });
    ipcMain.handle('sap-hac-flexible-search', async (_e: any, { baseUrl, query, max }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        deps.assertString(query, 'query', 50_000);
        try {
            const data = await getSapHac(baseUrl).runFlexibleSearch(query, max);
            return { success: !data.Error, data, error: data.Error || undefined };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });
    ipcMain.handle('sap-hac-import-impex', async (_e: any, { baseUrl, script, enableCode }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        deps.assertString(script, 'script', 500_000);
        try {
            const data = await getSapHac(baseUrl).importImpEx(script, enableCode);
            return { success: data.Success, data, error: data.Success ? undefined : data.Log };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });
    ipcMain.handle('sap-hac-get-catalog-versions', async (_e: any, { baseUrl }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        try {
            const data = await getSapHac(baseUrl).getCatalogVersions();
            return { success: true, data };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });
    ipcMain.handle('sap-hac-get-catalog-ids', async (_e: any, { baseUrl }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        try {
            const data = await getSapHac(baseUrl).getCatalogIds();
            return { success: true, data };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });
    ipcMain.handle('sap-hac-get-catalog-sync-diff', async (_e: any, { baseUrl, catalogId, maxMissing }: any) => {
        deps.assertString(baseUrl, 'baseUrl', 500);
        deps.assertString(catalogId, 'catalogId', 500);
        try {
            const data = await getSapHac(baseUrl).getCatalogSyncDiff(catalogId, maxMissing);
            return { success: true, data };
        } catch (e: any) {
            return { success: false, error: e.message || String(e) };
        }
    });

    // OAuth
    ipcMain.handle('oauth-start', async (_e: any, { provider }: any) => {
        try {
            deps.assertString(provider, 'provider', 20);
            // Determine the current server port (default 5248)
            let settings: any = {};
            try {
                if (deps.fs.existsSync(deps.SETTINGS_FILE)) {
                    settings = JSON.parse(await deps.fsp.readFile(deps.SETTINGS_FILE, 'utf8'));
                }
            } catch { /* use default port */ }
            const port = parseInt(settings.automationPort || '5248', 10);
            if (!deps.isServerRunning()) {
                deps.startServer(deps.crypto.randomBytes(32).toString('hex'), port);
            }
            const url = deps.oauth.generateAuthUrl(provider as any, port);
            await deps.shell.openExternal(url);
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('oauth-logout', async (_e: any, { provider }: any) => {
        try {
            deps.assertString(provider, 'provider', 20);
            await deps.oauth.revokeTokens(provider as any);
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
    ipcMain.handle('oauth-get-status', async (_e: any, { provider }: any) => {
        try {
            deps.assertString(provider, 'provider', 20);
            const connected = await deps.oauth.isConnected(provider as any);
            return { connected };
        } catch {
            return { connected: false };
        }
    });

    // GitHub Integration
    ipcMain.handle('github-check-scope', async () => {
        try { return await deps.github.checkTokenScope(); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-repos', async (_e: any, { forceRefresh }: any = {}) => {
        try { return await deps.github.getRepos(!!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-pull-requests', async (_e: any, { owner, repo, state, forceRefresh }: any) => {
        try { return await deps.github.getPullRequests(owner, repo, state, !!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-pr-detail', async (_e: any, { owner, repo, prNumber }: any) => {
        try { return await deps.github.getPrDetail(owner, repo, prNumber); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-pr-reviews', async (_e: any, { owner, repo, prNumber }: any) => {
        try { return await deps.github.getPrReviews(owner, repo, prNumber); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-pr-check-status', async (_e: any, { owner, repo, ref }: any) => {
        try { return await deps.github.getPrCheckStatus(owner, repo, ref); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-commits', async (_e: any, { owner, repo, branch, forceRefresh }: any) => {
        try { return await deps.github.getCommits(owner, repo, branch, !!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-branches', async (_e: any, { owner, repo, forceRefresh }: any) => {
        try { return await deps.github.getBranches(owner, repo, !!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-review-requests', async (_e: any, { forceRefresh }: any = {}) => {
        try { return await deps.github.getReviewRequests(!!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-my-open-prs', async (_e: any, { forceRefresh }: any = {}) => {
        try { return await deps.github.getMyOpenPrs(!!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-workflow-runs', async (_e: any, { owner, repo, forceRefresh }: any) => {
        try { return await deps.github.getWorkflowRuns(owner, repo, !!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-deployments', async (_e: any, { owner, repo, forceRefresh }: any) => {
        try { return await deps.github.getDeployments(owner, repo, !!forceRefresh); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-rerun-workflow', async (_e: any, { owner, repo, runId }: any) => {
        try { return await deps.github.rerunWorkflow(owner, repo, runId); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-pr-comments', async (_e: any, { owner, repo, prNumber }: any) => {
        try { return await deps.github.getPrComments(owner, repo, prNumber); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-workflow-jobs', async (_e: any, { owner, repo, runId }: any) => {
        try { return await deps.github.getWorkflowJobs(owner, repo, runId); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-get-workflows-list', async (_e: any, { owner, repo }: any) => {
        try { return await deps.github.getWorkflowsList(owner, repo); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
    ipcMain.handle('github-dispatch-workflow', async (_e: any, { owner, repo, workflowId, ref }: any) => {
        try { return await deps.github.dispatchWorkflow(owner, repo, workflowId, ref); }
        catch (e: any) { return { __isError: true, message: e.message }; }
    });
}
