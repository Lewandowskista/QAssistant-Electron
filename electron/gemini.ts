import { GoogleGenerativeAI } from '@google/generative-ai'
import { SAP_COMMERCE_CONTEXT_BLOCK } from './sapCommerceContext'

const MODEL_3_1_FLASH_LITE = 'gemini-3.1-flash-lite';
const MODEL_3_0_FLASH = 'gemini-3.0-flash';
const MODEL_2_5_FLASH_LITE = 'gemini-2.5-flash-lite';
const MODEL_2_5_FLASH = 'gemini-2.5-flash';

let preferredModel = MODEL_3_1_FLASH_LITE;

/**
 * AI Service for Gemini integration with full TOON (Token-Oriented Object Notation) prompt system.
 * Mirrors the C# GeminiService.cs implementation exactly.
 */
export class GeminiService {
    private genAI: GoogleGenerativeAI
    private apiKey: string

    constructor(apiKey: string) {
        this.apiKey = apiKey
        this.genAI = new GoogleGenerativeAI(apiKey)
    }

    /** List models available to this API key */
    async listAvailableModels(): Promise<string[]> {
        try {
            // Use header-based auth to avoid leaking the API key in URL logs/proxies
            const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                headers: { 'x-goog-api-key': this.apiKey },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json() as any;
            // The API returns model names with "models/" prefix, e.g., "models/gemini-1.5-flash"
            return data.models?.map((m: any) => m.name.replace('models/', '')) || [];
        } catch (err) {
            console.error('Failed to list Gemini models');
            return [];
        }
    }

