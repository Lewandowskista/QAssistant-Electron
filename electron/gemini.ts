import { GoogleGenerativeAI } from '@google/generative-ai'
import { SAP_COMMERCE_CONTEXT_BLOCK } from './sapCommerceContext'
import { log } from './logger'
import { normalizePullRequestAnalysisResult } from './prAnalysis'
import type { PullRequestAnalysisResult } from './prAnalysis'
import { sanitizeToonList, sanitizeToonScalar, ToonWriter } from './toon'

const MODEL_2_5_FLASH = 'gemini-2.5-flash';
const MODEL_3_FLASH = 'gemini-3-flash';
const MODEL_3_FLASH_PREVIEW = 'gemini-3-flash-preview';

// Per-feature output token limits — prevents rambling and reduces cost
const MAX_TOKENS: Record<string, number> = {
    chat: 4096,
    issue_analysis: 4096,
    test_generation: 8192,
    criticality: 2048,
    suggestions: 2048,
    smoke_subset: 1024,
    project_analysis: 4096,
    pr_analysis: 3072,
    claim_extraction: 8192,
    claim_verification: 16384,
    dimension_scoring: 8192,
}

type PromptTelemetry = Record<string, string | number | boolean | undefined>

type PromptBuildResult = {
    system: string
    user: string
    telemetry?: PromptTelemetry
}

type QaContextProfile = {
    includeTrackedIssues?: boolean
    trackedIssuesMax?: number
    includeTestCoverage?: boolean
    includeChecklistAreas?: boolean
    includeTestDataDomains?: boolean
    includeSapContext?: boolean
    includeEnvironments?: boolean
}

type DevContextProfile = {
    includeTrackedWork?: boolean
    trackedWorkMax?: number
    includeHandoffs?: boolean
    handoffMax?: number
    includeEnvironments?: boolean
}

type GeminiUsage = {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
}

/**
 * AI Service for Gemini integration with TOON (Token-Oriented Object Notation) prompt system.
 * Uses systemInstruction for role/rules separation and responseMimeType for JSON outputs.
 */
export class GeminiService {
    private genAI: GoogleGenerativeAI
    private apiKey: string
    private preferredModel: string = MODEL_3_FLASH

    constructor(apiKey: string) {
        this.apiKey = apiKey
        this.genAI = new GoogleGenerativeAI(apiKey)
    }

    /** List models available to this API key */
    async listAvailableModels(): Promise<string[]> {
        try {
            // Use header-based auth to avoid leaking the API key in URL logs/proxies
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
                headers: { 'x-goog-api-key': this.apiKey },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json() as any;
            const models: any[] = data.models || [];

            // Keep only models that support generateContent — these are the ones with
            // active generation quotas (RPM/TPM/RPD > 0). Models that only support
            // embedContent, countTokens, etc. have no generation quota and can't be
            // used as a preferred model.
            return models
                .filter((m: any) =>
                    Array.isArray(m.supportedGenerationMethods) &&
                    m.supportedGenerationMethods.includes('generateContent')
                )
                .map((m: any) => (m.name as string).replace('models/', ''));
        } catch {
            console.error('Failed to list Gemini models');
            return [];
        }
    }

