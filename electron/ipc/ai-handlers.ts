import type Electron from 'electron'
import { GeminiService } from '../gemini'
import { NimService, NIM_MODEL_META, nimQaScore } from '../nim'

export function registerAiHandlers(ipcMain: Electron.IpcMain, deps: {
    waitForAiTurn: (channel: string) => Promise<void>
    getGeminiService: (apiKey: string) => any
    getNimService: (apiKey: string) => any
    /** Ollama needs no credential; it is addressed by base URL (empty = local default). */
    getOllamaService: (baseUrl: string) => any
    accuracy: { readDocumentText: (filePath: string) => Promise<string>; chunkDocument: (text: string, mode: string) => any[] }
    errMsg: (err: unknown) => string
    assertString: (v: unknown, name: string, maxLen?: number) => void
    assertArray: (v: unknown, name: string, maxLen?: number) => void
    assertObject: (v: unknown, name: string) => void
}): void {
    function getSvc(provider: string | undefined, apiKey: string): any {
        // For 'ollama' the apiKey slot carries the base URL, since local inference has no key.
        if (provider === 'ollama') return deps.getOllamaService(apiKey)
        if (provider === 'nim') return deps.getNimService(apiKey)
        return deps.getGeminiService(apiKey)
    }

    ipcMain.handle('ai-generate-cases', async (_e: any, { apiKey, tasks, sourceName, project, designDoc, modelName, comments, provider }: any) => {
        await deps.waitForAiTurn('ai-generate-cases');
        deps.assertString(apiKey, 'apiKey');
        try {
            return await getSvc(provider, apiKey).generateTestCases(tasks, sourceName, project, designDoc, modelName, comments);
        } catch (err: any) {
            // Return a flat wrapper to the IPC boundary to safely cross context bridges without native cloning recursion
            return { __isError: true, message: deps.errMsg(err) };
        }
    });
    ipcMain.handle('ai-list-models', async (_e: any, { apiKey }: any) => {
        try {
            deps.assertString(apiKey, 'apiKey');
            return await new GeminiService(apiKey).listAvailableModels();
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('nim-list-models', async (_e: any, { apiKey }: any) => {
        try {
            deps.assertString(apiKey, 'apiKey');
            return await new NimService(apiKey).listAvailableModels();
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('nim-probe-models', async (_e: any, { apiKey, models }: any) => {
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertArray(models, 'models', 500);
            return await deps.getNimService(apiKey).probeAllModels(models);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('nim-get-model-metadata', (_e: any, { models }: any) => {
        const meta: Record<string, { instruction: number; reasoning: number; coding: number; speed: number; contextK: number; qaScore: number; notes?: string }> = {}
        const list: string[] = Array.isArray(models) ? models : Object.keys(NIM_MODEL_META)
        for (const m of list) {
            const entry = NIM_MODEL_META[m]
            if (entry) meta[m] = { ...entry, qaScore: nimQaScore(entry) }
        }
        return meta
    });
    ipcMain.handle('ollama-list-models', async (_e: any, { baseUrl }: any) => {
        try {
            deps.assertString(baseUrl ?? '', 'baseUrl', 500);
            return await deps.getOllamaService(baseUrl ?? '').listAvailableModels();
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ollama-installed-models', async (_e: any, { baseUrl }: any) => {
        try {
            deps.assertString(baseUrl ?? '', 'baseUrl', 500);
            return await deps.getOllamaService(baseUrl ?? '').listInstalledModels();
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ollama-status', async (_e: any, { baseUrl }: any) => {
        try {
            deps.assertString(baseUrl ?? '', 'baseUrl', 500);
            const svc = deps.getOllamaService(baseUrl ?? '');
            const reachable = await svc.isReachable();
            const models = reachable ? await svc.listAvailableModels() : [];
            return { reachable, models };
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ollama-probe-models', async (_e: any, { baseUrl, models }: any) => {
        try {
            deps.assertString(baseUrl ?? '', 'baseUrl', 500);
            deps.assertArray(models, 'models', 100);
            return await deps.getOllamaService(baseUrl ?? '').probeAllModels(models);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-analyze-issue', async (_e: any, { apiKey, task, comments, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-analyze-issue');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await getSvc(provider, apiKey).analyzeIssue(task, comments, project, 0, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-analyze', async (_e: any, { apiKey, context, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-analyze');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await getSvc(provider, apiKey).analyzeProject(context, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-criticality', async (_e: any, { apiKey, tasks, testPlans, executions, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-criticality');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await getSvc(provider, apiKey).assessCriticality(tasks, testPlans, executions, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-test-run-suggestions', async (_e: any, { apiKey, testPlans, executions, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-test-run-suggestions');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await getSvc(provider, apiKey).getTestRunSuggestions(testPlans, executions, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-smoke-subset', async (_e: any, { apiKey, candidates, doneTasks, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-smoke-subset');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await getSvc(provider, apiKey).selectSmokeSubset(candidates, doneTasks, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-chat', async (_e: any, { apiKey, userMessage, history, role, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-chat');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(userMessage, 'userMessage', 50_000);
            return await getSvc(provider, apiKey).chat(userMessage, history || [], role === 'dev' ? 'dev' : 'qa', project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    // AI Accuracy Testing Handlers
    ipcMain.handle('read-document-text', async (_e: any, { filePath }: any) => {
        try {
            deps.assertString(filePath, 'filePath', 2000);
            const text = await deps.accuracy.readDocumentText(filePath);
            const chunks = deps.accuracy.chunkDocument(text, 'preview');
            return { success: true, text, chunkCount: chunks.length };
        }
        catch (err: any) { return { success: false, error: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-extract-claims', async (_e: any, { apiKey, agentResponse, modelName, expectedAnswer, provider }: any) => {
        await deps.waitForAiTurn('ai-accuracy-extract-claims');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(agentResponse, 'agentResponse', 50_000);
            return await getSvc(provider, apiKey).extractClaims(agentResponse, modelName, expectedAnswer);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-verify-claims', async (_e: any, { apiKey, claims, refChunks, modelName, expectedAnswer, provider }: any) => {
        await deps.waitForAiTurn('ai-accuracy-verify-claims');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertArray(claims, 'claims', 200);
            deps.assertArray(refChunks, 'refChunks', 100);
            return await getSvc(provider, apiKey).verifyClaims(claims as any[], refChunks as any[], modelName, expectedAnswer);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-score-dimensions', async (_e: any, { apiKey, question, agentResponse, expectedAnswer, claimVerdicts, refChunks, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-accuracy-score-dimensions');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(question, 'question', 10_000);
            deps.assertString(agentResponse, 'agentResponse', 50_000);
            deps.assertArray(claimVerdicts, 'claimVerdicts', 200);
            deps.assertArray(refChunks, 'refChunks', 100);
            return await getSvc(provider, apiKey).scoreDimensions(question, agentResponse, claimVerdicts as any[], refChunks as any[], modelName, expectedAnswer);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-rerank-chunks', async (_e: any, { apiKey, question, agentResponse, chunks, topK, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-accuracy-rerank-chunks');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(question, 'question', 10_000);
            deps.assertString(agentResponse, 'agentResponse', 50_000);
            deps.assertArray(chunks, 'chunks', 100);
            return await getSvc(provider, apiKey).rerankChunks(question, agentResponse, chunks as any[], topK ?? 20, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-standup-summary', async (_e: any, { apiKey, metrics, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-standup-summary');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertObject(metrics, 'metrics');
            return await getSvc(provider, apiKey).generateStandupSummary(metrics, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-find-duplicate-bugs', async (_e: any, { apiKey, newBugTitle, newBugDescription, newBugReproSteps, affectedComponents, existingBugs, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-find-duplicate-bugs');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(newBugTitle, 'newBugTitle', 500);
            return await getSvc(provider, apiKey).findDuplicateBugs(newBugTitle, newBugDescription || '', newBugReproSteps || '', affectedComponents || [], existingBugs || [], modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-analyze-pull-request', async (_e: any, { apiKey, pr, testCases, project, modelName, provider }: any) => {
        await deps.waitForAiTurn('ai-analyze-pull-request');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertObject(pr, 'pr');
            deps.assertArray(testCases, 'testCases', 500);
            return await getSvc(provider, apiKey).analyzePullRequest(pr, testCases, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
}