    private getModel(modelName: string, temperature = 0.7) {
        return this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature,
                topP: 0.9,
                maxOutputTokens: 8192,
            }
        })
    }

    private async executeWithFallback(prompt: string | any, modelOverride?: string, temperature = 0.7): Promise<string> {
        // Build unique sequence of models starting with override, then preferred, then available ones
        const models = Array.from(new Set([
            modelOverride,
            preferredModel,
            MODEL_3_1_FLASH_LITE,
            MODEL_3_0_FLASH,
            MODEL_2_5_FLASH_LITE,
            MODEL_2_5_FLASH
        ].filter(Boolean) as string[]));
        
        let lastError: any;
        for (const modelName of models) {
            try {
                const model = this.getModel(modelName, temperature);
                const result = await model.generateContent(prompt);

                // If successful and we were using a non-preferred model, update it
                if (modelName !== preferredModel) {
                    console.log(`Gemini switching preferred model to ${modelName} after successful response`);
                    preferredModel = modelName;
                }

                // Log token usage for cost/quota visibility
                const usage = result.response.usageMetadata;
                if (usage) {
                    console.log(`[Gemini] ${modelName} | prompt: ${usage.promptTokenCount ?? '?'} tokens, output: ${usage.candidatesTokenCount ?? '?'} tokens, total: ${usage.totalTokenCount ?? '?'} tokens`);
                }

                return result.response.text();
            } catch (err: any) {
                lastError = err;
                
                let errorMsg = "";
                let errorStatus = "";
                
                try {
                    if (err && typeof err === 'object') {
                        errorMsg = typeof err.message === 'string' ? err.message : "";
                        errorStatus = err.status !== undefined ? String(err.status) : "";
                    } else {
                        errorMsg = String(err);
                    }
                } catch(e) {
                    errorMsg = "Unparseable error object thrown by Gemini SDK";
                }

                const errorStr = `${errorStatus} ${errorMsg}`.toLowerCase();

                const isRateLimit = errorStatus === '429' || errorStr.includes('429') || errorStr.includes('rate_limit') || errorStr.includes('resource_exhausted') || errorStr.includes('too many requests');
                const isUnavailable = errorStatus === '404' || errorStr.includes('404') || errorStr.includes('not found') || errorStr.includes('not supported') || errorStr.includes('invalid') || errorStr.includes('permission');

                if (isRateLimit || isUnavailable) {
                    console.warn(`Gemini model ${modelName} ${isRateLimit ? 'rate limited' : 'unavailable/invalid'}. Trying next fallback...`);
                    // Switch preferred model for future calls to avoid this one if it failed consistently
                    if (modelName === preferredModel) {
                        const nextIndex = (models.indexOf(modelName) + 1) % models.length;
                        preferredModel = models[nextIndex];
                    }
                    continue;
                }
                
                console.error(`Gemini model ${modelName} failed with unexpected error:`, errorStr);
                continue;
            }
        }
        
        // Safely extract final error message — strip URLs and stack traces to avoid leaking sensitive info
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
        } catch (e) {
            finalMsg = "Crash parsing error object";
        }

        throw `Gemini API Error: ${finalStatus}${finalMsg}`;
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

    private static appendQaContext(lines: string[], project: any): void {
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
        const allCases = project.testPlans?.flatMap((tp: any) => tp.testCases || []) || []
        if (allCases.length > 0) {
            const passed = allCases.filter((tc: any) => tc.status === 'passed').length
            const failed = allCases.filter((tc: any) => tc.status === 'failed').length
            const blocked = allCases.filter((tc: any) => tc.status === 'blocked').length
            const notRun = allCases.filter((tc: any) => tc.status === 'not-run').length
            lines.push(` test_coverage:total=${allCases.length},passed=${passed},failed=${failed},blocked=${blocked},not_run=${notRun}`)
        }

        if (project.checklists?.length > 0) {
            const categories = [...new Set(project.checklists.map((c: any) => c.category).filter(Boolean))]
            if (categories.length > 0) lines.push(` checklist_areas:${categories.join(',')}`)
        }

        if (project.testDataGroups?.length > 0) {
            const dataDomains = [...new Set(project.testDataGroups.map((g: any) => g.category).filter(Boolean))]
            if (dataDomains.length > 0) lines.push(` test_data_domains:${dataDomains.join(',')}`)
        }

        lines.push('}')
        lines.push('---')

        // Conditionally append SAP Commerce context if the project appears related
        if (project.sapHac && project.sapHac.length > 0) {
            lines.push(SAP_COMMERCE_CONTEXT_BLOCK)
            lines.push('---')
        }
    }

    // ── Prompt Builders (matching C# GeminiService.cs exactly) ──────────────

    static buildToonPrompt(task: any, comments: any[] = [], project?: any, attachedImageCount: number = 0): string {
        const lines: string[] = []
        lines.push('@role:sr_qa_engineer')
        lines.push('@task:deep_issue_analysis')
        lines.push('@perspective:qa_engineer—focus on testability,reproducibility,regression_risk,environment_impact')
        lines.push('@out_fmt:md_sections[## Root Cause Analysis,## Impact Assessment,## Suggested Fix,## Prevention Recommendations]')
        lines.push('@rules:all_sections_required|multi_sentence|specific_actionable|infer_if_brief|no_skip|no_merge|consider_env_context|reference_project_functionality|use_tables_for_structured_data|bold_key_findings')
        lines.push('---')

        GeminiService.appendQaContext(lines, project)

        lines.push('issue{')
        lines.push(` t:${GeminiService.sanitizeToonValue(task.title, 300)}`)
        if (task.sourceIssueId) lines.push(` id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 100)}`)
        lines.push(` status:${task.status}`)
        lines.push(` priority:${task.priority}`)
        if (task.assignee) lines.push(` assignee:${GeminiService.sanitizeToonValue(task.assignee, 200)}`)
        if (task.labels) lines.push(` labels:${GeminiService.sanitizeToonValue(task.labels, 200)}`)
        if (task.dueDate) lines.push(` due:${new Date(task.dueDate).toISOString().split('T')[0]}`)
        lines.push(` desc:${task.description ? GeminiService.sanitizeToonValue(task.description) : '(none—infer from title+metadata)'}`)
        lines.push('}')

        if (comments.length > 0) {
            lines.push('comments[')
            for (const c of comments) {
                lines.push(` {author:${GeminiService.sanitizeToonValue(c.authorName, 200)},date:${c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : ''},body:${GeminiService.sanitizeToonValue(c.body)}}`)
            }
            lines.push(']')
        }

        const images = task.attachmentUrls?.length || 0
        const totalImages = Math.max(attachedImageCount, images)

        if (totalImages > 0) {
            lines.push(`@media:${totalImages}_image(s)_attached—analyze following visual content for additional context (screenshots, error messages, UI state, logs)`)
        }

        if (project?.contextTasks?.length > 0) {
            lines.push('---')
            lines.push('project_context_tasks[')
            for (const t of project.contextTasks) {
                let entry = ` {t:${GeminiService.sanitizeToonValue(t.title, 200)},type:${GeminiService.sanitizeToonValue(t.issueType, 60)}`
                if (t.labels) entry += `,labels:${GeminiService.sanitizeToonValue(t.labels, 100)}`
                if (t.description) entry += `,desc:${GeminiService.sanitizeToonValue(t.description, 300)}`
                entry += '}'
                lines.push(entry)
            }
            lines.push(']')
        }

        return lines.join('\n')
    }

    static buildTestCaseGenerationPrompt(tasks: any[], sourceName: string, project?: any, designDoc?: string): string {
        const lines: string[] = []
        lines.push('@role:sr_qa_engineer')
        lines.push('@task:generate_test_cases')
        lines.push('@perspective:qa_engineer—generate functional and integration tests specifically covering the provided issues')
        lines.push(`@source:${sourceName}`)
        lines.push('@out_fmt:json_array[{testCaseId,title,preConditions,testSteps,testData,expectedResult,priority,sourceIssueId}]')
        lines.push('@out_rules:raw_json_only|no_markdown_wrap|no_code_block')
        lines.push('@rules:comprehensive|all_fields_required|specific_actionable|realistic_test_data|cover_positive_negative_edge|no_generic|env_aware|use_known_test_data_when_applicable|focus_only_on_provided_issues|exclude_general_regression_or_smoke_tests')
        if (designDoc) {
            lines.push('@extra_context:design_document_provided—use it to improve accuracy,coverage,and specificity of generated test cases')
        }
        lines.push('---')

        GeminiService.appendQaContext(lines, project)

        if (designDoc) {
            lines.push('design_document{')
            lines.push(GeminiService.sanitizeToonValueForTestGen(designDoc, 20000))
            lines.push('}')
            lines.push('---')
        }

        lines.push('field_spec{')
        lines.push(' testCaseId:sequential(TC-001,TC-002,...)')
        lines.push(' title:clear_descriptive')
        lines.push(' preConditions:state_before_execution')
        lines.push(' testSteps:numbered_step_by_step')
        lines.push(' testData:specific_values')
        lines.push(' expectedResult:pass_criteria')
        lines.push(' priority:one_of(Blocker,Major,Medium,Low)_based_on_issue_severity_and_impact')
        lines.push(' sourceIssueId:exact_id_of_the_source_issue_this_test_case_covers(IssueIdentifier_field_value)')
        lines.push('}')
        lines.push('---')

        lines.push('project_issues[')
        for (const task of tasks) {
            let entry = ` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId, 100)},title:${GeminiService.sanitizeToonValue(task.title, 300)},status:${task.status || 'todo'},priority:${task.priority || 'medium'}`
            if (task.description) entry += `,desc:${GeminiService.sanitizeToonValueForTestGen(task.description, 2000)}`
            if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 100)}`
            if (task.labels) entry += `,labels:${GeminiService.sanitizeToonValue(task.labels, 200)}`
            if (task.attachmentUrls?.length) entry += `,has_images:true(${task.attachmentUrls.length}_attached)`
            entry += '}'
            lines.push(entry)
        }
        lines.push(']')

        return lines.join('\n')
    }

    static buildCriticalityAssessmentPrompt(tasks: any[], testPlans: any[], executions: any[], project?: any): string {
        const lines: string[] = []
        const allCases = testPlans.flatMap(tp => tp.testCases || [])

        lines.push('@role:sr_qa_engineer')
        lines.push('@task:criticality_assessment')
        lines.push('@perspective:qa_engineer—assess release risk from QA standpoint considering environment health,test coverage gaps,checklist completion,blocker density')
        lines.push('@out_fmt:md_sections[## Failure Summary by Priority,## Overall Risk Level,## Key Areas of Concern,## Recommended Actions,## Release Readiness]')
        lines.push('@rules:concise|actionable|data_driven|risk_focused|all_sections_required|include_counts_per_priority(Blocker,Major,Medium,Low)|risk_level_one_of(Critical,High,Moderate,Low)|actions_ordered_by_severity|no_skip|no_merge|factor_env_coverage|factor_checklist_gaps')
        lines.push('---')

        GeminiService.appendQaContext(lines, project)

        const failedCases = allCases.filter((tc: any) => tc.status === 'failed')
        const blockerFailed = failedCases.filter((tc: any) => tc.priority === 'blocker').length
        const majorFailed = failedCases.filter((tc: any) => tc.priority === 'major').length
        const mediumFailed = failedCases.filter((tc: any) => tc.priority === 'medium').length
        const lowFailed = failedCases.filter((tc: any) => tc.priority === 'low').length

        lines.push('failure_summary{')
        lines.push(` total_test_cases:${allCases.length}`)
        lines.push(` total_failed:${failedCases.length}`)
        lines.push(` blocker_failed:${blockerFailed}`)
        lines.push(` major_failed:${majorFailed}`)
        lines.push(` medium_failed:${mediumFailed}`)
        lines.push(` low_failed:${lowFailed}`)
        lines.push(` total_executions:${executions.length}`)
        lines.push(` total_test_plans:${testPlans.length}`)
        lines.push('}')
        lines.push('---')

        if (testPlans.length > 0) {
            lines.push('test_plans[')
            for (const plan of testPlans.slice(0, 20)) {
                const planCases = plan.testCases || []
                const planFailed = planCases.filter((tc: any) => tc.status === 'failed').length
                lines.push(` {name:${GeminiService.sanitizeToonValue(plan.name, 200)},total:${planCases.length},failed:${planFailed},source:${GeminiService.sanitizeToonValue(plan.source, 60)}}`)
            }
            lines.push(']')
            lines.push('---')
        }

        if (tasks.length > 0) {
            lines.push('project_tasks[')
            for (const task of tasks.slice(0, 50)) {
                let entry = ` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId, 100)},title:${GeminiService.sanitizeToonValue(task.title, 300)},status:${task.status},priority:${task.priority}`
                if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 100)}`
                entry += '}'
                lines.push(entry)
            }
            lines.push(']')
        }

        if (failedCases.length > 0) {
            lines.push('failed_test_cases[')
            for (const tc of failedCases.slice(0, 50)) {
                let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 100)},title:${GeminiService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority},source:${tc.source || 'Manual'}`
                if (tc.actualResult) entry += `,actual_result:${GeminiService.sanitizeToonValue(tc.actualResult, 200)}`
                entry += '}'
                lines.push(entry)
            }
            lines.push(']')
        }

        if (executions && executions.length > 0) {
            const resultGroups = executions.reduce((acc: any, e: any) => {
                acc[e.result] = (acc[e.result] || 0) + 1
                return acc
            }, {})
            const groupStrs = Object.entries(resultGroups).map(([k, v]) => `${k}:${v}`)
            lines.push(`exec_results{${groupStrs.join(',')}}`)
        }

        return lines.join('\n')
    }

    static buildTestRunSuggestionsPrompt(testPlans: any[], executions: any[], project?: any): string {
        const lines: string[] = []
        const allCases = testPlans.flatMap(tp => tp.testCases || [])
        const total = allCases.length
        const passed = allCases.filter((tc: any) => tc.status === 'passed').length
        const failed = allCases.filter((tc: any) => tc.status === 'failed').length
        const blocked = allCases.filter((tc: any) => tc.status === 'blocked').length
        const skipped = allCases.filter((tc: any) => tc.status === 'skipped').length
        const notRun = allCases.filter((tc: any) => tc.status === 'not-run').length
        const passRate = total > 0 ? (passed / total * 100).toFixed(1) : '0.0'

        lines.push('@role:sr_qa_engineer')
        lines.push('@task:test_run_suggestions')
        lines.push('@perspective:qa_engineer—give specific,actionable QA gate and deployment suggestions based on test run results,pass rates per plan,and failed test case impact')
        lines.push('@out_fmt:md_sections[## Overall Status,## Deployment Readiness,## Key Risks,## Suggestions]')
        lines.push('@rules:concise|specific|data_driven|bold_decisions|deployment_verdict_prominent|reference_failing_areas|no_generic_advice|all_sections_required|suggestions_imperative_sentences_referencing_actual_data')
        lines.push('@example_output:Do not deploy to UAT — 3 blocker failures in the Checkout UI module|Retest Payment flow before promoting to staging — 2 major failures detected|UI regression suite is at 45% pass rate — address before UAT')
        lines.push('---')

        GeminiService.appendQaContext(lines, project)

        lines.push('overall_stats{')
        lines.push(` total_cases:${total}`)
        lines.push(` passed:${passed}`)
        lines.push(` failed:${failed}`)
        lines.push(` blocked:${blocked}`)
        lines.push(` skipped:${skipped}`)
        lines.push(` not_run:${notRun}`)
        lines.push(` pass_rate:${passRate}%`)
        lines.push(` total_executions:${executions.length}`)
        lines.push('}')

        if (testPlans.length > 0) {
            lines.push('plan_results[')
            for (const plan of testPlans.slice(0, 20)) {
                const planCases = plan.testCases || []
                const planTotal = planCases.length
                const planPassed = planCases.filter((tc: any) => tc.status === 'passed').length
                const planFailed = planCases.filter((tc: any) => tc.status === 'failed').length
                const planBlocked = planCases.filter((tc: any) => tc.status === 'blocked').length
                const planRate = planTotal > 0 ? (planPassed / planTotal * 100).toFixed(1) : '0.0'
                lines.push(` {name:${GeminiService.sanitizeToonValue(plan.name, 200)},total:${planTotal},passed:${planPassed},failed:${planFailed},blocked:${planBlocked},pass_rate:${planRate}%,source:${plan.source || 'Manual'}}`)
            }
            lines.push(']')
        }

        const failedCases = allCases.filter((tc: any) => tc.status === 'failed')
        if (failedCases.length > 0) {
            lines.push('failed_cases[')
            for (const tc of failedCases.slice(0, 50)) {
                let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 100)},title:${GeminiService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority}`
                if (tc.sapModule) entry += `,module:${tc.sapModule}`
                if (tc.actualResult) entry += `,actual:${GeminiService.sanitizeToonValue(tc.actualResult, 200)}`
                if (tc.sourceIssueId) entry += `,issue:${GeminiService.sanitizeToonValue(tc.sourceIssueId, 60)}`
                entry += '}'
                lines.push(entry)
            }
            lines.push(']')
        }

        const blockedCases = allCases.filter((tc: any) => tc.status === 'blocked')
        if (blockedCases.length > 0) {
            lines.push('blocked_cases[')
            for (const tc of blockedCases.slice(0, 20)) {
                let entry = ` {title:${GeminiService.sanitizeToonValue(tc.title, 200)},priority:${tc.priority}`
                if (tc.sapModule) entry += `,module:${tc.sapModule}`
                entry += '}'
                lines.push(entry)
            }
            lines.push(']')
        }

        if (executions && executions.length > 0) {
            const resultGroups = executions.reduce((acc: any, e: any) => {
                acc[e.result] = (acc[e.result] || 0) + 1
                return acc
            }, {})
            const groupStrs = Object.entries(resultGroups).map(([k, v]) => `${k}:${v}`)
            lines.push(`exec_results{${groupStrs.join(',')}}`)
        }

        return lines.join('\n')
    }

    static buildSmokeSubsetPrompt(candidates: any[], doneTasks: any[], project?: any): string {
        const lines: string[] = []
        lines.push('@role:sr_qa_engineer')
        lines.push('@task:smoke_subset_selection')
        lines.push('@goal:minimal_tc_set_max_regression_coverage')
        lines.push('@out_fmt:json_array_of_strings')
        lines.push('@out_rules:raw_json_only|no_wrap|ids_only|max_30')
        lines.push('@sel_rules:prefer(B>MAJ>MED>L)|cover_distinct_areas|no_dupes|exact_ids')
        lines.push('@schema:t=title|p=priority(B=Blocker,MAJ=Major,MED=Medium,L=Low)|s=status(F=Failed,P=Passed,BL=Blocked,SK=Skipped)|iss=source_issue_id')
        lines.push('---')

        GeminiService.appendQaContext(lines, project)

        if (doneTasks.length > 0) {
            lines.push('done[')
            for (const task of doneTasks.slice(0, 50)) {
                const p = task.priority === 'critical' ? 'B' : task.priority === 'high' ? 'MAJ' : task.priority === 'medium' ? 'MED' : 'L'
                lines.push(` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 60)},t:${GeminiService.sanitizeToonValue(task.title, 120)},p:${p}}`)
            }
            lines.push(']')
        }

        lines.push('tc[')
        for (const tc of candidates.slice(0, 200)) {
            const p = tc.priority === 'blocker' ? 'B' : tc.priority === 'major' ? 'MAJ' : tc.priority === 'medium' ? 'MED' : 'L'
            const sMap: Record<string, string> = { failed: 'F', passed: 'P', blocked: 'BL', skipped: 'SK' }
            let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 50)},t:${GeminiService.sanitizeToonValue(tc.title, 100)},p:${p}`
            if (tc.status !== 'not-run' && sMap[tc.status]) entry += `,s:${sMap[tc.status]}`
            if (tc.sourceIssueId) entry += `,iss:${GeminiService.sanitizeToonValue(tc.sourceIssueId, 60)}`
            entry += '}'
            lines.push(entry)
        }
        lines.push(']')

        return lines.join('\n')
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
        const prompt = GeminiService.buildToonPrompt(task, comments, project, attachedImageCount)
        return await this.executeWithFallback(prompt, modelName, 0.3) // analytical: low temperature
    }

    /** Generate test cases from tasks using TOON prompts */
    async generateTestCases(tasks: any[] = [], sourceName: string, project?: any, designDoc?: string, modelName?: string): Promise<any[]> {
        const prompt = GeminiService.buildTestCaseGenerationPrompt(tasks || [], sourceName, project, designDoc)
        const text = await this.executeWithFallback(prompt, modelName, 0.4) // generative but deterministic

        const extracted = GeminiService.extractFirstJsonArray(text)
        if (!extracted) {
            console.error('[GeminiService] Failed to extract JSON array. Raw response:', text);
            const preview = String(text).length > 500 ? String(text).substring(0, 500) + '...' : String(text);
            throw `Could not locate a JSON array in the model response. Raw Response: \n${preview}`;
        }

        let parsed: any[]
        try {
            parsed = JSON.parse(extracted)
        } catch {
            throw 'Model returned invalid JSON for test cases'
        }
        if (!Array.isArray(parsed)) throw 'Model returned unexpected structure for test cases (expected array)'
        const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical'])
        return parsed.map((item: any, i: number) => {
            if (typeof item !== 'object' || item === null) throw `Invalid test case at index ${i}`
            const priority = String(item.priority || 'medium').toLowerCase()
            return {
                testCaseId: String(item.testCaseId || `TC-${String(i + 1).padStart(3, '0')}`).substring(0, 50),
                title: String(item.title || `Test Case ${i + 1}`).substring(0, 300),
                preConditions: String(item.preConditions || '').substring(0, 2000),
                steps: String(item.testSteps || item.steps || '').substring(0, 5000),
                testData: String(item.testData || '').substring(0, 2000),
                expectedResult: String(item.expectedResult || '').substring(0, 2000),
                priority: (VALID_PRIORITIES.has(priority) ? priority : 'medium') as any,
                sourceIssueId: String(item.sourceIssueId || '').substring(0, 100),
                sapModule: item.sapModule ? String(item.sapModule).substring(0, 100) : undefined,
            }
        })
    }

    /** Criticality assessment for the current test state */
    async assessCriticality(tasks: any[], testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const prompt = GeminiService.buildCriticalityAssessmentPrompt(tasks, testPlans, executions, project)
        return await this.executeWithFallback(prompt, modelName, 0.3) // analytical: low temperature
    }

    /** Test run suggestions / deployment readiness */
    async getTestRunSuggestions(testPlans: any[], executions: any[], project?: any, modelName?: string): Promise<string> {
        const prompt = GeminiService.buildTestRunSuggestionsPrompt(testPlans, executions, project)
        return await this.executeWithFallback(prompt, modelName, 0.3) // analytical: low temperature
    }

    /** Select a minimal smoke test subset from candidates */
    async selectSmokeSubset(candidates: any[], doneTasks: any[], project?: any, modelName?: string): Promise<string[]> {
        const prompt = GeminiService.buildSmokeSubsetPrompt(candidates, doneTasks, project)
        const text = await this.executeWithFallback(prompt, modelName, 0.3) // deterministic subset selection

        const extracted = GeminiService.extractFirstJsonArray(text)
        if (!extracted) return []
        let parsed: any[]
        try {
            parsed = JSON.parse(extracted)
        } catch {
            return []
        }
        if (!Array.isArray(parsed)) return []
        // Validate: must be an array of strings (test case IDs)
        return parsed.filter((v: any) => typeof v === 'string').map((v: string) => v.substring(0, 100))
    }

    /** Strategic project analysis using TOON prompts */
    async analyzeProject(projectContext: string, project?: any, modelName?: string): Promise<string> {
        const lines: string[] = []
        lines.push('@role:sr_qa_engineer')
        lines.push('@task:project_strategic_analysis')
        lines.push('@perspective:qa_engineer—strategic,holistic view of project health and risk')
        lines.push('@out_fmt:md_sections[## Strategic Gaps,## Coverage Optimization,## Risk Assessment]')
        lines.push('@rules:strategic|actionable|data_driven|bold_decisions|no_generic_advice|all_sections_required|use_tables_for_structured_data|bold_key_findings')
        lines.push('---')

        if (project) {
            GeminiService.appendQaContext(lines, project)
        }

        lines.push('analysis_context_and_data{')
        lines.push(` context:${GeminiService.sanitizeToonValue(projectContext, 5000)}`)
        lines.push('}')

        const prompt = lines.join('\n')
        return await this.executeWithFallback(prompt, modelName, 0.4) // strategic but controlled
    }

    /** Freeform conversational QA chat with project context */
    async chat(
        userMessage: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        project?: any,
        modelName?: string
    ): Promise<string> {
        // Build a system context preamble using TOON
        const systemLines: string[] = []
        systemLines.push('@role:sr_qa_engineer')
        systemLines.push('@task:freeform_qa_assistant_chat')
        systemLines.push('@perspective:qa_engineer—helpful,concise,context-aware QA expert with deep SAP Commerce knowledge')
        systemLines.push('@rules:conversational|helpful|specific|reference_project_data_when_relevant|use_markdown_formatting|keep_answers_concise_unless_detail_asked|no_hallucination|acknowledge_if_insufficient_context')
        systemLines.push('---')

        if (project) {
            GeminiService.appendQaContext(systemLines, project)
        }

        // Build the conversation as a single string prompt
        const conversationLines: string[] = []
        if (history.length > 0) {
            conversationLines.push('conversation_history[')
            for (const turn of history.slice(-10)) { // last 10 turns for context window management
                if (!['user', 'assistant'].includes(turn.role)) continue // reject invalid roles
                const role = turn.role === 'user' ? 'user' : 'assistant'
                conversationLines.push(` {role:${role},msg:${GeminiService.sanitizeToonValueForTestGen(turn.content, 1000)}}`)
            }
            conversationLines.push(']')
            conversationLines.push('---')
        }

        conversationLines.push(`current_user_message{`)
        conversationLines.push(` msg:${GeminiService.sanitizeToonValueForTestGen(userMessage, 3000)}`)
        conversationLines.push(`}`)
        conversationLines.push('@respond_to:current_user_message|be_direct|use_project_context_above')

        const fullPrompt = [...systemLines, ...conversationLines].join('\n')
        return await this.executeWithFallback(fullPrompt, modelName, 0.7) // conversational: higher creativity
    }
}
