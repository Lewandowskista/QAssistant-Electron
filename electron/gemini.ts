import { GoogleGenerativeAI } from '@google/generative-ai'
import { SAP_COMMERCE_CONTEXT_BLOCK } from './sapCommerceContext'
import { log } from './logger'

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
    claim_extraction: 8192,
    claim_verification: 16384,
    dimension_scoring: 8192,
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
        jsonMode = false
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
                if (usage) {
                    log.info(`[Gemini] ${modelName} | prompt: ${usage.promptTokenCount ?? '?'} tokens, output: ${usage.candidatesTokenCount ?? '?'} tokens, total: ${usage.totalTokenCount ?? '?'} tokens`);
                }

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
        if (!value?.trim()) return ''
        let s = value.length > maxLength ? value.substring(0, maxLength) + '...' : value
        s = s.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ')
        s = s.replace(/{/g, '(').replace(/}/g, ')').replace(/\[/g, '(').replace(/\]/g, ')')
        s = s.replace(/@/g, '(at)').replace(/---/g, '- - -')
        // Prevent TOON structural injection via colon (key:value separator), pipe (rule delimiter), backtick
        s = s.replace(/:/g, '\u02F8').replace(/\|/g, '\u2223').replace(/`/g, "'")
        return s
    }

    /**
     * Sanitizer for document/reference content embedded in accuracy prompts.
     * Unlike sanitizeToonValue, this preserves colons and pipes so that reference
     * text is not corrupted before being sent to the model. It only strips characters
     * that would break JSON string encoding in the model's output context, and
     * wraps the result in JSON-safe double quotes so the TOON parser treats it as
     * an opaque string rather than a structured value.
     */
    private static sanitizeDocContent(value: string | null | undefined, maxLength = 6000): string {
        if (!value?.trim()) return '""'
        let s = value.length > maxLength ? value.substring(0, maxLength) + '...' : value
        // Normalise line endings to spaces so the TOON line structure isn't broken
        s = s.replace(/\r\n/g, ' ').replace(/\r/g, ' ').replace(/\n/g, ' ')
        // Escape characters that would break a JSON string literal
        s = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        // Escape TOON structural chars only at top-level: { } [ ] that could confuse the TOON parser
        s = s.replace(/{/g, '(').replace(/}/g, ')').replace(/\[/g, '(').replace(/\]/g, ')')
        return `"${s}"`
    }

    private static sanitizeToonValueForTestGen(value: string | null | undefined, maxLength = 2000): string {
        if (!value?.trim()) return ''
        let s = value.length > maxLength ? value.substring(0, maxLength) + '...' : value
        s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        s = s.replace(/{/g, '(').replace(/}/g, ')').replace(/\[/g, '(').replace(/\]/g, ')')
        s = s.replace(/@/g, '(at)').replace(/---/g, '- - -')
        // Prevent TOON structural injection via colon (key:value separator), pipe (rule delimiter), backtick
        s = s.replace(/:/g, '\u02F8').replace(/\|/g, '\u2223').replace(/`/g, "'")
        return s
    }

    // ── QA Context Block ─────────────────────────────────────────────────────

    /**
     * Appends project QA context in TOON format.
     * @param excludeTrackedIssues - Set true when the calling prompt already includes a dedicated issues block
     *   (test case generation, criticality assessment) to avoid doubling token usage.
     */
    private static appendQaContext(lines: string[], project: any, excludeTrackedIssues = false): void {
        if (!project) return

        lines.push('qa_context{')
        lines.push(` project:${GeminiService.sanitizeToonValue(project.name, 200)}`)
        if (project.description) {
            lines.push(` project_desc:${GeminiService.sanitizeToonValue(project.description, 300)}`)
        }

        const activeEnv = project.environments?.find((e: any) => e.isDefault) ?? project.environments?.[0]
        if (activeEnv) {
            lines.push(` active_env:${GeminiService.sanitizeToonValue(activeEnv.name, 100)}`)
            lines.push(` env_type:${activeEnv.type}`)
            if (activeEnv.baseUrl) lines.push(` env_url:${GeminiService.sanitizeToonValue(activeEnv.baseUrl, 200)}`)
        }

        if (project.environments?.length > 0) {
            const envTypes = project.environments.map((e: any) => `${GeminiService.sanitizeToonValue(e.name, 60)}(${e.type})`).join(',')
            lines.push(` environments:${envTypes}`)
        }

        // Test coverage snapshot
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

            const passed = aggregateStatusCounts.passed || 0
            const failed = aggregateStatusCounts.failed || 0
            const blocked = aggregateStatusCounts.blocked || 0
            const notRun = aggregateStatusCounts['not-run'] || 0
            lines.push(` test_coverage:total=${totalCaseCount},passed=${passed},failed=${failed},blocked=${blocked},not_run=${notRun}`)
        }

        if (project.checklists?.length > 0) {
            const categories = [...new Set(project.checklists.map((c: any) => c.category).filter(Boolean))]
            if (categories.length > 0) lines.push(` checklist_areas:${categories.join(',')}`)
        }

        if (project.testDataGroups?.length > 0) {
            const dataDomains = [...new Set(project.testDataGroups.map((g: any) => g.category).filter(Boolean))]
            if (dataDomains.length > 0) lines.push(` test_data_domains:${dataDomains.join(',')}`)
        }

        // --- Tracked issues (JIRA / Linear) ---
        // Skip when the calling prompt already includes a dedicated issues block to avoid doubling tokens
        if (!excludeTrackedIssues) {
            const DONE_STATUSES = new Set([
                'done', 'closed', 'resolved', 'cancelled', 'canceled',
                "won't fix", 'wont fix', 'duplicate'
            ])
            const MAX_ISSUES = 25
            const allTasks: any[] = project.tasks || []
            const activeTasks = project.manualContextSelection
                ? allTasks
                : allTasks.filter((t: any) => {
                    if (t.source === 'manual') return false
                    return !DONE_STATUSES.has(String(t.status || '').toLowerCase().trim())
                })
            if (activeTasks.length > 0) {
                const blocker = activeTasks.filter((t: any) => t.priority === 'critical').length
                const high    = activeTasks.filter((t: any) => t.priority === 'high').length
                const medium  = activeTasks.filter((t: any) => t.priority === 'medium').length
                const low     = activeTasks.filter((t: any) => t.priority === 'low').length
                lines.push(` tasks_summary:total=${allTasks.length},active=${activeTasks.length},shown=${Math.min(activeTasks.length, MAX_ISSUES)},blocker=${blocker},high=${high},medium=${medium},low=${low}`)
                lines.push(' tracked_issues[')
                for (const task of activeTasks.slice(0, MAX_ISSUES)) {
                    const issueId = GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId, 60)
                    const title   = GeminiService.sanitizeToonValue(task.title, 150)
                    let entry = `  {id:${issueId},t:${title},status:${task.status || 'unknown'},priority:${task.priority || 'medium'}`
                    if (task.assignee) entry += `,assignee:${GeminiService.sanitizeToonValue(task.assignee, 80)}`
                    if (task.labels)   entry += `,labels:${GeminiService.sanitizeToonValue(task.labels, 100)}`
                    if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 60)}`
                    if (task.reproducibility) entry += `,repro:${GeminiService.sanitizeToonValue(task.reproducibility, 40)}`
                    if (task.frequency) entry += `,freq:${GeminiService.sanitizeToonValue(task.frequency, 40)}`
                    if (task.components?.length) entry += `,components:${GeminiService.sanitizeToonValue(task.components.join(','), 120)}`
                    if (task.affectedEnvironmentNames?.length) entry += `,envs:${GeminiService.sanitizeToonValue(task.affectedEnvironmentNames.join(','), 120)}`
                    if (task.acceptanceCriteria) entry += `,ac:${GeminiService.sanitizeToonValue(task.acceptanceCriteria, 200)}`
                    if (task.description) entry += `,desc:${GeminiService.sanitizeToonValue(task.description, 300)}`
                    entry += '}'
                    lines.push(entry)
                    if (task.comments?.length > 0) {
                        lines.push(`   comments_for_${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId || task.id, 40)}[`)
                        for (const comment of task.comments.slice(0, 5)) {
                            lines.push(`    {author:${GeminiService.sanitizeToonValue(comment.authorName, 80)},date:${comment.createdAt ? new Date(comment.createdAt).toISOString().split('T')[0] : ''},body:${GeminiService.sanitizeToonValue(comment.body, 240)}}`)
                        }
                        lines.push('   ]')
                    }
                }
                lines.push(' ]')
            }
        }

        lines.push('}')
        lines.push('---')

        if (project.sapCommerce?.enabled) {
            const sapEnvSummary = (project.sapCommerce.environments || [])
                .slice(0, 5)
                .map((env: any) => {
                    const tags = [
                        env.type,
                        env.isDefault ? 'default' : '',
                        env.hacUrl ? 'hac' : '',
                        env.backOfficeUrl ? 'backoffice' : '',
                        env.occBasePath ? `occ=${GeminiService.sanitizeToonValue(env.occBasePath, 80)}` : '',
                    ].filter(Boolean).join('|')
                    return `${GeminiService.sanitizeToonValue(env.name, 60)}(${tags})`
                })
                .join(',')

            if (sapEnvSummary) {
                lines.push(` sap_commerce_envs:${sapEnvSummary}`)
            }
            lines.push(SAP_COMMERCE_CONTEXT_BLOCK)
            lines.push('---')
        }
    }

    private static appendDevContext(lines: string[], project: any): void {
        if (!project) return

        lines.push('dev_context{')
        lines.push(` project:${GeminiService.sanitizeToonValue(project.name, 200)}`)
        if (project.description) {
            lines.push(` project_desc:${GeminiService.sanitizeToonValue(project.description, 300)}`)
        }

        const activeEnv = project.environments?.find((environment: any) => environment.isDefault) ?? project.environments?.[0]
        if (activeEnv) {
            lines.push(` active_env:${GeminiService.sanitizeToonValue(activeEnv.name, 100)}`)
            lines.push(` env_type:${activeEnv.type}`)
            if (activeEnv.baseUrl) lines.push(` env_url:${GeminiService.sanitizeToonValue(activeEnv.baseUrl, 200)}`)
        }

        if (project.environments?.length > 0) {
            const environmentSummary = project.environments
                .map((environment: any) => `${GeminiService.sanitizeToonValue(environment.name, 60)}(${environment.type})`)
                .join(',')
            lines.push(` environments:${environmentSummary}`)
        }

        if (project.tasks?.length > 0) {
            lines.push(` work_summary:tasks=${project.tasks.length}`)
            lines.push('tracked_work[')
            for (const task of project.tasks.slice(0, 40)) {
                let entry = `  {id:${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId || task.id, 60)},t:${GeminiService.sanitizeToonValue(task.title, 150)},status:${task.status},priority:${task.priority}`
                if (task.description) entry += `,desc:${GeminiService.sanitizeToonValue(task.description, 300)}`
                if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 60)}`
                if (task.assignee) entry += `,assignee:${GeminiService.sanitizeToonValue(task.assignee, 80)}`
                if (task.collabState) entry += `,collab:${GeminiService.sanitizeToonValue(task.collabState, 40)}`
                if (task.activeHandoffId) entry += `,handoff:${GeminiService.sanitizeToonValue(task.activeHandoffId, 80)}`
                if (task.labels) entry += `,labels:${GeminiService.sanitizeToonValue(task.labels, 120)}`
                if (task.reproducibility) entry += `,repro:${GeminiService.sanitizeToonValue(task.reproducibility, 40)}`
                if (task.frequency) entry += `,freq:${GeminiService.sanitizeToonValue(task.frequency, 40)}`
                if (task.components?.length) entry += `,components:${GeminiService.sanitizeToonValue(task.components.join(','), 120)}`
                if (task.affectedEnvironmentNames?.length) entry += `,envs:${GeminiService.sanitizeToonValue(task.affectedEnvironmentNames.join(','), 120)}`
                if (task.acceptanceCriteria) entry += `,ac:${GeminiService.sanitizeToonValue(task.acceptanceCriteria, 200)}`
                entry += '}'
                lines.push(entry)
                if (task.comments?.length > 0) {
                    lines.push(`   comments_for_${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId || task.id, 40)}[`)
                    for (const comment of task.comments.slice(0, 5)) {
                        lines.push(`    {author:${GeminiService.sanitizeToonValue(comment.authorName, 80)},date:${comment.createdAt ? new Date(comment.createdAt).toISOString().split('T')[0] : ''},body:${GeminiService.sanitizeToonValue(comment.body, 240)}}`)
                    }
                    lines.push('   ]')
                }
            }
            lines.push(' ]')
        }

        if (project.handoffs?.length > 0) {
            lines.push(` handoff_summary:total=${project.handoffs.length}`)
            lines.push(' handoffs[')
            for (const handoff of project.handoffs.slice(0, 25)) {
                let entry = `  {id:${GeminiService.sanitizeToonValue(handoff.id, 80)},task:${GeminiService.sanitizeToonValue(handoff.taskId, 80)},type:${GeminiService.sanitizeToonValue(handoff.type, 40)},summary:${GeminiService.sanitizeToonValue(handoff.summary, 240)}`
                if (handoff.environmentName) entry += `,env:${GeminiService.sanitizeToonValue(handoff.environmentName, 80)}`
                if (handoff.severity) entry += `,severity:${GeminiService.sanitizeToonValue(handoff.severity, 40)}`
                if (handoff.branchName) entry += `,branch:${GeminiService.sanitizeToonValue(handoff.branchName, 120)}`
                if (handoff.releaseVersion) entry += `,release:${GeminiService.sanitizeToonValue(handoff.releaseVersion, 80)}`
                if (handoff.isComplete !== undefined) entry += `,complete:${handoff.isComplete ? 'yes' : 'no'}`
                entry += '}'
                lines.push(entry)

                if (handoff.linkedPrs?.length > 0) {
                    lines.push(`   linked_prs_for_${GeminiService.sanitizeToonValue(handoff.id, 40)}[`)
                    for (const linkedPr of handoff.linkedPrs.slice(0, 10)) {
                        let prEntry = `    {repo:${GeminiService.sanitizeToonValue(linkedPr.repoFullName, 120)},pr:${linkedPr.prNumber}`
                        if (linkedPr.status) prEntry += `,status:${GeminiService.sanitizeToonValue(linkedPr.status, 40)}`
                        prEntry += '}'
                        lines.push(prEntry)
                    }
                    lines.push('   ]')
                }
            }
            lines.push(' ]')
        }

        lines.push('}')
        lines.push('---')
    }

    // ── Prompt Builders ──────────────────────────────────────────────────────
    // Each builder returns { system, user } so role/rules go into systemInstruction
    // and actual data goes into the user turn — improving instruction adherence.

    static buildToonPrompt(task: any, comments: any[] = [], project?: any, attachedImageCount: number = 0): { system: string; user: string } {
        const sysLines: string[] = []
        sysLines.push('@role:sr_qa_engineer')
        sysLines.push('@task:deep_issue_analysis')
        sysLines.push('@perspective:qa_engineer—focus on testability,reproducibility,regression_risk,environment_impact')
        sysLines.push('@out_fmt:md_sections[## Root Cause Analysis,## Impact Assessment,## Suggested Fix,## Prevention Recommendations]')
        sysLines.push('@rules:all_sections_required|multi_sentence|specific_actionable|infer_if_brief|no_skip|no_merge|consider_env_context|reference_project_functionality|use_tables_for_structured_data|bold_key_findings')
        sysLines.push('@priority_mapping:task_priorities(critical=Blocker,high=Major,medium=Medium,low=Low)|tc_priorities(Blocker,Major,Medium,Low)')

        const userLines: string[] = []
        GeminiService.appendQaContext(userLines, project)

        userLines.push('issue{')
        userLines.push(` t:${GeminiService.sanitizeToonValue(task.title, 300)}`)
        if (task.sourceIssueId) userLines.push(` id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 100)}`)
        userLines.push(` status:${task.status}`)
        userLines.push(` priority:${task.priority}`)
        if (task.assignee) userLines.push(` assignee:${GeminiService.sanitizeToonValue(task.assignee, 200)}`)
        if (task.labels) userLines.push(` labels:${GeminiService.sanitizeToonValue(task.labels, 200)}`)
        if (task.dueDate) userLines.push(` due:${new Date(task.dueDate).toISOString().split('T')[0]}`)
        userLines.push(` desc:${task.description ? GeminiService.sanitizeToonValue(task.description) : '(none—infer from title+metadata)'}`)
        userLines.push('}')

        if (comments.length > 0) {
            userLines.push('comments[')
            for (const c of comments) {
                userLines.push(` {author:${GeminiService.sanitizeToonValue(c.authorName, 200)},date:${c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : ''},body:${GeminiService.sanitizeToonValue(c.body)}}`)
            }
            userLines.push(']')
        }

        const images = task.attachmentUrls?.length || 0
        const totalImages = Math.max(attachedImageCount, images)

        if (totalImages > 0) {
            userLines.push(`@media:${totalImages}_image(s)_attached—analyze following visual content for additional context (screenshots, error messages, UI state, logs)`)
        }

        if (project?.contextTasks?.length > 0) {
            userLines.push('---')
            userLines.push('project_context_tasks[')
            for (const t of project.contextTasks) {
                let entry = ` {t:${GeminiService.sanitizeToonValue(t.title, 200)},type:${GeminiService.sanitizeToonValue(t.issueType, 60)}`
                if (t.labels) entry += `,labels:${GeminiService.sanitizeToonValue(t.labels, 100)}`
                if (t.description) entry += `,desc:${GeminiService.sanitizeToonValue(t.description, 300)}`
                entry += '}'
                userLines.push(entry)
            }
            userLines.push(']')
        }

        return { system: sysLines.join('\n'), user: userLines.join('\n') }
    }

    static buildTestCaseGenerationPrompt(tasks: any[], sourceName: string, project?: any, designDoc?: string, comments?: Record<string, any[]>): { system: string; user: string } {
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

        const userLines: string[] = []
        // Exclude tracked_issues from qa_context — the project_issues block below already covers them
        GeminiService.appendQaContext(userLines, project, true)

        if (designDoc) {
            userLines.push('design_document{')
            userLines.push(GeminiService.sanitizeToonValueForTestGen(designDoc, 20000))
            userLines.push('}')
            userLines.push('---')
        }

        userLines.push('project_issues[')
        for (const task of tasks) {
            let entry = ` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId, 100)},title:${GeminiService.sanitizeToonValue(task.title, 300)},status:${task.status || 'todo'},priority:${task.priority || 'medium'}`
            if (task.description) entry += `,desc:${GeminiService.sanitizeToonValueForTestGen(task.description, 2000)}`
            if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 100)}`
            if (task.labels) entry += `,labels:${GeminiService.sanitizeToonValue(task.labels, 200)}`
            if (task.attachmentUrls?.length) entry += `,has_images:true(${task.attachmentUrls.length}_attached)`
            entry += '}'
            userLines.push(entry)

            // Include up to 5 most recent comments per issue for richer context
            const issueId = task.sourceIssueId || task.externalId
            const issueComments = comments?.[issueId]?.slice(0, 5) || []
            if (issueComments.length > 0) {
                userLines.push(` issue_comments_for_${GeminiService.sanitizeToonValue(issueId, 30)}[`)
                for (const c of issueComments) {
                    userLines.push(`  {author:${GeminiService.sanitizeToonValue(c.authorName, 100)},body:${GeminiService.sanitizeToonValueForTestGen(c.body, 500)}}`)
                }
                userLines.push(' ]')
            }
        }
        userLines.push(']')

        return { system: sysLines.join('\n'), user: userLines.join('\n') }
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
        // Exclude tracked_issues — project_tasks block below covers the same data
        GeminiService.appendQaContext(userLines, project, true)

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
        GeminiService.appendQaContext(userLines, project)

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
        GeminiService.appendQaContext(userLines, project)

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
        const { system, user } = GeminiService.buildToonPrompt(task, comments, project, attachedImageCount)
        return await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.issue_analysis, system)
    }

    /** Generate test cases from tasks using TOON prompts with native JSON mode */
    async generateTestCases(tasks: any[] = [], sourceName: string, project?: any, designDoc?: string, modelName?: string, comments?: Record<string, any[]>): Promise<any[]> {
        const { system, user } = GeminiService.buildTestCaseGenerationPrompt(tasks || [], sourceName, project, designDoc, comments)
        // jsonMode=true forces the API to return valid JSON — no extraction needed
        const text = await this.executeWithFallback(user, modelName, 0.4, MAX_TOKENS.test_generation, system, true)

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
        return await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.criticality, system)
    }

    /** Test run suggestions / deployment readiness */
    async getTestRunSuggestions(testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const { system, user } = GeminiService.buildTestRunSuggestionsPrompt(testPlans, executions, project)
        return await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.suggestions, system)
    }

    /** Select a minimal smoke test subset from candidates using JSON mode */
    async selectSmokeSubset(candidates: any[], doneTasks: any[], project?: any, modelName?: string): Promise<string[]> {
        const { system, user } = GeminiService.buildSmokeSubsetPrompt(candidates, doneTasks, project)
        // jsonMode=true guarantees a valid JSON array response
        const text = await this.executeWithFallback(user, modelName, 0.3, MAX_TOKENS.smoke_subset, system, true)

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

        const userLines: string[] = []
        if (project) {
            GeminiService.appendQaContext(userLines, project)
        }
        userLines.push('analysis_context_and_data{')
        userLines.push(` context:${GeminiService.sanitizeToonValue(projectContext, 5000)}`)
        userLines.push('}')

        return await this.executeWithFallback(userLines.join('\n'), modelName, 0.4, MAX_TOKENS.project_analysis, sysLines.join('\n'))
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
        const userLines: string[] = []

        if (role === 'dev') {
            sysLines.push('@role:sr_software_engineer')
            sysLines.push('@task:freeform_dev_assistant_chat')
            sysLines.push('@perspective:software_engineer—helpful,concise,context-aware developer focused on implementation,risk,release_readiness,and code review coordination')
            sysLines.push('@rules:conversational|specific|implementation_focused|reference_handoff_and_pr_context_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context')
            if (project) {
                GeminiService.appendDevContext(userLines, project)
            }
        } else {
            sysLines.push('@role:sr_qa_engineer')
            sysLines.push('@task:freeform_qa_assistant_chat')
            sysLines.push('@perspective:qa_engineer—helpful,concise,context-aware QA expert with deep SAP Commerce knowledge')
            sysLines.push('@rules:conversational|helpful|specific|reference_project_data_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context')
            if (project) {
                GeminiService.appendQaContext(userLines, project)
            }
        }
        userLines.push('user_request{')
        userLines.push(` message:${GeminiService.sanitizeToonValueForTestGen(userMessage, 3000)}`)
        userLines.push('}')
        const systemInstruction = sysLines.join('\n')
        const requestPayload = userLines.join('\n')

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

        const geminiHistory = budgetedTurns.map(turn => ({
            role: turn.role === 'user' ? 'user' : 'model' as 'user' | 'model',
            parts: [{ text: turn.content }]
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
                if (usage) {
                    log.info(`[Gemini] ${currentModelName} | prompt: ${usage.promptTokenCount ?? '?'} tokens, output: ${usage.candidatesTokenCount ?? '?'} tokens, total: ${usage.totalTokenCount ?? '?'} tokens`)
                }

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

        const userLines: string[] = []
        userLines.push('agent_response{')
        // Use sanitizeDocContent to preserve colons/pipes in technical content (URLs, code, timestamps)
        userLines.push(` text:${GeminiService.sanitizeDocContent(agentResponse, 8000)}`)
        userLines.push('}')
        if (expectedAnswer?.trim()) {
            userLines.push('expected_answer{')
            userLines.push(` text:${GeminiService.sanitizeDocContent(expectedAnswer, 3000)}`)
            userLines.push('}')
        }

        const raw = await this.executeWithFallback(
            userLines.join('\n'),
            modelOverride,
            0,
            MAX_TOKENS.claim_extraction,
            sysLines.join('\n'),
            true
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

        const userLines: string[] = []
        if (expectedAnswer?.trim()) {
            userLines.push('expected_answer{')
            userLines.push(` text:${GeminiService.sanitizeDocContent(expectedAnswer, 3000)}`)
            userLines.push('}')
            userLines.push('---')
        }
        userLines.push('ref_docs[')
        for (const chunk of refChunks) {
            userLines.push(` {id:${GeminiService.sanitizeToonValue(chunk.id, 100)},content:${GeminiService.sanitizeDocContent(chunk.content, 6000)}}`)
        }
        userLines.push(']')
        userLines.push('---')
        userLines.push('claims[')
        for (let i = 0; i < claims.length; i++) {
            userLines.push(` {idx:${i},text:${GeminiService.sanitizeToonValue(claims[i].claimText, 500)},type:${claims[i].claimType}}`)
        }
        userLines.push(']')

        const raw = await this.executeWithFallback(
            userLines.join('\n'),
            modelOverride,
            0,
            MAX_TOKENS.claim_verification,
            sysLines.join('\n'),
            true
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

        const userLines: string[] = []
        userLines.push('eval_context{')
        userLines.push(` question:${GeminiService.sanitizeToonValue(question, 1000)}`)
        // Use sanitizeDocContent to preserve colons/pipes in technical content and align limit with extractClaims
        userLines.push(` agent_response:${GeminiService.sanitizeDocContent(agentResponse, 8000)}`)
        if (expectedAnswer?.trim()) {
            userLines.push(` expected_answer:${GeminiService.sanitizeDocContent(expectedAnswer, 3000)}`)
        }
        userLines.push('}')
        userLines.push('---')
        userLines.push('claim_verdicts[')
        for (const cv of claimVerdicts) {
            userLines.push(` {claim:${GeminiService.sanitizeToonValue(cv.claimText, 400)},verdict:${cv.verdict},reasoning:${GeminiService.sanitizeToonValue(cv.reasoning, 200)}}`)
        }
        userLines.push(']')
        userLines.push('---')
        userLines.push('ref_doc_excerpts[')
        for (const chunk of refChunks) {
            userLines.push(` {id:${GeminiService.sanitizeToonValue(chunk.id, 100)},content:${GeminiService.sanitizeDocContent(chunk.content, 6000)}}`)
        }
        userLines.push(']')

        const raw = await this.executeWithFallback(
            userLines.join('\n'),
            modelOverride,
            0,
            MAX_TOKENS.dimension_scoring,
            sysLines.join('\n'),
            true
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

        const userLines: string[] = []
        userLines.push('eval_query{')
        userLines.push(` question:${GeminiService.sanitizeToonValue(question, 1000)}`)
        userLines.push(` agent_response:${GeminiService.sanitizeDocContent(agentResponse, 3000)}`)
        userLines.push('}')
        userLines.push('---')
        userLines.push('candidate_chunks[')
        for (const chunk of chunks) {
            userLines.push(` {id:${GeminiService.sanitizeToonValue(chunk.id, 100)},content:${GeminiService.sanitizeDocContent(chunk.content, 2000)}}`)
        }
        userLines.push(']')

        const raw = await this.executeWithFallback(
            userLines.join('\n'),
            modelOverride,
            0,
            512,
            sysLines.join('\n'),
            true
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

        const userLines: string[] = [
            'standup_data{',
            ` project:${GeminiService.sanitizeToonValue(metrics.projectName, 100)}`,
            ` date:${metrics.date}`,
            ` ready_for_qa_count:${metrics.readyForQa}`,
            ` blocked_tasks:${metrics.blocked}`,
            ` failed_test_cases:${metrics.failedTests}`,
            ` overdue_tasks:${metrics.overdueTasks}`,
            ` recent_test_runs:${JSON.stringify(metrics.recentRuns).substring(0, 500)}`,
            ` recently_verified:${JSON.stringify(metrics.recentlyVerified).substring(0, 300)}`,
            ` high_priority_open:${JSON.stringify(metrics.highPriorityOpen).substring(0, 300)}`,
            '}',
            'produce_standup_summary_for_a_qa_engineer_sharing_status_with_their_team',
        ]

        return await this.executeWithFallback(userLines.join('\n'), modelName, 0.6, 1024, sysLines.join('\n'))
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

        return await this.executeWithFallback(userLines.join('\n'), modelName, 0.2, 1024, sysLines.join('\n'))
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

        const userLines: string[] = [
            'new_bug{',
            ` title:${GeminiService.sanitizeToonValue(newBugTitle, 200)}`,
            ` description:${GeminiService.sanitizeToonValue(newBugDescription, 400)}`,
            ` repro_steps:${GeminiService.sanitizeToonValue(newBugReproSteps, 400)}`,
            ` components:${affectedComponents.join(',')}`,
            '}',
            'existing_open_bugs[',
        ]
        for (const bug of existingBugs.slice(0, 40)) {
            userLines.push(` {bugId:${GeminiService.sanitizeToonValue(bug.id, 50)},title:${GeminiService.sanitizeToonValue(bug.title, 200)},description:${GeminiService.sanitizeToonValue(bug.description, 200)},components:${(bug.components || []).join(',')}}`)
        }
        userLines.push(']')

        const raw = await this.executeWithFallback(userLines.join('\n'), modelName, 0.2, 1024, sysLines.join('\n'), true)
        const parsed = GeminiService.parseJsonResponse(raw)
        if (!Array.isArray(parsed)) return []
        return (parsed as any[]).filter(d => d && typeof d.bugId === 'string').map(d => ({
            bugId: String(d.bugId),
            title: String(d.title || ''),
            similarityScore: Number(d.similarityScore) || 0,
            reasoning: String(d.reasoning || ''),
        })).slice(0, 5)
    }

    /** Analyze a PR diff and identify which test cases are most likely impacted */
    async analyzeTestImpact(
        changedFiles: string[],
        prTitle: string,
        prDescription: string,
        testCases: Array<{ id: string; title: string; sapModule?: string; components?: string[]; tags?: string[] }>,
        modelName?: string
    ): Promise<{ impactedCaseIds: string[]; affectedModules: string[]; rationale: string }> {
        if (testCases.length === 0) return { impactedCaseIds: [], affectedModules: [], rationale: 'No test cases in project.' }

        const sysLines: string[] = [
            '@role:sr_qa_engineer',
            '@task:test_impact_analysis',
            '@out_fmt:json{impactedCaseIds:string[],affectedModules:string[],rationale:string}',
            '@rules:analyze_changed_files_for_sap_module_and_component_mapping|match_test_cases_by_sapModule_and_components_and_semantic_title_relevance|include_cases_that_test_the_changed_area|impactedCaseIds_are_test_case_ids_from_the_list|affectedModules_use_exact_sap_module_names|rationale_max_200_chars|be_precise_avoid_over_selecting',
        ]

        const userLines: string[] = [
            'pr_context{',
            ` title:${GeminiService.sanitizeToonValue(prTitle, 200)}`,
            ` description:${GeminiService.sanitizeToonValue(prDescription, 500)}`,
            '}',
            'changed_files[',
        ]
        for (const f of changedFiles.slice(0, 60)) {
            userLines.push(` ${GeminiService.sanitizeToonValue(f, 200)}`)
        }
        userLines.push(']')
        userLines.push('test_cases[')
        for (const tc of testCases.slice(0, 100)) {
            userLines.push(` {id:${GeminiService.sanitizeToonValue(tc.id, 50)},title:${GeminiService.sanitizeToonValue(tc.title, 200)},sapModule:${tc.sapModule || ''},components:${(tc.components || []).join(',')},tags:${(tc.tags || []).join(',')}}`)
        }
        userLines.push(']')

        const raw = await this.executeWithFallback(userLines.join('\n'), modelName, 0.2, 1536, sysLines.join('\n'), true)
        const parsed = GeminiService.parseJsonResponse(raw)
        if (!parsed || typeof parsed !== 'object') return { impactedCaseIds: [], affectedModules: [], rationale: 'Analysis failed.' }
        return {
            impactedCaseIds: Array.isArray(parsed.impactedCaseIds) ? parsed.impactedCaseIds.filter((id: any) => typeof id === 'string') : [],
            affectedModules: Array.isArray(parsed.affectedModules) ? parsed.affectedModules.filter((m: any) => typeof m === 'string') : [],
            rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
        }
    }
}