    private getModel(modelName: string, temperature = 0.7, maxOutputTokens = 8192, systemInstruction?: string, jsonMode = false) {
        return this.genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
            generationConfig: {
                temperature,
                // At temperature=0 (greedy) topP must be 1.0, otherwise nucleus sampling
                // still introduces variance even when temperature is zero.
                topP: temperature === 0 ? 1.0 : 0.9,
                maxOutputTokens,
                ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
            }
        })
    }

    private buildModelSequence(modelOverride?: string): string[] {
        return Array.from(new Set([
            modelOverride,
            this.preferredModel,
            MODEL_3_FLASH,
            MODEL_2_5_FLASH,
            MODEL_3_FLASH_PREVIEW,
        ].filter(Boolean) as string[]));
    }

    private extractErrorInfo(err: any): { errorMsg: string; errorStatus: string } {
        let errorMsg = "";
        let errorStatus = "";
        try {
            if (err && typeof err === 'object') {
                errorMsg = typeof err.message === 'string' ? err.message : "";
                errorStatus = err.status !== undefined ? String(err.status) : "";
            } else {
                errorMsg = String(err);
            }
        } catch {
            errorMsg = "Unparseable error object thrown by Gemini SDK";
        }
        return { errorMsg, errorStatus };
    }

    private classifyError(errorStatus: string, errorMsg: string): { isRateLimit: boolean; isUnavailable: boolean } {
        const errorStr = `${errorStatus} ${errorMsg}`.toLowerCase();
        return {
            isRateLimit: errorStatus === '429' || errorStr.includes('rate_limit') || errorStr.includes('resource_exhausted') || errorStr.includes('too many requests'),
            isUnavailable: errorStatus === '404' || errorStatus === '400' || errorStr.includes('model not found') || errorStr.includes('model_not_found'),
        };
    }

    private buildFinalErrorMessage(lastError: any): string {
        let finalMsg = "Unknown API Error";
        let finalStatus = "";
        try {
            if (lastError && typeof lastError === 'object') {
                finalMsg = typeof lastError.message === 'string' ? lastError.message : "API Call Failed";
                finalStatus = lastError.status !== undefined ? `[Status ${lastError.status}] ` : "";
            } else {
                finalMsg = String(lastError);
            }
            // Remove URLs (may contain API key query params) and stack traces
            finalMsg = finalMsg.replace(/https?:\/\/[^\s]*/gi, '[url]').replace(/\n\s+at\s+.*/g, '');
        } catch {
            finalMsg = "Crash parsing error object";
        }
        return `${finalStatus}${finalMsg}`;
    }

    private async executeWithFallback(
        prompt: string | any,
        modelOverride?: string,
        temperature = 0.7,
        maxOutputTokens = 8192,
        systemInstruction?: string,
        jsonMode = false,
        feature = 'unspecified',
        telemetry?: PromptTelemetry,
    ): Promise<string> {
        const models = this.buildModelSequence(modelOverride);

        let lastError: any;
        for (const modelName of models) {
            try {
                const model = this.getModel(modelName, temperature, maxOutputTokens, systemInstruction, jsonMode);
                const result = await model.generateContent(prompt);

                if (modelName !== this.preferredModel) {
                    log.info(`Gemini switching preferred model to ${modelName} after successful response`);
                    this.preferredModel = modelName;
                }

                const usage = result.response.usageMetadata;
                GeminiService.logUsage(modelName, usage, feature, telemetry)

                return result.response.text();
            } catch (err: any) {
                lastError = err;
                const { errorMsg, errorStatus } = this.extractErrorInfo(err);
                const { isRateLimit, isUnavailable } = this.classifyError(errorStatus, errorMsg);

                if (isRateLimit || isUnavailable) {
                    console.warn(`Gemini model ${modelName} ${isRateLimit ? 'rate limited' : 'unavailable/invalid'}. Trying next fallback...`);
                    if (modelName === this.preferredModel) {
                        const nextIndex = (models.indexOf(modelName) + 1) % models.length;
                        this.preferredModel = models[nextIndex];
                    }
                    continue;
                }

                console.error(`Gemini model ${modelName} failed with unexpected error:`, `${errorStatus} ${errorMsg}`.toLowerCase());
                continue;
            }
        }

        throw `Gemini API Error: ${this.buildFinalErrorMessage(lastError)}`;
    }

    // ── TOON Sanitizers ──────────────────────────────────────────────────────

    private static sanitizeToonValue(value: string | null | undefined, maxLength = 500): string {
        return sanitizeToonScalar(value, maxLength)
    }

    private static formatPromptTelemetry(feature: string, telemetry?: PromptTelemetry): string {
        const parts = Object.entries(telemetry || {})
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
        return parts.length > 0 ? `${feature} | ${parts.join(' | ')}` : feature
    }

    private static pushCommentList(writer: ToonWriter, name: string, comments: any[], maxComments = 5): number {
        const visibleComments = comments.slice(0, maxComments)
        if (visibleComments.length === 0) return 0

        writer.list(name, visibleComments, (list, comment) => {
            list.itemObject([
                { key: 'author', value: comment.authorName, maxLength: 80 },
                {
                    key: 'date',
                    value: comment.createdAt ? new Date(comment.createdAt).toISOString().split('T')[0] : '',
                    maxLength: 32,
                },
                { key: 'body', value: comment.body, maxLength: 240 },
            ])
        })

        return visibleComments.length
    }

    // ── QA Context Block ─────────────────────────────────────────────────────

    private static resolvePromptWriter(target: ToonWriter | string[]): { writer: ToonWriter; flush: () => void } {
        if (Array.isArray(target)) {
            const writer = new ToonWriter()
            return {
                writer,
                flush: () => {
                    const rendered = writer.toString()
                    if (rendered) {
                        target.push(rendered)
                    }
                },
            }
        }

        return { writer: target, flush: () => undefined }
    }

    private static logUsage(modelName: string, usage: GeminiUsage | undefined, feature: string, telemetry?: PromptTelemetry): void {
        if (usage) {
            log.info(`[Gemini] ${modelName} | ${GeminiService.formatPromptTelemetry(feature, telemetry)} | prompt: ${usage.promptTokenCount ?? '?'} tokens, output: ${usage.candidatesTokenCount ?? '?'} tokens, total: ${usage.totalTokenCount ?? '?'} tokens`)
        } else {
            log.info(`[Gemini] ${modelName} | ${GeminiService.formatPromptTelemetry(feature, telemetry)}`)
        }
    }

    private static appendQaContext(target: ToonWriter | string[], project: any, profile: QaContextProfile | boolean = {}): PromptTelemetry {
        if (!project) return {}

        const normalizedProfile: QaContextProfile = typeof profile === 'boolean'
            ? { includeTrackedIssues: !profile }
            : profile

        const settings: Required<QaContextProfile> = {
            includeTrackedIssues: normalizedProfile.includeTrackedIssues ?? true,
            trackedIssuesMax: normalizedProfile.trackedIssuesMax ?? 25,
            includeTestCoverage: normalizedProfile.includeTestCoverage ?? true,
            includeChecklistAreas: normalizedProfile.includeChecklistAreas ?? true,
            includeTestDataDomains: normalizedProfile.includeTestDataDomains ?? true,
            includeSapContext: normalizedProfile.includeSapContext ?? true,
            includeEnvironments: normalizedProfile.includeEnvironments ?? true,
        }

        const telemetry: PromptTelemetry = {}
        const { writer, flush } = GeminiService.resolvePromptWriter(target)

        writer.object('qa_context', (context) => {
            context.field('project', project.name, { maxLength: 200 })
            context.field('project_desc', project.description, { maxLength: 300 })

            const activeEnv = project.environments?.find((environment: any) => environment.isDefault) ?? project.environments?.[0]
            if (activeEnv) {
                context.field('active_env', activeEnv.name, { maxLength: 100 })
                context.field('env_type', activeEnv.type, { maxLength: 40 })
                if (settings.includeEnvironments) {
                    context.field('env_url', activeEnv.baseUrl, { maxLength: 200 })
                }
            }

            if (settings.includeEnvironments && project.environments?.length > 0) {
                context.field(
                    'environments',
                    sanitizeToonList(
                        project.environments.map((environment: any) => `${sanitizeToonScalar(environment.name, 60)}(${sanitizeToonScalar(environment.type, 30)})`),
                        90,
                        8,
                    ),
                    { style: 'literal' },
                )
                telemetry.environments = Math.min(project.environments.length, 8)
            }

            if (settings.includeTestCoverage) {
                const planSummaries = project.testPlans || []
                const totalCaseCount = planSummaries.reduce((sum: number, plan: any) => sum + (plan.testCaseCount || plan.testCases?.length || 0), 0)
                if (totalCaseCount > 0) {
                    const aggregateStatusCounts = planSummaries.reduce((acc: Record<string, number>, plan: any) => {
                        if (plan.statusCounts && typeof plan.statusCounts === 'object') {
                            for (const [status, count] of Object.entries(plan.statusCounts)) {
                                acc[status] = (acc[status] || 0) + Number(count || 0)
                            }
                            return acc
                        }

                        for (const testCase of plan.testCases || []) {
                            const status = testCase?.status || 'not-run'
                            acc[status] = (acc[status] || 0) + 1
                        }
                        return acc
                    }, {})

                    context.field(
                        'test_coverage',
                        `total=${totalCaseCount},passed=${aggregateStatusCounts.passed || 0},failed=${aggregateStatusCounts.failed || 0},blocked=${aggregateStatusCounts.blocked || 0},not_run=${aggregateStatusCounts['not-run'] || 0}`,
                        { style: 'literal' },
                    )
                    telemetry.coverage_cases = totalCaseCount
                }
            }

            if (settings.includeChecklistAreas && project.checklists?.length > 0) {
                const categories = [...new Set(project.checklists.map((checklist: any) => checklist.category).filter(Boolean))] as string[]
                if (categories.length > 0) {
                    context.field('checklist_areas', sanitizeToonList(categories, 50, 8), { style: 'literal' })
                    telemetry.checklist_areas = Math.min(categories.length, 8)
                }
            }

            if (settings.includeTestDataDomains && project.testDataGroups?.length > 0) {
                const dataDomains = [...new Set(project.testDataGroups.map((group: any) => group.category).filter(Boolean))] as string[]
                if (dataDomains.length > 0) {
                    context.field('test_data_domains', sanitizeToonList(dataDomains, 50, 8), { style: 'literal' })
                    telemetry.test_data_domains = Math.min(dataDomains.length, 8)
                }
            }

            if (settings.includeTrackedIssues) {
                const doneStatuses = new Set([
                    'done', 'closed', 'resolved', 'cancelled', 'canceled',
                    "won't fix", 'wont fix', 'duplicate'
                ])
                const allTasks: any[] = project.tasks || []
                const activeTasks = project.manualContextSelection
                    ? allTasks
                    : allTasks.filter((task: any) => {
                        if (task.source === 'manual') return false
                        return !doneStatuses.has(String(task.status || '').toLowerCase().trim())
                    })

                if (activeTasks.length > 0) {
                    const visibleTasks = activeTasks.slice(0, settings.trackedIssuesMax)
                    context.field(
                        'tasks_summary',
                        `total=${allTasks.length},active=${activeTasks.length},shown=${visibleTasks.length},blocker=${activeTasks.filter((task: any) => task.priority === 'critical').length},high=${activeTasks.filter((task: any) => task.priority === 'high').length},medium=${activeTasks.filter((task: any) => task.priority === 'medium').length},low=${activeTasks.filter((task: any) => task.priority === 'low').length}`,
                        { style: 'literal' },
                    )
                    context.list('tracked_issues', visibleTasks, (list, task: any) => {
                        const issueId = task.sourceIssueId || task.externalId || task.id
                        list.itemObject([
                            { key: 'id', value: issueId, maxLength: 60 },
                            { key: 't', value: task.title, maxLength: 150 },
                            { key: 'status', value: task.status || 'unknown', maxLength: 40 },
                            { key: 'priority', value: task.priority || 'medium', maxLength: 20 },
                            { key: 'assignee', value: task.assignee, maxLength: 80 },
                            { key: 'labels', value: task.labels, maxLength: 100 },
                            { key: 'type', value: task.issueType, maxLength: 60 },
                            { key: 'repro', value: task.reproducibility, maxLength: 40 },
                            { key: 'freq', value: task.frequency, maxLength: 40 },
                            { key: 'components', value: sanitizeToonList(task.components || [], 24, 8), style: 'literal' },
                            { key: 'envs', value: sanitizeToonList(task.affectedEnvironmentNames || [], 24, 6), style: 'literal' },
                            { key: 'ac', value: task.acceptanceCriteria, maxLength: 200 },
                            { key: 'desc', value: task.description, maxLength: 300 },
                        ])
                        if (task.comments?.length > 0) {
                            GeminiService.pushCommentList(list, `comments_for_${sanitizeToonScalar(issueId, 40)}`, task.comments, 5)
                        }
                    })
                    telemetry.tracked_issues = visibleTasks.length
                }
            }
        })

        writer.separator()

        if (settings.includeSapContext && project.sapCommerce?.enabled) {
            const sapEnvironments = (project.sapCommerce.environments || []).slice(0, 5)
            if (sapEnvironments.length > 0) {
                const summary = sapEnvironments.map((environment: any) => {
                    const tags = [
                        environment.type,
                        environment.isDefault ? 'default' : '',
                        environment.hacUrl ? 'hac' : '',
                        environment.backOfficeUrl ? 'backoffice' : '',
                        environment.occBasePath ? `occ=${sanitizeToonScalar(environment.occBasePath, 80)}` : '',
                    ].filter(Boolean).join('+')
                    return `${sanitizeToonScalar(environment.name, 60)}(${sanitizeToonScalar(tags, 120)})`
                }).join(',')
                writer.field('sap_commerce_envs', summary, { style: 'literal' })
            }
            writer.raw(SAP_COMMERCE_CONTEXT_BLOCK)
            writer.separator()
            telemetry.sap_environments = sapEnvironments.length
        }

        flush()
        return telemetry
    }

    private static appendDevContext(target: ToonWriter | string[], project: any, profile: DevContextProfile = {}): PromptTelemetry {
        if (!project) return {}

        const settings: Required<DevContextProfile> = {
            includeTrackedWork: profile.includeTrackedWork ?? true,
            trackedWorkMax: profile.trackedWorkMax ?? 40,
            includeHandoffs: profile.includeHandoffs ?? true,
            handoffMax: profile.handoffMax ?? 25,
            includeEnvironments: profile.includeEnvironments ?? true,
        }

        const telemetry: PromptTelemetry = {}
        const { writer, flush } = GeminiService.resolvePromptWriter(target)

        writer.object('dev_context', (context) => {
            context.field('project', project.name, { maxLength: 200 })
            context.field('project_desc', project.description, { maxLength: 300 })

            const activeEnv = project.environments?.find((environment: any) => environment.isDefault) ?? project.environments?.[0]
            if (activeEnv) {
                context.field('active_env', activeEnv.name, { maxLength: 100 })
                context.field('env_type', activeEnv.type, { maxLength: 40 })
                if (settings.includeEnvironments) {
                    context.field('env_url', activeEnv.baseUrl, { maxLength: 200 })
                }
            }

            if (settings.includeEnvironments && project.environments?.length > 0) {
                context.field(
                    'environments',
                    sanitizeToonList(
                        project.environments.map((environment: any) => `${sanitizeToonScalar(environment.name, 60)}(${sanitizeToonScalar(environment.type, 30)})`),
                        90,
                        8,
                    ),
                    { style: 'literal' },
                )
                telemetry.environments = Math.min(project.environments.length, 8)
            }

            if (settings.includeTrackedWork && project.tasks?.length > 0) {
                const visibleTasks = project.tasks.slice(0, settings.trackedWorkMax)
                context.field('work_summary', `tasks=${project.tasks.length}`, { style: 'literal' })
                context.list('tracked_work', visibleTasks, (list, task: any) => {
                    const taskId = task.sourceIssueId || task.externalId || task.id
                    list.itemObject([
                        { key: 'id', value: taskId, maxLength: 60 },
                        { key: 't', value: task.title, maxLength: 150 },
                        { key: 'status', value: task.status, maxLength: 40 },
                        { key: 'priority', value: task.priority, maxLength: 20 },
                        { key: 'desc', value: task.description, maxLength: 300 },
                        { key: 'type', value: task.issueType, maxLength: 60 },
                        { key: 'assignee', value: task.assignee, maxLength: 80 },
                        { key: 'collab', value: task.collabState, maxLength: 40 },
                        { key: 'handoff', value: task.activeHandoffId, maxLength: 80 },
                        { key: 'labels', value: task.labels, maxLength: 120 },
                        { key: 'repro', value: task.reproducibility, maxLength: 40 },
                        { key: 'freq', value: task.frequency, maxLength: 40 },
                        { key: 'components', value: sanitizeToonList(task.components || [], 24, 8), style: 'literal' },
                        { key: 'envs', value: sanitizeToonList(task.affectedEnvironmentNames || [], 24, 6), style: 'literal' },
                        { key: 'ac', value: task.acceptanceCriteria, maxLength: 200 },
                    ])
                    if (task.comments?.length > 0) {
                        GeminiService.pushCommentList(list, `comments_for_${sanitizeToonScalar(taskId, 40)}`, task.comments, 5)
                    }
                })
                telemetry.tracked_work = visibleTasks.length
            }

            if (settings.includeHandoffs && project.handoffs?.length > 0) {
                const visibleHandoffs = project.handoffs.slice(0, settings.handoffMax)
                context.field('handoff_summary', `total=${project.handoffs.length}`, { style: 'literal' })
                context.list('handoffs', visibleHandoffs, (list, handoff: any) => {
                    list.itemObject([
                        { key: 'id', value: handoff.id, maxLength: 80 },
                        { key: 'task', value: handoff.taskId, maxLength: 80 },
                        { key: 'type', value: handoff.type, maxLength: 40 },
                        { key: 'summary', value: handoff.summary, maxLength: 240 },
                        { key: 'env', value: handoff.environmentName, maxLength: 80 },
                        { key: 'severity', value: handoff.severity, maxLength: 40 },
                        { key: 'branch', value: handoff.branchName, maxLength: 120 },
                        { key: 'release', value: handoff.releaseVersion, maxLength: 80 },
                        { key: 'complete', value: handoff.isComplete === undefined ? undefined : (handoff.isComplete ? 'yes' : 'no'), maxLength: 4 },
                    ])

                    if (handoff.linkedPrs?.length > 0) {
                        list.list(`linked_prs_for_${sanitizeToonScalar(handoff.id, 40)}`, handoff.linkedPrs.slice(0, 10), (prList, linkedPr: any) => {
                            prList.itemObject([
                                { key: 'repo', value: linkedPr.repoFullName, maxLength: 120 },
                                { key: 'pr', value: linkedPr.prNumber },
                                { key: 'status', value: linkedPr.status, maxLength: 40 },
                            ])
                        })
                    }
                })
                telemetry.handoffs = visibleHandoffs.length
            }
        })

        writer.separator()

        flush()
        return telemetry
    }

    private static tokenizeForPromptSelection(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((token) => token.length > 2)
    }

    private static selectRelevantTextSections(source: string, hints: string[], maxChars: number, maxSections = 8): { text: string; sectionCount: number } {
        if (!source.trim()) return { text: '', sectionCount: 0 }

        const sections = source
            .split(/\n{2,}/)
            .map((section) => section.trim())
            .filter(Boolean)

        if (sections.length === 0) return { text: '', sectionCount: 0 }

        const hintTokens = new Set(hints.flatMap((hint) => GeminiService.tokenizeForPromptSelection(hint)))
        const scored = sections.map((section, index) => {
            const tokens = GeminiService.tokenizeForPromptSelection(section)
            const overlap = tokens.reduce((sum, token) => sum + (hintTokens.has(token) ? 1 : 0), 0)
            return { section, index, score: overlap, length: section.length }
        })

        scored.sort((a, b) => b.score - a.score || a.index - b.index)

        const selected: string[] = []
        let usedChars = 0
        for (const candidate of scored.slice(0, Math.max(maxSections * 2, maxSections))) {
            if (selected.length >= maxSections) break
            if (usedChars >= maxChars) break

            const remaining = maxChars - usedChars
            if (remaining <= 0) break

            const snippet = candidate.section.length > remaining ? `${candidate.section.slice(0, Math.max(0, remaining - 3))}...` : candidate.section
            if (!snippet.trim()) continue

            selected.push(snippet)
            usedChars += snippet.length + 2
        }

        if (selected.length === 0) {
            const fallback = source.slice(0, maxChars)
            return { text: fallback, sectionCount: fallback.trim() ? 1 : 0 }
        }

        return { text: selected.join('\n\n'), sectionCount: selected.length }
    }

    private static buildExcerptWindow(source: string, hints: string[], maxChars = 1800): string {
        const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
        if (!normalized) return ''
        if (normalized.length <= maxChars) return normalized

        const terms = Array.from(new Set(
            hints
                .flatMap((hint) => GeminiService.tokenizeForPromptSelection(hint))
                .filter((term) => term.length >= 4),
        )).sort((a, b) => b.length - a.length)

        const lower = normalized.toLowerCase()
        let matchIndex = -1
        for (const term of terms) {
            const index = lower.indexOf(term)
            if (index >= 0) {
                matchIndex = index
                break
            }
        }

        if (matchIndex < 0) {
            return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`
        }

        const halfWindow = Math.floor(maxChars / 2)
        let start = Math.max(0, matchIndex - halfWindow)
        let end = Math.min(normalized.length, start + maxChars)
        if (end - start < maxChars) {
            start = Math.max(0, end - maxChars)
        }

        const prefix = start > 0 ? '...' : ''
        const suffix = end < normalized.length ? '...' : ''
        return `${prefix}${normalized.slice(start, end).trim()}${suffix}`
    }

    // ── Prompt Builders ──────────────────────────────────────────────────────
    // Each builder returns { system, user } so role/rules go into systemInstruction
    // and actual data goes into the user turn — improving instruction adherence.

    static buildToonPrompt(task: any, comments: any[] = [], project?: any, attachedImageCount: number = 0): PromptBuildResult {
        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:deep_issue_analysis')
        sysLines.push('@perspective:qa_engineer—focus on testability,reproducibility,regression_risk,environment_impact')
        sysLines.push('@out_fmt:md_sections[## Root Cause Analysis,## Impact Assessment,## Suggested Fix,## Prevention Recommendations]')
        sysLines.push('@rules:all_sections_required|multi_sentence|specific_actionable|infer_if_brief|no_skip|no_merge|consider_env_context|reference_project_functionality|use_tables_for_structured_data|bold_key_findings')
        sysLines.push('@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|tc_priorities(Blocker,Major,Medium,Low)')

        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...GeminiService.appendQaContext(user, project, {
                includeTrackedIssues: true,
                trackedIssuesMax: 12,
                includeTestCoverage: false,
                includeChecklistAreas: false,
                includeTestDataDomains: false,
            }),
        }

        user.object('issue', (issue) => {
            issue.field('t', task.title, { maxLength: 300 })
            issue.field('id', task.sourceIssueId, { maxLength: 100 })
            issue.field('status', task.status, { maxLength: 40 })
            issue.field('priority', task.priority, { maxLength: 20 })
            issue.field('assignee', task.assignee, { maxLength: 200 })
            issue.field('labels', task.labels, { maxLength: 200 })
            issue.field('due', task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '', { maxLength: 32 })
            issue.field('desc', task.description || '(none; infer from title+metadata)', { maxLength: 500 })
        })
        /*
            issue.field('desc', task.description || '(noneâ€”infer from title+metadata)', { maxLength: 500 })
        userLines.push(` desc:${task.description ? GeminiService.sanitizeToonValue(task.description) : '(none—infer from title+metadata)'}`)
        userLines.push('}')

        */
        if (comments.length > 0) {
            telemetry.issue_comments = GeminiService.pushCommentList(user, 'comments', comments, 8)
        }

        const images = task.attachmentUrls?.length || 0
        const totalImages = Math.max(attachedImageCount, images)

        if (totalImages > 0) {
            user.field('attachment_image_count', totalImages)
            telemetry.attachment_images = totalImages
            /*
            userLines.push(`@media:${totalImages}_image(s)_attached—analyze following visual content for additional context (screenshots, error messages, UI state, logs)`)
        }

        */
        }
        if (project?.contextTasks?.length > 0) {
            user.separator()
            user.list('project_context_tasks', project.contextTasks.slice(0, 8), (list, contextTask: any) => {
                list.itemObject([
                    { key: 't', value: contextTask.title, maxLength: 200 },
                    { key: 'type', value: contextTask.issueType, maxLength: 60 },
                    { key: 'labels', value: contextTask.labels, maxLength: 100 },
                    { key: 'desc', value: contextTask.description, maxLength: 300 },
                ])
            })
            telemetry.context_tasks = Math.min(project.contextTasks.length, 8)
        }

        return { system: sysLines.join('\n'), user: user.toString(), telemetry }
    }

    static buildTestCaseGenerationPrompt(tasks: any[], sourceName: string, project?: any, designDoc?: string, comments?: Record<string, any[]>): PromptBuildResult {
        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:generate_test_cases')
        sysLines.push('@perspective:qa_engineer—generate functional and integration tests specifically covering the provided issues')
        sysLines.push(`@source:${sourceName}`)
        sysLines.push('@out_fmt:json_array[{testCaseId,title,preConditions,testSteps,testData,expectedResult,priority,sourceIssueId}]')
        sysLines.push('@rules:comprehensive|all_fields_required|specific_actionable|realistic_test_data|cover_positive_negative_edge|no_generic|env_aware|use_known_test_data_when_applicable|focus_only_on_provided_issues|exclude_general_regression_or_smoke_tests')
        sysLines.push('@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|output_priority_must_be_one_of(Blocker,Major,Medium,Low)')
        if (designDoc) {
            sysLines.push('@extra_context:design_document_provided—use it to improve accuracy,coverage,and specificity of generated test cases')
        }
        sysLines.push('field_spec{')
        sysLines.push(' testCaseId:sequential(TC-001,TC-002,...)')
        sysLines.push(' title:clear_descriptive')
        sysLines.push(' preConditions:state_before_execution')
        sysLines.push(' testSteps:numbered_step_by_step')
        sysLines.push(' testData:specific_values')
        sysLines.push(' expectedResult:pass_criteria')
        sysLines.push(' priority:one_of(Blocker,Major,Medium,Low)_based_on_issue_severity_and_impact')
        sysLines.push(' sourceIssueId:exact_id_of_the_source_issue_this_test_case_covers(IssueIdentifier_field_value)')
        sysLines.push('}')

        const user = new ToonWriter()
        // Exclude tracked_issues from qa_context — the project_issues block below already covers them
        const telemetry: PromptTelemetry = {
            ...GeminiService.appendQaContext(user, project, {
                includeTrackedIssues: false,
                includeTestCoverage: false,
                includeChecklistAreas: false,
                includeTestDataDomains: false,
            }),
            source: sourceName,
            issue_count: Math.min(tasks.length, 50),
        }

        if (designDoc) {
            const hints = tasks.flatMap((task) => [task.title, task.description, task.labels, task.issueType].filter(Boolean))
            const selectedDesignDoc = GeminiService.selectRelevantTextSections(designDoc, hints, 12_000, 8)
            user.object('design_document', (doc) => {
                doc.field('selected_sections', selectedDesignDoc.sectionCount)
                doc.field('content', selectedDesignDoc.text, { style: 'block', maxLength: 12_000 })
            })
            user.separator()
            telemetry.design_doc_sections = selectedDesignDoc.sectionCount
        }

        user.list('project_issues', tasks.slice(0, 50), (list, task) => {
            const issueId = task.sourceIssueId || task.externalId || task.id
            list.itemObject([
                { key: 'id', value: issueId, maxLength: 100 },
                { key: 'title', value: task.title, maxLength: 300 },
                { key: 'status', value: task.status || 'todo', maxLength: 40 },
                { key: 'priority', value: task.priority || 'medium', maxLength: 20 },
                { key: 'desc', value: task.description, maxLength: 1200 },
                { key: 'type', value: task.issueType, maxLength: 100 },
                { key: 'labels', value: task.labels, maxLength: 200 },
                { key: 'has_images', value: task.attachmentUrls?.length ? `${task.attachmentUrls.length}` : undefined, maxLength: 10 },
            ])

            const issueComments = comments?.[issueId]?.slice(0, 5) || []
            if (issueComments.length > 0) {
                list.list(`issue_comments_for_${sanitizeToonScalar(issueId, 30)}`, issueComments, (commentList, comment) => {
                    commentList.itemObject([
                        { key: 'author', value: comment.authorName, maxLength: 100 },
                        { key: 'body', value: comment.body, maxLength: 500 },
                    ])
                })
            }
        })

        return { system: sysLines.join('\n'), user: user.toString(), telemetry }
    }

    static buildCriticalityAssessmentPrompt(tasks: any[], testPlans: any[], executions: any[], project?: any): { system: string; user: string } {
        const allCases = testPlans.flatMap(tp => tp.testCases || [])

        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:criticality_assessment')
        sysLines.push('@perspective:qa_engineer—assess release risk from QA standpoint considering environment health,test coverage gaps,checklist completion,blocker density')
        sysLines.push('@out_fmt:md_sections[## Failure Summary by Priority,## Overall Risk Level,## Key Areas of Concern,## Recommended Actions,## Release Readiness]')
        sysLines.push('@rules:concise|actionable|data_driven|risk_focused|all_sections_required|include_counts_per_priority(Blocker,Major,Medium,Low)|risk_level_one_of(Critical,High,Moderate,Low)|actions_ordered_by_severity|no_skip|no_merge|factor_env_coverage|factor_checklist_gaps')
        sysLines.push('@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|tc_priorities(blocker,major,medium,low)')

        const userLines: string[] = []
        GeminiService.appendQaContext(userLines, project, {
            includeTrackedIssues: false,
            includeTestCoverage: false,
            includeChecklistAreas: true,
            includeTestDataDomains: false,
        })

        const failedCases = allCases.filter((tc: any) => tc.status === 'failed')
        const blockerFailed = failedCases.filter((tc: any) => tc.priority === 'blocker').length
        const majorFailed = failedCases.filter((tc: any) => tc.priority === 'major').length
        const mediumFailed = failedCases.filter((tc: any) => tc.priority === 'medium').length
        const lowFailed = failedCases.filter((tc: any) => tc.priority === 'low').length

        userLines.push('failure_summary{')
        userLines.push(` total_test_cases:${allCases.length}`)
        userLines.push(` total_failed:${failedCases.length}`)
        userLines.push(` blocker_failed:${blockerFailed}`)
        userLines.push(` major_failed:${majorFailed}`)
        userLines.push(` medium_failed:${mediumFailed}`)
        userLines.push(` low_failed:${lowFailed}`)
        userLines.push(` total_executions:${executions.length}`)
        userLines.push(` total_test_plans:${testPlans.length}`)
        userLines.push('}')
        userLines.push('---')

        if (testPlans.length > 0) {
            userLines.push('test_plans[')
            for (const plan of testPlans.slice(0, 20)) {
                const planCases = plan.testCases || []
                const planFailed = planCases.filter((tc: any) => tc.status === 'failed').length
                userLines.push(` {name:${GeminiService.sanitizeToonValue(plan.name, 200)},total:${planCases.length},failed:${planFailed},source:${GeminiService.sanitizeToonValue(plan.source, 60)}}`)
            }
            userLines.push(']')
            userLines.push('---')
        }

        if (tasks.length > 0) {
            userLines.push('project_tasks[')
            for (const task of tasks.slice(0, 50)) {
                let entry = ` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId, 100)},title:${GeminiService.sanitizeToonValue(task.title, 300)},status:${task.status},priority:${task.priority}`
                if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 100)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }

        if (failedCases.length > 0) {
            userLines.push('failed_test_cases[')
            for (const tc of failedCases.slice(0, 50)) {
                let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 100)},title:${GeminiService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority},source:${tc.source || 'Manual'}`
                if (tc.actualResult) entry += `,actual_result:${GeminiService.sanitizeToonValue(tc.actualResult, 200)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }

        if (executions && executions.length > 0) {
            const resultGroups = executions.reduce((acc: any, e: any) => {
                acc[e.result] = (acc[e.result] || 0) + 1
                return acc
            }, {})
            const groupStrs = Object.entries(resultGroups).map(([k, v]) => `${k}:${v}`)
            userLines.push(`exec_results{${groupStrs.join(',')}}`)
        }

        return { system: sysLines.join('\n'), user: userLines.join('\n') }
    }

    static buildTestRunSuggestionsPrompt(testPlans: any[], executions: any[], project?: any): { system: string; user: string } {
        const allCases = testPlans.flatMap(tp => tp.testCases || [])
        const total = allCases.length
        const passed = allCases.filter((tc: any) => tc.status === 'passed').length
        const failed = allCases.filter((tc: any) => tc.status === 'failed').length
        const blocked = allCases.filter((tc: any) => tc.status === 'blocked').length
        const skipped = allCases.filter((tc: any) => tc.status === 'skipped').length
        const notRun = allCases.filter((tc: any) => tc.status === 'not-run').length
        const passRate = total > 0 ? (passed / total * 100).toFixed(1) : '0.0'

        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:test_run_suggestions')
        sysLines.push('@perspective:qa_engineer—give specific,actionable QA gate and deployment suggestions based on test run results,pass rates per plan,and failed test case impact')
        sysLines.push('@out_fmt:md_sections[## Overall Status,## Deployment Readiness,## Key Risks,## Suggestions]')
        sysLines.push('@rules:concise|specific|data_driven|bold_decisions|deployment_verdict_prominent|reference_failing_areas|no_generic_advice|all_sections_required|suggestions_imperative_sentences_referencing_actual_data')
        sysLines.push('@example_output:Do not deploy to UAT — 3 blocker failures in the Checkout UI module|Retest Payment flow before promoting to staging — 2 major failures detected|UI regression suite is at 45% pass rate — address before UAT')
        sysLines.push('@priority_mapping:tc_priorities(blocker,major,medium,low)')

        const userLines: string[] = []
        GeminiService.appendQaContext(userLines, project, {
            includeTrackedIssues: false,
            includeTestCoverage: false,
            includeChecklistAreas: false,
            includeTestDataDomains: false,
        })

        userLines.push('overall_stats{')
        userLines.push(` total_cases:${total}`)
        userLines.push(` passed:${passed}`)
        userLines.push(` failed:${failed}`)
        userLines.push(` blocked:${blocked}`)
        userLines.push(` skipped:${skipped}`)
        userLines.push(` not_run:${notRun}`)
        userLines.push(` pass_rate:${passRate}%`)
        userLines.push(` total_executions:${executions.length}`)
        userLines.push('}')

        if (testPlans.length > 0) {
            userLines.push('plan_results[')
            for (const plan of testPlans.slice(0, 20)) {
                const planCases = plan.testCases || []
                const planTotal = planCases.length
                const planPassed = planCases.filter((tc: any) => tc.status === 'passed').length
                const planFailed = planCases.filter((tc: any) => tc.status === 'failed').length
                const planBlocked = planCases.filter((tc: any) => tc.status === 'blocked').length
                const planRate = planTotal > 0 ? (planPassed / planTotal * 100).toFixed(1) : '0.0'
                userLines.push(` {name:${GeminiService.sanitizeToonValue(plan.name, 200)},total:${planTotal},passed:${planPassed},failed:${planFailed},blocked:${planBlocked},pass_rate:${planRate}%,source:${plan.source || 'Manual'}}`)
            }
            userLines.push(']')
        }

        const failedCases = allCases.filter((tc: any) => tc.status === 'failed')
        if (failedCases.length > 0) {
            userLines.push('failed_cases[')
            for (const tc of failedCases.slice(0, 50)) {
                let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 100)},title:${GeminiService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority}`
                if (tc.sapModule) entry += `,module:${tc.sapModule}`
                if (tc.actualResult) entry += `,actual:${GeminiService.sanitizeToonValue(tc.actualResult, 200)}`
                if (tc.sourceIssueId) entry += `,issue:${GeminiService.sanitizeToonValue(tc.sourceIssueId, 60)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }

        const blockedCases = allCases.filter((tc: any) => tc.status === 'blocked')
        if (blockedCases.length > 0) {
            userLines.push('blocked_cases[')
            for (const tc of blockedCases.slice(0, 20)) {
                let entry = ` {title:${GeminiService.sanitizeToonValue(tc.title, 200)},priority:${tc.priority}`
                if (tc.sapModule) entry += `,module:${tc.sapModule}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }

        if (executions && executions.length > 0) {
            const resultGroups = executions.reduce((acc: any, e: any) => {
                acc[e.result] = (acc[e.result] || 0) + 1
                return acc
            }, {})
            const groupStrs = Object.entries(resultGroups).map(([k, v]) => `${k}:${v}`)
            userLines.push(`exec_results{${groupStrs.join(',')}}`)
        }

        return { system: sysLines.join('\n'), user: userLines.join('\n') }
    }

    static buildSmokeSubsetPrompt(candidates: any[], doneTasks: any[], project?: any): { system: string; user: string } {
        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:smoke_subset_selection')
        sysLines.push('@goal:minimal_tc_set_max_regression_coverage')
        sysLines.push('@out_fmt:json_array_of_strings')
        sysLines.push('@out_rules:raw_json_only|no_wrap|ids_only|max_30')
        sysLines.push('@sel_rules:prefer(B>MAJ>MED>L)|cover_distinct_areas|no_dupes|exact_ids')
        sysLines.push('@schema:t=title|p=priority(B=Blocker,MAJ=Major,MED=Medium,L=Low)|s=status(F=Failed,P=Passed,BL=Blocked,SK=Skipped)|iss=source_issue_id')
        sysLines.push('@priority_mapping:task_priorities(critical=B,high=MAJ,medium=MED,low=L)|tc_priorities(blocker=B,major=MAJ,medium=MED,low=L)')

        const userLines: string[] = []
        GeminiService.appendQaContext(userLines, project, {
            includeTrackedIssues: false,
            includeTestCoverage: false,
            includeChecklistAreas: false,
            includeTestDataDomains: false,
        })

        if (doneTasks.length > 0) {
            userLines.push('done[')
            for (const task of doneTasks.slice(0, 50)) {
                const p = task.priority === 'critical' ? 'B' : task.priority === 'high' ? 'MAJ' : task.priority === 'medium' ? 'MED' : 'L'
                userLines.push(` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 60)},t:${GeminiService.sanitizeToonValue(task.title, 120)},p:${p}}`)
            }
            userLines.push(']')
        }

        userLines.push('tc[')
        for (const tc of candidates.slice(0, 200)) {
            const p = tc.priority === 'blocker' ? 'B' : tc.priority === 'major' ? 'MAJ' : tc.priority === 'medium' ? 'MED' : 'L'
            const sMap: Record<string, string> = { failed: 'F', passed: 'P', blocked: 'BL', skipped: 'SK' }
            let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 50)},t:${GeminiService.sanitizeToonValue(tc.title, 100)},p:${p}`
            if (tc.status !== 'not-run' && sMap[tc.status]) entry += `,s:${sMap[tc.status]}`
            if (tc.sourceIssueId) entry += `,iss:${GeminiService.sanitizeToonValue(tc.sourceIssueId, 60)}`
            entry += '}'
            userLines.push(entry)
        }
        userLines.push(']')

        return { system: sysLines.join('\n'), user: userLines.join('\n') }
    }

    // ── JSON Extraction ──────────────────────────────────────────────────────

    private static extractFirstJsonArray(text: string): string | null {
        // Strip markdown code blocks
        let json = text.trim()
        if (json.startsWith('```')) {
            const start = json.indexOf('\n')
            if (start >= 0) {
                const end = json.lastIndexOf('```')
                if (end > start) json = json.substring(start + 1, end).trim()
            }
        }

        const start = json.indexOf('[')
        if (start < 0) return null

        let depth = 0
        let inString = false
        let escape = false

        for (let i = start; i < json.length; i++) {
            const c = json[i]
            if (escape) { escape = false; continue }
            if (c === '\\') { escape = true; continue }
            if (c === '"') { inString = !inString; continue }
            if (inString) continue
            if (c === '[') depth++
            else if (c === ']') {
                depth--
                if (depth === 0) return json.substring(start, i + 1)
            }
        }
        return null
    }

    // ── Public API methods ───────────────────────────────────────────────────

    /** Analyze a task issue using TOON prompts */
    async analyzeIssue(task: any, comments: any[] = [], project?: any, attachedImageCount: number = 0, modelName?: string): Promise<string> {
        const { system, user, telemetry } = GeminiService.buildToonPrompt(task, comments, project, attachedImageCount)
        return await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.issue_analysis, system, false, 'issue_analysis', telemetry)
    }

    /** Generate test cases from tasks using TOON prompts with native JSON mode */
    async generateTestCases(tasks: any[] = [], sourceName: string, project?: any, designDoc?: string, modelName?: string, comments?: Record<string, any[]>): Promise<any[]> {
        const { system, user, telemetry } = GeminiService.buildTestCaseGenerationPrompt(tasks || [], sourceName, project, designDoc, comments)
        // jsonMode=true forces the API to return valid JSON — no extraction needed
        const text = await this.executeWithFallback(user, modelName, 0.4, MAX_TOKENS.test_generation, system, true, 'test_generation', telemetry)

        // JSON mode guarantees valid JSON, but we still parse safely
        let parsed: any[]
        try {
            const raw = JSON.parse(text)
            // The model may return the array directly or wrapped in an object
            parsed = Array.isArray(raw) ? raw : (Array.isArray(raw?.testCases) ? raw.testCases : null)
            if (!parsed) throw new Error('not_array')
        } catch {
            // Fallback: try extracting from text if JSON mode produced unexpected wrapping
            const extracted = GeminiService.extractFirstJsonArray(text)
            if (!extracted) {
                console.error('[GeminiService] Failed to parse JSON. Raw response:', text.substring(0, 500));
                throw `Could not parse JSON array from model response. Raw Response: \n${text.substring(0, 500)}`;
            }
            try { parsed = JSON.parse(extracted) } catch { throw 'Model returned invalid JSON for test cases' }
        }
        if (!Array.isArray(parsed)) throw 'Model returned unexpected structure for test cases (expected array)'

        // Priority normalization: model outputs Blocker/Major/Medium/Low — map to internal scale
        const PRIORITY_MAP: Record<string, string> = {
            blocker: 'critical', major: 'high', medium: 'medium', low: 'low',
            critical: 'critical', high: 'high', // pass-through if model uses task scale
        }
        return parsed.map((item: any, i: number) => {
            if (typeof item !== 'object' || item === null) throw `Invalid test case at index ${i}`
            const rawPriority = String(item.priority || 'medium').toLowerCase()
            const priority = PRIORITY_MAP[rawPriority] || 'medium'
            return {
                testCaseId: String(item.testCaseId || `TC-${String(i + 1).padStart(3, '0')}`).substring(0, 50),
                title: String(item.title || `Test Case ${i + 1}`).substring(0, 300),
                preConditions: String(item.preConditions || '').substring(0, 2000),
                steps: String(item.testSteps || item.steps || '').substring(0, 5000),
                testData: String(item.testData || '').substring(0, 2000),
                expectedResult: String(item.expectedResult || '').substring(0, 2000),
                priority: priority as any,
                sourceIssueId: String(item.sourceIssueId || '').substring(0, 100),
                sapModule: item.sapModule ? String(item.sapModule).substring(0, 100) : undefined,
            }
        })
    }

    /** Criticality assessment for the current test state */
    async assessCriticality(tasks: any[], testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const { system, user } = GeminiService.buildCriticalityAssessmentPrompt(tasks, testPlans, executions, project)
        return await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.criticality, system, false, 'criticality', {
            issue_count: Math.min(tasks.length, 50),
            test_plan_count: Math.min(testPlans.length, 20),
            execution_count: executions.length,
        })
    }

    /** Test run suggestions / deployment readiness */
    async getTestRunSuggestions(testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const { system, user } = GeminiService.buildTestRunSuggestionsPrompt(testPlans, executions, project)
        return await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.suggestions, system, false, 'test_run_suggestions', {
            test_plan_count: Math.min(testPlans.length, 20),
            execution_count: executions.length,
        })
    }

    /** Select a minimal smoke test subset from candidates using JSON mode */
    async selectSmokeSubset(candidates: any[], doneTasks: any[], project?: any, modelName?: string): Promise<string[]> {
        const { system, user } = GeminiService.buildSmokeSubsetPrompt(candidates, doneTasks, project)
        // jsonMode=true guarantees a valid JSON array response
        const text = await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.smoke_subset, system, true, 'smoke_subset', {
            candidate_count: Math.min(candidates.length, 200),
            done_task_count: Math.min(doneTasks.length, 50),
        })

        let parsed: any[]
        try {
            parsed = JSON.parse(text)
        } catch {
            const extracted = GeminiService.extractFirstJsonArray(text)
            if (!extracted) return []
            try { parsed = JSON.parse(extracted) } catch { return [] }
        }
        if (!Array.isArray(parsed)) return []
        return parsed.filter((v: any) => typeof v === 'string').map((v: string) => v.substring(0, 100))
    }

    /** Strategic project analysis using TOON prompts */
    async analyzeProject(projectContext: string, project?: any, modelName?: string): Promise<string> {
        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:project_strategic_analysis')
        sysLines.push('@perspective:qa_engineer—strategic,holistic view of project health and risk')
        sysLines.push('@out_fmt:md_sections[## Strategic Gaps,## Coverage Optimization,## Risk Assessment]')
        sysLines.push('@rules:strategic|actionable|data_driven|bold_decisions|no_generic_advice|all_sections_required|use_tables_for_structured_data|bold_key_findings')
        sysLines.push('@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)')

        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...GeminiService.appendQaContext(user, project, {
                includeTrackedIssues: false,
            }),
            context_chars: Math.min(projectContext.length, 5000),
        }
        user.object('analysis_context_and_data', (analysis) => {
            analysis.field('context', projectContext, { style: 'block', maxLength: 5000 })
        })

        return await this.executeWithFallback(user.toString(), modelName, 0.4, MAX_TOKENS.project_analysis, sysLines.join('\n'), false, 'project_analysis', telemetry)
    }

    /** Freeform conversational QA chat using multi-turn Gemini chat API */
    async chat(
        userMessage: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        role: 'qa' | 'dev' = 'qa',
        project?: any,
        modelName?: string
    ): Promise<string> {
        const sysLines: string[] = []
        const user = new ToonWriter()
        const telemetry: PromptTelemetry = { role }
        const hasSapContext = project?.sapCommerce?.enabled === true

        if (role === 'dev') {
            sysLines.push('@role:sr_software_engineer')
            sysLines.push('@task:freeform_dev_assistant_chat')
            sysLines.push('@perspective:software_engineer—helpful,concise,context-aware developer focused on implementation,risk,release_readiness,and code review coordination')
            sysLines.push('@rules:conversational|specific|implementation_focused|reference_handoff_and_pr_context_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context')
            sysLines[sysLines.length - 2] = hasSapContext
                ? '@perspective:qa_engineerâ€”helpful,concise,context-aware QA expert with SAP Commerce knowledge when project context indicates it'
                : '@perspective:qa_engineerâ€”helpful,concise,context-aware QA expert; do_not_assume_SAP_Commerce_without_explicit_context'
            sysLines[sysLines.length - 1] = '@rules:conversational|helpful|specific|reference_project_data_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context|assume_domain_only_from_provided_context'
            sysLines[sysLines.length - 2] = '@perspective:software_engineerâ€”helpful,concise,context-aware developer focused on implementation,risk,release_readiness,and code review coordination'
            sysLines[sysLines.length - 1] = '@rules:conversational|specific|implementation_focused|reference_handoff_and_pr_context_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context'
            if (project) {
                Object.assign(telemetry, GeminiService.appendDevContext(user, project, {
                    trackedWorkMax: 20,
                    handoffMax: 12,
                }))
            }
        } else {
            sysLines.push('@role:sr_qa_engineer')
            sysLines.push('@task:freeform_qa_assistant_chat')
            sysLines.push('@perspective:qa_engineer—helpful,concise,context-aware QA expert with deep SAP Commerce knowledge')
            sysLines.push('@rules:conversational|helpful|specific|reference_project_data_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context')
            sysLines[sysLines.length - 2] = hasSapContext
                ? '@perspective:qa_engineerâ€”helpful,concise,context-aware QA expert with SAP Commerce knowledge when project context indicates it'
                : '@perspective:qa_engineerâ€”helpful,concise,context-aware QA expert; do_not_assume_SAP_Commerce_without_explicit_context'
            sysLines[sysLines.length - 1] = '@rules:conversational|helpful|specific|reference_project_data_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context|assume_domain_only_from_provided_context'
            if (project) {
                Object.assign(telemetry, GeminiService.appendQaContext(user, project, {
                    trackedIssuesMax: 15,
                }))
            }
        }
        user.object('user_request', (request) => {
            request.field('message', userMessage, { style: 'block', maxLength: 3000 })
        })
        const systemInstruction = sysLines.join('\n')
        const requestPayload = user.toString()

        // Budget 12k tokens across history turns, keeping the most recent turns in full.
        // Older turns are dropped first to preserve coherence of the recent conversation.
        const HISTORY_TOKEN_BUDGET = 12000
        const CHARS_PER_TOKEN = 4
        const historyCharBudget = HISTORY_TOKEN_BUDGET * CHARS_PER_TOKEN

        const recentTurns = history
            .filter(turn => ['user', 'assistant'].includes(turn.role))
            .slice(-12) // candidate window — will be trimmed by budget below
        let budgetRemaining = historyCharBudget
        const budgetedTurns: typeof recentTurns = []
        for (let i = recentTurns.length - 1; i >= 0; i--) {
            const len = recentTurns[i].content.length
            if (budgetRemaining <= 0) break
            budgetedTurns.unshift(recentTurns[i])
            budgetRemaining -= len
        }
        telemetry.history_turns = budgetedTurns.length

        const geminiHistory = budgetedTurns.map(turn => ({
            role: turn.role === 'user' ? 'user' : 'model' as 'user' | 'model',
            parts: [{
                text: `chat_turn${new ToonWriter().inlineObject([
                    { key: 'role', value: turn.role, maxLength: 16 },
                    { key: 'message', value: turn.content, style: 'block', maxLength: 2000 },
                ])}`,
            }]
        }))

        const models = this.buildModelSequence(modelName)
        let lastError: any

        for (const currentModelName of models) {
            try {
                const model = this.getModel(currentModelName, 0.7, MAX_TOKENS.chat, systemInstruction)
                const chatSession = model.startChat({ history: geminiHistory })
                const result = await chatSession.sendMessage(requestPayload)

                if (currentModelName !== this.preferredModel) {
                    log.info(`Gemini switching preferred model to ${currentModelName} after successful response`)
                    this.preferredModel = currentModelName
                }

                const usage = result.response.usageMetadata
                GeminiService.logUsage(currentModelName, usage, 'chat', telemetry)

                return result.response.text()
            } catch (err: any) {
                lastError = err
                const { errorMsg, errorStatus } = this.extractErrorInfo(err)
                const { isRateLimit, isUnavailable } = this.classifyError(errorStatus, errorMsg)

                if (isRateLimit || isUnavailable) {
                    console.warn(`Gemini chat model ${currentModelName} ${isRateLimit ? 'rate limited' : 'unavailable'}. Trying next fallback...`)
                    if (currentModelName === this.preferredModel) {
                        const nextIndex = (models.indexOf(currentModelName) + 1) % models.length
                        this.preferredModel = models[nextIndex]
                    }
                    continue
                }
                console.error(`Gemini chat model ${currentModelName} failed:`, `${errorStatus} ${errorMsg}`.toLowerCase())
                continue
            }
        }

        throw `Gemini Chat API Error: ${this.buildFinalErrorMessage(lastError)}`
    }

    // ── AI Accuracy Testing ──────────────────────────────────────────────────

    /**
     * Strips markdown code fences and parses JSON.
     * If the JSON is truncated (model hit token limit), attempts to repair it
     * by closing any open arrays/objects before parsing.
     */
    private static parseJsonResponse(raw: string): any {
        // Strip markdown fences (```json ... ``` or ``` ... ```)
        let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

        // First try parsing as-is
        try { return JSON.parse(s) } catch { /* fall through to repair */ }

        // Extract the outermost JSON structure if there's surrounding text
        const match = s.match(/(\[[\s\S]*|\{[\s\S]*)/)
        if (match) s = match[1]

        // Repair truncated JSON: track open brackets/braces and close them
        s = GeminiService.repairTruncatedJson(s)

        try {
            return JSON.parse(s)
        } catch (e: any) {
            throw new Error(`Failed to parse Gemini JSON response: ${e.message}`)
        }
    }

    /**
     * Closes unclosed JSON arrays and objects to handle token-limit truncation.
     */
    private static repairTruncatedJson(s: string): string {
        // Remove any trailing incomplete token (partial string, number, key)
        // Find the last complete value by trimming trailing incomplete content
        s = s.replace(/,\s*$/, '')  // trailing comma
        s = s.replace(/:\s*$/, ': null')  // key with no value

        // Close any unterminated string — find last unescaped quote
        const quoteCount = (s.match(/(?<!\\)"/g) || []).length
        if (quoteCount % 2 !== 0) {
            s = s + '"'
        }

        // Track open structures and close them in reverse order
        const stack: string[] = []
        let inString = false
        for (let i = 0; i < s.length; i++) {
            const ch = s[i]
            const prev = i > 0 ? s[i - 1] : ''
            if (ch === '"' && prev !== '\\') {
                inString = !inString
            } else if (!inString) {
                if (ch === '[' || ch === '{') stack.push(ch)
                else if (ch === ']' || ch === '}') stack.pop()
            }
        }

        // Close in reverse
        for (let i = stack.length - 1; i >= 0; i--) {
            s += stack[i] === '[' ? ']' : '}'
        }

        return s
    }

    /**
     * Extracts atomic, independently verifiable claims from an AI agent's response.
     */
    async extractClaims(agentResponse: string, modelOverride?: string, expectedAnswer?: string): Promise<Array<{ claimText: string; claimType: string }>> {
        const sysLines: string[] = []
        sysLines.push('@role:claim_extractor')
        sysLines.push('@task:extract_atomic_verifiable_claims')
        sysLines.push('@rules:atomic_self_contained|no_pronouns|skip_filler_hedging_greetings_meta|3_to_15_claims|claimType_one_of(factual,procedural,definitional,numerical)')
        if (expectedAnswer?.trim()) {
            sysLines.push('@expected_answer_guidance:if_expected_answer_present_prioritise_claims_that_differ_from_or_contradict_it_as_these_are_most_diagnostically_valuable')
        }
        sysLines.push('@out_fmt:json_array[{claimText:string,claimType:string}]')

        const user = new ToonWriter()
        user.object('agent_response', (response) => {
            response.field('text', agentResponse, { style: 'opaque', maxLength: 8000 })
        })
        if (expectedAnswer?.trim()) {
            user.object('expected_answer', (expected) => {
                expected.field('text', expectedAnswer, { style: 'opaque', maxLength: 3000 })
            })
        }

        const raw = await this.executeWithFallback(
            user.toString(),
            modelOverride,
            0,
            MAX_TOKENS.claim_extraction,
            sysLines.join('\n'),
            true,
            'claim_extraction',
            {
                expected_answer: Boolean(expectedAnswer?.trim()),
                agent_chars: Math.min(agentResponse.length, 8000),
            },
        )
        const parsed = GeminiService.parseJsonResponse(raw)
        return Array.isArray(parsed) ? parsed : []
    }

    /**
     * Verifies a list of claims against reference document chunks.
     */
    async verifyClaims(
        claims: Array<{ claimText: string; claimType: string }>,
        refChunks: Array<{ id: string; content: string }>,
        modelOverride?: string,
        expectedAnswer?: string
    ): Promise<Array<{ claimIndex: number; verdict: string; confidence: number; sourceChunkIds: string[]; reasoning: string }>> {
        const sysLines: string[] = []
        sysLines.push('@role:evidence_verifier')
        sysLines.push('@task:verify_claims_strictly_against_reference_docs_only')
        if (expectedAnswer?.trim()) {
            sysLines.push('@ground_truth:ref_docs_and_expected_answer_are_sources_of_truth|expected_answer_takes_precedence_over_ref_docs_when_both_present|no_outside_knowledge|no_assumptions')
        } else {
            sysLines.push('@ground_truth:ref_docs_are_sole_source_of_truth|no_outside_knowledge|no_assumptions')
        }
        sysLines.push('@verdicts:supported(claim_concept_or_meaning_confirmed_by_docs_or_expected_answer)|contradicted(claim_conflicts_with_docs_or_expected_answer)|partially_supported(sources_confirm_part_but_not_all)|unverifiable(concept_absent_from_all_sources_treat_as_hallucination)')
        sysLines.push('@rules:one_verdict_per_claim|default_to_unverifiable_when_in_doubt|confidence_float_0_to_1|confidence_max_0.5_for_unverifiable|cite_chunk_ids_when_applicable|reasoning_1_to_2_sentences|index_matches_input_order|semantic_match_acceptable_exact_wording_not_required')
        sysLines.push('@out_fmt:json_array[{claimIndex:number,verdict:string,confidence:number,sourceChunkIds:string[],reasoning:string}]')

        const user = new ToonWriter()
        if (expectedAnswer?.trim()) {
            user.object('expected_answer', (expected) => {
                expected.field('text', expectedAnswer, { style: 'opaque', maxLength: 3000 })
            })
            user.separator()
        }

        const excerptHints = [
            ...claims.map((claim) => claim.claimText),
            expectedAnswer || '',
        ]
        user.list('ref_docs', refChunks, (list, chunk) => {
            list.itemObject([
                { key: 'id', value: chunk.id, maxLength: 100 },
                { key: 'content', value: GeminiService.buildExcerptWindow(chunk.content, excerptHints, 1800), style: 'opaque', maxLength: 1800 },
            ])
        })
        user.separator()
        user.list('claims', claims, (list, claim, index) => {
            list.itemObject([
                { key: 'idx', value: index },
                { key: 'text', value: claim.claimText, maxLength: 500 },
                { key: 'type', value: claim.claimType, maxLength: 40 },
            ])
        })

        const raw = await this.executeWithFallback(
            user.toString(),
            modelOverride,
            0,
            MAX_TOKENS.claim_verification,
            sysLines.join('\n'),
            true,
            'claim_verification',
            {
                claim_count: claims.length,
                ref_chunk_count: refChunks.length,
            },
        )
        const parsed = GeminiService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return []

        // Filter sourceChunkIds to only IDs that actually exist in the provided chunks,
        // preventing hallucinated citations from appearing in the UI.
        const validChunkIds = new Set(refChunks.map(c => c.id))
        return parsed.map((item: any) => ({
            ...item,
            sourceChunkIds: Array.isArray(item.sourceChunkIds)
                ? item.sourceChunkIds.filter((id: any) => typeof id === 'string' && validChunkIds.has(id))
                : []
        }))
    }

    /**
     * Scores an agent response on 4 dimensions: factualAccuracy, completeness, faithfulness, relevance.
     */
    async scoreDimensions(
        question: string,
        agentResponse: string,
        claimVerdicts: Array<{ claimText: string; verdict: string; reasoning: string }>,
        refChunks: Array<{ id: string; content: string }>,
        modelOverride?: string,
        expectedAnswer?: string
    ): Promise<{
        factualAccuracy: { score: number; confidence: number; reasoning: string }
        completeness: { score: number; confidence: number; reasoning: string }
        faithfulness: { score: number; confidence: number; reasoning: string }
        relevance: { score: number; confidence: number; reasoning: string }
    }> {
        const sysLines: string[] = []
        sysLines.push('@role:accuracy_scorer')
        sysLines.push('@task:multi_dimension_scoring_of_ai_response_against_reference_docs')
        sysLines.push('@ground_truth:ref_doc_excerpts_are_sole_source_of_truth|no_outside_knowledge|semantic_equivalence_is_sufficient_exact_wording_not_required')
        sysLines.push('@dimensions:factualAccuracy(score_is_precomputed_provide_reasoning_only_do_not_override_score)|completeness(0-100,how_much_key_info_from_docs_relevant_to_question_is_covered)|faithfulness(score_is_precomputed_provide_reasoning_only_do_not_override_score)|relevance(0-100,response_directly_addresses_the_question)')
        sysLines.push('@calibration:score_90_to_100(nearly_all_claims_supported_no_hallucinations_response_is_comprehensive_and_directly_addresses_question)|score_70_to_89(most_claims_supported_minor_gaps_or_imprecisions_response_addresses_question)|score_50_to_69(some_claims_unsupported_or_unverifiable_notable_gaps_partially_addresses_question)|score_0_to_49(many_contradictions_or_unverifiable_claims_major_gaps_misses_or_ignores_question)')
        sysLines.push('@consistency_rules:score_must_align_with_claim_verdict_distribution_not_general_impression')
        sysLines.push('@rules:score_each_dimension_independently|score_int_0_to_100|factualAccuracy_and_faithfulness_scores_are_precomputed_your_score_fields_will_be_ignored|if_expected_answer_present_use_as_primary_ground_truth_above_ref_docs|confidence_float_0_to_1|reasoning_2_to_3_sentences_cite_specific_evidence|all_four_dimensions_required')
        sysLines.push('@out_fmt:json_object{factualAccuracy:{score:int,confidence:float,reasoning:string},completeness:{score:int,confidence:float,reasoning:string},faithfulness:{score:int,confidence:float,reasoning:string},relevance:{score:int,confidence:float,reasoning:string}}')

        const user = new ToonWriter()
        user.object('eval_context', (context) => {
            context.field('question', question, { maxLength: 1000 })
            context.field('agent_response', agentResponse, { style: 'opaque', maxLength: 8000 })
            if (expectedAnswer?.trim()) {
                context.field('expected_answer', expectedAnswer, { style: 'opaque', maxLength: 3000 })
            }
        })
        user.separator()
        user.list('claim_verdicts', claimVerdicts, (list, verdict) => {
            list.itemObject([
                { key: 'claim', value: verdict.claimText, maxLength: 400 },
                { key: 'verdict', value: verdict.verdict, maxLength: 40 },
                { key: 'reasoning', value: verdict.reasoning, maxLength: 200 },
            ])
        })
        user.separator()
        const scoreHints = [
            question,
            agentResponse,
            expectedAnswer || '',
            ...claimVerdicts.map((claim) => claim.claimText),
        ]
        user.list('ref_doc_excerpts', refChunks, (list, chunk) => {
            list.itemObject([
                { key: 'id', value: chunk.id, maxLength: 100 },
                { key: 'content', value: GeminiService.buildExcerptWindow(chunk.content, scoreHints, 1800), style: 'opaque', maxLength: 1800 },
            ])
        })

        const raw = await this.executeWithFallback(
            user.toString(),
            modelOverride,
            0,
            MAX_TOKENS.dimension_scoring,
            sysLines.join('\n'),
            true,
            'dimension_scoring',
            {
                claim_count: claimVerdicts.length,
                ref_chunk_count: refChunks.length,
            },
        )
        const parsed = GeminiService.parseJsonResponse(raw)
        const defaultDim = { score: 0, confidence: 0, reasoning: '' }
        return {
            factualAccuracy: parsed.factualAccuracy ?? defaultDim,
            completeness: parsed.completeness ?? defaultDim,
            faithfulness: parsed.faithfulness ?? defaultDim,
            relevance: parsed.relevance ?? defaultDim,
        }
    }

    /**
     * Re-ranks a candidate set of document chunks by semantic relevance to a question and response.
     * Called after TF-IDF retrieval to promote chunks that keyword scoring may have missed.
     * Returns an ordered array of chunk IDs (most relevant first), capped to topK.
     */
    async rerankChunks(
        question: string,
        agentResponse: string,
        chunks: Array<{ id: string; content: string }>,
        topK: number,
        modelOverride?: string
    ): Promise<string[]> {
        const sysLines: string[] = []
        sysLines.push('@role:relevance_ranker')
        sysLines.push('@task:rank_document_chunks_by_semantic_relevance_to_question_and_response')
        sysLines.push('@rules:rank_by_semantic_meaning_not_keyword_overlap|consider_paraphrases_synonyms_and_implied_concepts|return_only_chunk_ids_in_order_most_relevant_first|omit_chunks_with_zero_relevance|limit_to_top_' + topK)
        sysLines.push('@out_fmt:json_array[string]  // ordered chunk IDs, most relevant first, max ' + topK + ' items')

        const user = new ToonWriter()
        user.object('eval_query', (queryContext) => {
            queryContext.field('question', question, { maxLength: 1000 })
            queryContext.field('agent_response', agentResponse, { style: 'opaque', maxLength: 3000 })
        })
        user.separator()
        user.list('candidate_chunks', chunks, (list, chunk) => {
            list.itemObject([
                { key: 'id', value: chunk.id, maxLength: 100 },
                { key: 'content', value: GeminiService.buildExcerptWindow(chunk.content, [question, agentResponse], 1600), style: 'opaque', maxLength: 1600 },
            ])
        })

        const raw = await this.executeWithFallback(
            user.toString(),
            modelOverride,
            0,
            512,
            sysLines.join('\n'),
            true,
            'chunk_rerank',
            {
                chunk_count: chunks.length,
                top_k: topK,
            },
        )
        const parsed = GeminiService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return chunks.slice(0, topK).map(c => c.id)

        // Validate returned IDs — filter out any hallucinated ones
        const validIds = new Set(chunks.map(c => c.id))
        const ranked = (parsed as any[]).filter((id): id is string => typeof id === 'string' && validIds.has(id))

        // Append any unranked chunks at the end (fallback) up to topK
        const unranked = chunks.map(c => c.id).filter(id => !ranked.includes(id))
        return [...ranked, ...unranked].slice(0, topK)
    }

    /** Generate a concise daily QA standup summary from project metrics */
    async generateStandupSummary(metrics: {
        projectName: string
        date: string
        readyForQa: number
        blocked: number
        failedTests: number
        overdueTasks: number
        recentRuns: Array<{ planName: string; passed: number; total: number }>
        recentlyVerified: string[]
        highPriorityOpen: string[]
    }, modelName?: string): Promise<string> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:daily_standup_summary',
            '@output_format:plain_text_markdown—concise—structured—no_filler',
            '@rules:3_sections_only:Yesterday_Today_Blockers|bullet_points|max_150_words_total|be_specific_not_generic|omit_sections_with_no_items',
        ]

        const user = new ToonWriter()
        user.object('standup_data', (standup) => {
            standup.field('project', metrics.projectName, { maxLength: 100 })
            standup.field('date', metrics.date, { maxLength: 40 })
            standup.field('ready_for_qa_count', metrics.readyForQa)
            standup.field('blocked_tasks', metrics.blocked)
            standup.field('failed_test_cases', metrics.failedTests)
            standup.field('overdue_tasks', metrics.overdueTasks)
        })
        user.separator()
        user.list('recent_runs', metrics.recentRuns.slice(0, 8), (list, run) => {
            list.itemObject([
                { key: 'plan', value: run.planName, maxLength: 120 },
                { key: 'passed', value: run.passed },
                { key: 'total', value: run.total },
            ])
        })
        user.separator()
        user.list('recently_verified', metrics.recentlyVerified.slice(0, 10), (list, item) => {
            list.itemObject([{ key: 'item', value: item, maxLength: 120 }])
        })
        user.separator()
        user.list('high_priority_open', metrics.highPriorityOpen.slice(0, 10), (list, item) => {
            list.itemObject([{ key: 'item', value: item, maxLength: 120 }])
        })
        user.line('produce_standup_summary_for_a_qa_engineer_sharing_status_with_their_team')

        return await this.executeWithFallback(user.toString(), modelName, 0.6, 1024, sysLines.join('\n'), false, 'standup_summary', {
            recent_runs: Math.min(metrics.recentRuns.length, 8),
            recently_verified: Math.min(metrics.recentlyVerified.length, 10),
            high_priority_open: Math.min(metrics.highPriorityOpen.length, 10),
        })
    }

    /** Convert a plain-English question into a SAP Commerce FlexSearch (FlexibleSearch) SQL query */
    async generateFlexSearch(naturalLanguageQuery: string, modelName?: string): Promise<string> {
        const sysLines: string[] = [
            '@role:sap_commerce_flexsearch_expert',
            '@task:natural_language_to_flexsearch',
            '@output_format:raw_flexsearch_sql_only—no_markdown—no_explanation—no_code_block_fences',
            '@rules:output_only_the_select_statement|use_SAP_FlexibleSearch_syntax_with_curly_braces_for_types_and_attributes|qualify_attributes_as_{TypeAlias:attribute}|use_AS_aliases|be_concise|if_unsure_produce_best_effort_query',
        ]
        sysLines.push(SAP_COMMERCE_CONTEXT_BLOCK.substring(0, 3000))

        const userLines: string[] = [
            'natural_language_request{',
            ` query:${GeminiService.sanitizeToonValue(naturalLanguageQuery, 500)}`,
            '}',
            'instructions{',
            ' produce:single_FlexibleSearch_SELECT_statement',
            ' syntax:use_curly_braces_for_type_and_attribute_references_e.g._{Product_AS_p}_{p:code}',
            ' output:raw_SQL_only—no_preamble—no_explanation—no_markdown',
            '}',
        ]

        return await this.executeWithFallback(userLines.join('\n'), modelName, 0.2, 1024, sysLines.join('\n'), false, 'flexsearch_generation', {
            query_chars: Math.min(naturalLanguageQuery.length, 500),
        })
    }

    /** Detect potential duplicate bugs by comparing new bug data against existing open bugs */
    async findDuplicateBugs(
        newBugTitle: string,
        newBugDescription: string,
        newBugReproSteps: string,
        affectedComponents: string[],
        existingBugs: Array<{ id: string; title: string; description: string; components?: string[] }>,
        modelName?: string
    ): Promise<Array<{ bugId: string; title: string; similarityScore: number; reasoning: string }>> {
        if (existingBugs.length === 0) return []

        const sysLines: string[] = [
            '@role:qa_duplicate_detector',
            '@task:find_duplicate_bugs',
            '@out_fmt:json_array[{bugId,title,similarityScore,reasoning}]',
            '@rules:compare_semantically_not_just_keywords|consider_repro_steps_and_components|similarityScore_0_to_100|only_return_bugs_with_score_above_40|max_5_results|order_by_score_desc|reasoning_max_80_chars|return_empty_array_if_no_duplicates',
        ]

        const user = new ToonWriter()
        user.object('new_bug', (bug) => {
            bug.field('title', newBugTitle, { maxLength: 200 })
            bug.field('description', newBugDescription, { maxLength: 400 })
            bug.field('repro_steps', newBugReproSteps, { maxLength: 400 })
            bug.field('components', sanitizeToonList(affectedComponents, 24, 8), { style: 'literal' })
        })
        user.separator()
        user.list('existing_open_bugs', existingBugs.slice(0, 40), (list, bug) => {
            list.itemObject([
                { key: 'bugId', value: bug.id, maxLength: 50 },
                { key: 'title', value: bug.title, maxLength: 200 },
                { key: 'description', value: bug.description, maxLength: 200 },
                { key: 'components', value: sanitizeToonList(bug.components || [], 24, 8), style: 'literal' },
            ])
        })

        const raw = await this.executeWithFallback(user.toString(), modelName, 0.2, 1024, sysLines.join('\n'), true, 'duplicate_bug_detection', {
            existing_bug_count: Math.min(existingBugs.length, 40),
            component_count: Math.min(affectedComponents.length, 8),
        })
        const parsed = GeminiService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return []
        return (parsed as any[]).filter(d => d && typeof d.bugId === 'string').map(d => ({
            bugId: String(d.bugId),
            title: String(d.title || ''),
            similarityScore: Number(d.similarityScore) || 0,
            reasoning: String(d.reasoning || ''),
        })).slice(0, 5)
    }

    /** Analyze a PR using GitHub metadata, changed code, and QA project context */
    async analyzePullRequest(
        pr: {
            number: number
            title: string
            description?: string
            baseBranch: string
            headBranch: string
            ciStatus?: string | null
            mergeableState?: string
            files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>
            reviews?: Array<{ user: string; state: string; submittedAt?: string; body?: string }>
            comments?: Array<{ user: string; body: string; createdAt: string }>
        },
        testCases: Array<{ id: string; title: string; sapModule?: string; components?: string[]; tags?: string[] }>,
        project?: any,
        modelName?: string
    ): Promise<PullRequestAnalysisResult> {
        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:pull_request_analysis',
            '@out_fmt:json{summary:string,riskLevel:low|medium|high|critical,hotspots:{file:string,reason:string}[],affectedAreas:string[],qaChecks:string[],impactedCaseIds:string[],rationale:string}',
            '@rules:analyze_pr_intent_and_changed_code|identify_review_hotspots_and_regression_risk|qaChecks_must_be_actionable_and_specific|hotspots_max_6|affectedAreas_max_8|qaChecks_max_8|summary_max_120_words|rationale_max_240_chars|impactedCaseIds_must_only_reference_ids_from_test_cases|return_empty_impactedCaseIds_if_no_confident_match|still_return_summary_and_qaChecks_when_test_cases_are_empty|be_concise_and_concrete',
        ]

        const user = new ToonWriter()
        const telemetry: PromptTelemetry = {
            ...GeminiService.appendQaContext(user, project, {
                includeTrackedIssues: false,
                includeTestCoverage: false,
                includeChecklistAreas: false,
                includeTestDataDomains: false,
            }),
        }

        const visibleFiles = (pr.files || []).slice(0, 24)
        const patchEligibleFiles = new Set(
            [...visibleFiles]
                .sort((a, b) => (Number(b.changes) || 0) - (Number(a.changes) || 0) || a.filename.localeCompare(b.filename))
                .slice(0, 8)
                .map((file) => file.filename),
        )

        user.object('pr_context', (context) => {
            context.field('number', pr.number)
            context.field('title', pr.title, { maxLength: 200 })
            context.field('description', pr.description || '', { style: 'block', maxLength: 1500 })
            context.field('base_branch', pr.baseBranch, { maxLength: 120 })
            context.field('head_branch', pr.headBranch, { maxLength: 120 })
            context.field('ci_status', pr.ciStatus || 'unknown', { maxLength: 60 })
            context.field('mergeable_state', pr.mergeableState || 'unknown', { maxLength: 60 })
        })
        user.separator()

        user.list('changed_files', visibleFiles, (list, file) => {
            list.itemObject([
                { key: 'filename', value: file.filename, maxLength: 240 },
                { key: 'status', value: file.status, maxLength: 40 },
                { key: 'additions', value: Number(file.additions) || 0 },
                { key: 'deletions', value: Number(file.deletions) || 0 },
                { key: 'changes', value: Number(file.changes) || 0 },
                {
                    key: 'patch',
                    value: patchEligibleFiles.has(file.filename) ? file.patch || '' : undefined,
                    style: 'block',
                    maxLength: 1500,
                },
            ])
        })
        telemetry.file_count = visibleFiles.length
        telemetry.file_patches = patchEligibleFiles.size

        user.separator()
        user.list('reviews', (pr.reviews || []).slice(0, 12), (list, review) => {
            list.itemObject([
                { key: 'user', value: review.user, maxLength: 80 },
                { key: 'state', value: review.state, maxLength: 60 },
                { key: 'submittedAt', value: review.submittedAt || '', maxLength: 80 },
                { key: 'body', value: review.body || '', style: 'block', maxLength: 300 },
            ])
        })

        user.separator()
        user.list('comments', (pr.comments || []).slice(-12), (list, comment) => {
            list.itemObject([
                { key: 'user', value: comment.user, maxLength: 80 },
                { key: 'createdAt', value: comment.createdAt, maxLength: 80 },
                { key: 'body', value: comment.body, style: 'block', maxLength: 300 },
            ])
        })

        user.separator()
        user.list('test_cases', testCases.slice(0, 120), (list, testCase) => {
            list.itemObject([
                { key: 'id', value: testCase.id, maxLength: 50 },
                { key: 'title', value: testCase.title, maxLength: 200 },
                { key: 'sapModule', value: testCase.sapModule, maxLength: 80 },
                { key: 'components', value: sanitizeToonList(testCase.components || [], 24, 8), style: 'literal' },
                { key: 'tags', value: sanitizeToonList(testCase.tags || [], 24, 8), style: 'literal' },
            ])
        })
        telemetry.test_case_count = Math.min(testCases.length, 120)

        const raw = await this.executeWithFallback(user.toString(), modelName, 0.2, MAX_TOKENS.pr_analysis, sysLines.join('\n'), true, 'pr_analysis', telemetry)
        const parsed = GeminiService.parseJsonResponse(raw)
        return normalizePullRequestAnalysisResult(parsed)
    }
}
