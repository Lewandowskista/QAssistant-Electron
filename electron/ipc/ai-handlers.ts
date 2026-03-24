import type Electron from 'electron'
import { GeminiService } from '../gemini'

export function registerAiHandlers(ipcMain: Electron.IpcMain, deps: {
    waitForAiTurn: (channel: string) => Promise<void>
    getGeminiService: (apiKey: string) => any
    accuracy: { readDocumentText: (filePath: string) => Promise<string>; chunkDocument: (text: string, mode: string) => any[] }
    errMsg: (err: unknown) => string
    assertString: (v: unknown, name: string, maxLen?: number) => void
    assertArray: (v: unknown, name: string, maxLen?: number) => void
    assertObject: (v: unknown, name: string) => void
}): void {
    ipcMain.handle('ai-generate-cases', async (_e: any, { apiKey, tasks, sourceName, project, designDoc, modelName, comments }: any) => {
        await deps.waitForAiTurn('ai-generate-cases');
        deps.assertString(apiKey, 'apiKey');
        try {
            return await deps.getGeminiService(apiKey).generateTestCases(tasks, sourceName, project, designDoc, modelName, comments);
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
    ipcMain.handle('ai-analyze-issue', async (_e: any, { apiKey, task, comments, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-analyze-issue');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await deps.getGeminiService(apiKey).analyzeIssue(task, comments, project, 0, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-analyze', async (_e: any, { apiKey, context, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-analyze');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await deps.getGeminiService(apiKey).analyzeProject(context, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-criticality', async (_e: any, { apiKey, tasks, testPlans, executions, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-criticality');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await deps.getGeminiService(apiKey).assessCriticality(tasks, testPlans, executions, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-test-run-suggestions', async (_e: any, { apiKey, testPlans, executions, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-test-run-suggestions');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await deps.getGeminiService(apiKey).getTestRunSuggestions(testPlans, executions, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-smoke-subset', async (_e: any, { apiKey, candidates, doneTasks, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-smoke-subset');
        try {
            deps.assertString(apiKey, 'apiKey');
            return await deps.getGeminiService(apiKey).selectSmokeSubset(candidates, doneTasks, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-chat', async (_e: any, { apiKey, userMessage, history, role, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-chat');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(userMessage, 'userMessage', 50_000);
            return await deps.getGeminiService(apiKey).chat(userMessage, history || [], role === 'dev' ? 'dev' : 'qa', project, modelName);
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
    ipcMain.handle('ai-accuracy-extract-claims', async (_e: any, { apiKey, agentResponse, modelName, expectedAnswer }: any) => {
        await deps.waitForAiTurn('ai-accuracy-extract-claims');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(agentResponse, 'agentResponse', 50_000);
            return await deps.getGeminiService(apiKey).extractClaims(agentResponse, modelName, expectedAnswer);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-verify-claims', async (_e: any, { apiKey, claims, refChunks, modelName, expectedAnswer }: any) => {
        await deps.waitForAiTurn('ai-accuracy-verify-claims');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertArray(claims, 'claims', 200);
            deps.assertArray(refChunks, 'refChunks', 100);
            return await deps.getGeminiService(apiKey).verifyClaims(claims as any[], refChunks as any[], modelName, expectedAnswer);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-score-dimensions', async (_e: any, { apiKey, question, agentResponse, expectedAnswer, claimVerdicts, refChunks, modelName }: any) => {
        await deps.waitForAiTurn('ai-accuracy-score-dimensions');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(question, 'question', 10_000);
            deps.assertString(agentResponse, 'agentResponse', 50_000);
            deps.assertArray(claimVerdicts, 'claimVerdicts', 200);
            deps.assertArray(refChunks, 'refChunks', 100);
            return await deps.getGeminiService(apiKey).scoreDimensions(question, agentResponse, claimVerdicts as any[], refChunks as any[], modelName, expectedAnswer);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
    ipcMain.handle('ai-accuracy-rerank-chunks', async (_e: any, { apiKey, question, agentResponse, chunks, topK, modelName }: any) => {
        await deps.waitForAiTurn('ai-accuracy-rerank-chunks');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(question, 'question', 10_000);
            deps.assertString(agentResponse, 'agentResponse', 50_000);
            deps.assertArray(chunks, 'chunks', 100);
            return await deps.getGeminiService(apiKey).rerankChunks(question, agentResponse, chunks as any[], topK ?? 20, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-standup-summary', async (_e: any, { apiKey, metrics, modelName }: any) => {
        await deps.waitForAiTurn('ai-standup-summary');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertObject(metrics, 'metrics');
            return await deps.getGeminiService(apiKey).generateStandupSummary(metrics, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-generate-flexsearch', async (_e: any, { apiKey, naturalLanguageQuery, modelName }: any) => {
        await deps.waitForAiTurn('ai-generate-flexsearch');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(naturalLanguageQuery, 'naturalLanguageQuery', 1000);
            return await deps.getGeminiService(apiKey).generateFlexSearch(naturalLanguageQuery, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-find-duplicate-bugs', async (_e: any, { apiKey, newBugTitle, newBugDescription, newBugReproSteps, affectedComponents, existingBugs, modelName }: any) => {
        await deps.waitForAiTurn('ai-find-duplicate-bugs');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertString(newBugTitle, 'newBugTitle', 500);
            return await deps.getGeminiService(apiKey).findDuplicateBugs(newBugTitle, newBugDescription || '', newBugReproSteps || '', affectedComponents || [], existingBugs || [], modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });

    ipcMain.handle('ai-analyze-pull-request', async (_e: any, { apiKey, pr, testCases, project, modelName }: any) => {
        await deps.waitForAiTurn('ai-analyze-pull-request');
        try {
            deps.assertString(apiKey, 'apiKey');
            deps.assertObject(pr, 'pr');
            deps.assertArray(testCases, 'testCases', 500);
            return await deps.getGeminiService(apiKey).analyzePullRequest(pr, testCases, project, modelName);
        }
        catch (err: any) { return { __isError: true, message: deps.errMsg(err) }; }
    });
}
