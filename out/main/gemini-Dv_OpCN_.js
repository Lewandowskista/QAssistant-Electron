import { GoogleGenerativeAI } from "@google/generative-ai";
class GeminiService {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }
  getModel(modelName = "gemini-2.5-flash") {
    return this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 8192
      }
    });
  }
  // ── TOON Sanitizers ──────────────────────────────────────────────────────
  static sanitizeToonValue(value, maxLength = 500) {
    if (!value?.trim()) return "";
    let s = value.length > maxLength ? value.substring(0, maxLength) + "..." : value;
    s = s.replace(/\r\n/g, " ").replace(/\r/g, " ").replace(/\n/g, " ");
    s = s.replace(/{/g, "(").replace(/}/g, ")").replace(/\[/g, "(").replace(/\]/g, ")");
    s = s.replace(/@/g, "(at)").replace(/---/g, "- - -");
    return s;
  }
  static sanitizeToonValueForTestGen(value, maxLength = 2e3) {
    if (!value?.trim()) return "";
    let s = value.length > maxLength ? value.substring(0, maxLength) + "..." : value;
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/{/g, "(").replace(/}/g, ")").replace(/\[/g, "(").replace(/\]/g, ")");
    s = s.replace(/@/g, "(at)").replace(/---/g, "- - -");
    return s;
  }
  // ── QA Context Block ─────────────────────────────────────────────────────
  static appendQaContext(lines, project) {
    if (!project) return;
    lines.push("qa_context{");
    lines.push(` project:${GeminiService.sanitizeToonValue(project.name, 200)}`);
    const activeEnv = project.environments?.find((e) => e.isDefault) ?? project.environments?.[0];
    if (activeEnv) {
      lines.push(` active_env:${GeminiService.sanitizeToonValue(activeEnv.name, 100)}`);
      lines.push(` env_type:${activeEnv.type}`);
      if (activeEnv.baseUrl) lines.push(` env_url:${GeminiService.sanitizeToonValue(activeEnv.baseUrl, 200)}`);
    }
    if (project.environments?.length > 0) {
      const envTypes = project.environments.map((e) => `${GeminiService.sanitizeToonValue(e.name, 60)}(${e.type})`).join(",");
      lines.push(` environments:${envTypes}`);
    }
    const allCases = project.testPlans?.flatMap((tp) => tp.testCases || []) || [];
    if (allCases.length > 0) {
      const passed = allCases.filter((tc) => tc.status === "passed").length;
      const failed = allCases.filter((tc) => tc.status === "failed").length;
      const blocked = allCases.filter((tc) => tc.status === "blocked").length;
      const notRun = allCases.filter((tc) => tc.status === "not-run").length;
      lines.push(` test_coverage:total=${allCases.length},passed=${passed},failed=${failed},blocked=${blocked},not_run=${notRun}`);
    }
    if (project.checklists?.length > 0) {
      const categories = [...new Set(project.checklists.map((c) => c.category).filter(Boolean))];
      if (categories.length > 0) lines.push(` checklist_areas:${categories.join(",")}`);
    }
    if (project.testDataGroups?.length > 0) {
      const dataDomains = [...new Set(project.testDataGroups.map((g) => g.category).filter(Boolean))];
      if (dataDomains.length > 0) lines.push(` test_data_domains:${dataDomains.join(",")}`);
    }
    lines.push("}");
    lines.push("---");
  }
  // ── Prompt Builders (matching C# GeminiService.cs exactly) ──────────────
  static buildToonPrompt(task, comments = [], project) {
    const lines = [];
    lines.push("@role:sr_qa_engineer");
    lines.push("@task:deep_issue_analysis");
    lines.push("@perspective:qa_engineer—focus on testability,reproducibility,regression_risk,environment_impact");
    lines.push("@out_fmt:md_sections[## Root Cause Analysis,## Impact Assessment,## Suggested Fix,## Prevention Recommendations]");
    lines.push("@rules:all_sections_required|multi_sentence|specific_actionable|infer_if_brief|no_skip|no_merge|consider_env_context|reference_test_coverage");
    lines.push("---");
    GeminiService.appendQaContext(lines, project);
    lines.push("issue{");
    lines.push(` t:${GeminiService.sanitizeToonValue(task.title, 300)}`);
    if (task.sourceIssueId) lines.push(` id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 100)}`);
    lines.push(` status:${task.status}`);
    lines.push(` priority:${task.priority}`);
    if (task.assignee) lines.push(` assignee:${GeminiService.sanitizeToonValue(task.assignee, 200)}`);
    if (task.labels) lines.push(` labels:${GeminiService.sanitizeToonValue(task.labels, 200)}`);
    if (task.dueDate) lines.push(` due:${new Date(task.dueDate).toISOString().split("T")[0]}`);
    lines.push(` desc:${task.description ? GeminiService.sanitizeToonValue(task.description) : "(none—infer from title+metadata)"}`);
    lines.push("}");
    if (comments.length > 0) {
      lines.push("comments[");
      for (const c of comments) {
        lines.push(` {author:${GeminiService.sanitizeToonValue(c.authorName, 200)},date:${c.createdAt ? new Date(c.createdAt).toISOString().split("T")[0] : ""},body:${GeminiService.sanitizeToonValue(c.body)}}`);
      }
      lines.push("]");
    }
    return lines.join("\n");
  }
  static buildTestCaseGenerationPrompt(tasks, sourceName, project, designDoc) {
    const lines = [];
    lines.push("@role:sr_qa_engineer");
    lines.push("@task:generate_test_cases");
    lines.push("@perspective:qa_engineer—generate tests a QA engineer would write for regression,smoke,functional,integration suites");
    lines.push(`@source:${sourceName}`);
    lines.push("@out_fmt:json_array[{testCaseId,title,preConditions,testSteps,testData,expectedResult,priority,sourceIssueId,sapModule}]");
    lines.push("@out_rules:raw_json_only|no_markdown_wrap|no_code_block");
    lines.push("@rules:comprehensive|all_fields_required|specific_actionable|realistic_test_data|cover_positive_negative_edge|no_generic|env_aware|use_known_test_data_when_applicable");
    if (designDoc) {
      lines.push("@extra_context:design_document_provided—use it to improve accuracy,coverage,and specificity of generated test cases");
    }
    lines.push("---");
    GeminiService.appendQaContext(lines, project);
    if (designDoc) {
      lines.push("design_document{");
      lines.push(GeminiService.sanitizeToonValueForTestGen(designDoc, 2e4));
      lines.push("}");
      lines.push("---");
    }
    lines.push("field_spec{");
    lines.push(" testCaseId:sequential(TC-001,TC-002,...)");
    lines.push(" title:clear_descriptive");
    lines.push(" preConditions:state_before_execution");
    lines.push(" testSteps:numbered_step_by_step");
    lines.push(" testData:specific_values");
    lines.push(" expectedResult:pass_criteria");
    lines.push(" priority:one_of(Blocker,Major,Medium,Low)_based_on_issue_severity_and_impact");
    lines.push(" sourceIssueId:exact_id_of_the_source_issue_this_test_case_covers(IssueIdentifier_field_value)");
    lines.push(" sapModule:one_of(Cart,Checkout,Pricing,Promotions,CatalogSync,B2B,OMS,Personalization,CPQ)_only_if_applicable");
    lines.push("}");
    lines.push("---");
    lines.push("project_issues[");
    for (const task of tasks) {
      let entry = ` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId || task.externalId, 100)},title:${GeminiService.sanitizeToonValue(task.title, 300)},status:${task.status || "todo"},priority:${task.priority || "medium"}`;
      if (task.description) entry += `,desc:${GeminiService.sanitizeToonValueForTestGen(task.description, 2e3)}`;
      if (task.issueType) entry += `,type:${GeminiService.sanitizeToonValue(task.issueType, 100)}`;
      if (task.labels) entry += `,labels:${GeminiService.sanitizeToonValue(task.labels, 200)}`;
      entry += "}";
      lines.push(entry);
    }
    lines.push("]");
    return lines.join("\n");
  }
  static buildCriticalityAssessmentPrompt(tasks, testPlans, executions, project) {
    const lines = [];
    const allCases = testPlans.flatMap((tp) => tp.testCases || []);
    lines.push("@role:sr_qa_engineer");
    lines.push("@task:criticality_assessment");
    lines.push("@perspective:qa_engineer—assess release risk from QA standpoint considering environment health,test coverage gaps,checklist completion,blocker density");
    lines.push("@out_fmt:md_sections[## Failure Summary by Priority,## Overall Risk Level,## Key Areas of Concern,## Recommended Actions,## Release Readiness]");
    lines.push("@rules:concise|actionable|data_driven|risk_focused|all_sections_required|include_counts_per_priority(Blocker,Major,Medium,Low)|risk_level_one_of(Critical,High,Moderate,Low)|actions_ordered_by_severity|no_skip|no_merge");
    lines.push("---");
    GeminiService.appendQaContext(lines, project);
    const failedCases = allCases.filter((tc) => tc.status === "failed");
    const blockerFailed = failedCases.filter((tc) => tc.priority === "blocker").length;
    const majorFailed = failedCases.filter((tc) => tc.priority === "major").length;
    const mediumFailed = failedCases.filter((tc) => tc.priority === "medium").length;
    const lowFailed = failedCases.filter((tc) => tc.priority === "low").length;
    lines.push("failure_summary{");
    lines.push(` total_test_cases:${allCases.length}`);
    lines.push(` total_failed:${failedCases.length}`);
    lines.push(` blocker_failed:${blockerFailed}`);
    lines.push(` major_failed:${majorFailed}`);
    lines.push(` medium_failed:${mediumFailed}`);
    lines.push(` low_failed:${lowFailed}`);
    lines.push(` total_executions:${executions.length}`);
    lines.push(` total_test_plans:${testPlans.length}`);
    lines.push("}");
    if (tasks.length > 0) {
      lines.push("project_tasks[");
      for (const task of tasks.slice(0, 50)) {
        lines.push(` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 100)},title:${GeminiService.sanitizeToonValue(task.title, 300)},status:${task.status},priority:${task.priority}}`);
      }
      lines.push("]");
    }
    if (failedCases.length > 0) {
      lines.push("failed_test_cases[");
      for (const tc of failedCases.slice(0, 50)) {
        let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 100)},title:${GeminiService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority}`;
        if (tc.actualResult) entry += `,actual_result:${GeminiService.sanitizeToonValue(tc.actualResult, 200)}`;
        entry += "}";
        lines.push(entry);
      }
      lines.push("]");
    }
    return lines.join("\n");
  }
  static buildTestRunSuggestionsPrompt(testPlans, executions, project) {
    const lines = [];
    const allCases = testPlans.flatMap((tp) => tp.testCases || []);
    const total = allCases.length;
    const passed = allCases.filter((tc) => tc.status === "passed").length;
    const failed = allCases.filter((tc) => tc.status === "failed").length;
    const blocked = allCases.filter((tc) => tc.status === "blocked").length;
    const skipped = allCases.filter((tc) => tc.status === "skipped").length;
    const notRun = allCases.filter((tc) => tc.status === "not-run").length;
    const passRate = total > 0 ? (passed / total * 100).toFixed(1) : "0.0";
    lines.push("@role:sr_qa_engineer");
    lines.push("@task:test_run_suggestions");
    lines.push("@perspective:qa_engineer—give specific,actionable QA gate and deployment suggestions based on test run results,pass rates per plan,and failed test case impact");
    lines.push("@out_fmt:md_sections[## Overall Status,## Deployment Readiness,## Key Risks,## Suggestions]");
    lines.push("@rules:concise|specific|data_driven|bold_decisions|deployment_verdict_prominent|reference_failing_areas|no_generic_advice|all_sections_required");
    lines.push("---");
    GeminiService.appendQaContext(lines, project);
    lines.push("overall_stats{");
    lines.push(` total_cases:${total}`);
    lines.push(` passed:${passed}`);
    lines.push(` failed:${failed}`);
    lines.push(` blocked:${blocked}`);
    lines.push(` skipped:${skipped}`);
    lines.push(` not_run:${notRun}`);
    lines.push(` pass_rate:${passRate}%`);
    lines.push(` total_executions:${executions.length}`);
    lines.push("}");
    if (testPlans.length > 0) {
      lines.push("plan_results[");
      for (const plan of testPlans.slice(0, 20)) {
        const planCases = plan.testCases || [];
        const planTotal = planCases.length;
        const planPassed = planCases.filter((tc) => tc.status === "passed").length;
        const planFailed = planCases.filter((tc) => tc.status === "failed").length;
        const planBlocked = planCases.filter((tc) => tc.status === "blocked").length;
        const planRate = planTotal > 0 ? (planPassed / planTotal * 100).toFixed(1) : "0.0";
        lines.push(` {name:${GeminiService.sanitizeToonValue(plan.name, 200)},total:${planTotal},passed:${planPassed},failed:${planFailed},blocked:${planBlocked},pass_rate:${planRate}%}`);
      }
      lines.push("]");
    }
    const failedCases = allCases.filter((tc) => tc.status === "failed");
    if (failedCases.length > 0) {
      lines.push("failed_cases[");
      for (const tc of failedCases.slice(0, 50)) {
        let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 100)},title:${GeminiService.sanitizeToonValue(tc.title, 300)},priority:${tc.priority}`;
        if (tc.sapModule) entry += `,module:${tc.sapModule}`;
        if (tc.actualResult) entry += `,actual:${GeminiService.sanitizeToonValue(tc.actualResult, 200)}`;
        if (tc.sourceIssueId) entry += `,issue:${GeminiService.sanitizeToonValue(tc.sourceIssueId, 60)}`;
        entry += "}";
        lines.push(entry);
      }
      lines.push("]");
    }
    return lines.join("\n");
  }
  static buildSmokeSubsetPrompt(candidates, doneTasks, project) {
    const lines = [];
    lines.push("@role:sr_qa_engineer");
    lines.push("@task:smoke_subset_selection");
    lines.push("@goal:minimal_tc_set_max_regression_coverage");
    lines.push("@out_fmt:json_array_of_strings");
    lines.push("@out_rules:raw_json_only|no_wrap|ids_only|max_30");
    lines.push("@sel_rules:prefer(B>MAJ>MED>L)|cover_distinct_areas|no_dupes|exact_ids");
    lines.push("@schema:t=title|p=priority(B=Blocker,MAJ=Major,MED=Medium,L=Low)|s=status(F=Failed,P=Passed,BL=Blocked,SK=Skipped)|iss=source_issue_id");
    lines.push("---");
    GeminiService.appendQaContext(lines, project);
    if (doneTasks.length > 0) {
      lines.push("done[");
      for (const task of doneTasks.slice(0, 50)) {
        const p = task.priority === "critical" ? "B" : task.priority === "high" ? "MAJ" : task.priority === "medium" ? "MED" : "L";
        lines.push(` {id:${GeminiService.sanitizeToonValue(task.sourceIssueId, 60)},t:${GeminiService.sanitizeToonValue(task.title, 120)},p:${p}}`);
      }
      lines.push("]");
    }
    lines.push("tc[");
    for (const tc of candidates.slice(0, 200)) {
      const p = tc.priority === "blocker" ? "B" : tc.priority === "major" ? "MAJ" : tc.priority === "medium" ? "MED" : "L";
      const sMap = { failed: "F", passed: "P", blocked: "BL", skipped: "SK" };
      let entry = ` {id:${GeminiService.sanitizeToonValue(tc.displayId, 50)},t:${GeminiService.sanitizeToonValue(tc.title, 100)},p:${p}`;
      if (tc.status !== "not-run" && sMap[tc.status]) entry += `,s:${sMap[tc.status]}`;
      if (tc.sourceIssueId) entry += `,iss:${GeminiService.sanitizeToonValue(tc.sourceIssueId, 60)}`;
      entry += "}";
      lines.push(entry);
    }
    lines.push("]");
    return lines.join("\n");
  }
  // ── JSON Extraction ──────────────────────────────────────────────────────
  static extractFirstJsonArray(text) {
    let json = text.trim();
    if (json.startsWith("```")) {
      const start2 = json.indexOf("\n");
      if (start2 >= 0) {
        const end = json.lastIndexOf("```");
        if (end > start2) json = json.substring(start2 + 1, end).trim();
      }
    }
    const start = json.indexOf("[");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < json.length; i++) {
      const c = json[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) return json.substring(start, i + 1);
      }
    }
    return null;
  }
  // ── Public API methods ───────────────────────────────────────────────────
  /** Analyze a task issue using TOON prompts */
  async analyzeIssue(task, comments = [], project) {
    const prompt = GeminiService.buildToonPrompt(task, comments, project);
    try {
      const model = this.getModel("gemini-2.5-flash");
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch {
      const model = this.getModel("gemini-2.0-flash");
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
  }
  /** Generate test cases from tasks using TOON prompts */
  async generateTestCases(tasks, sourceName, project, designDoc) {
    const prompt = GeminiService.buildTestCaseGenerationPrompt(tasks, sourceName, project, designDoc);
    let text = "";
    try {
      const model = this.getModel("gemini-2.5-flash");
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch {
      const model = this.getModel("gemini-2.0-flash");
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }
    const extracted = GeminiService.extractFirstJsonArray(text);
    if (!extracted) throw new Error("Could not locate a JSON array in the model response.");
    const parsed = JSON.parse(extracted);
    return parsed.map((item, i) => ({
      title: item.title || `Test Case ${i + 1}`,
      preConditions: item.preConditions || "",
      steps: item.testSteps || item.steps || "",
      testData: item.testData || "",
      expectedResult: item.expectedResult || "",
      priority: (item.priority || "medium").toLowerCase(),
      sourceIssueId: item.sourceIssueId || "",
      sapModule: item.sapModule || void 0
    }));
  }
  /** Criticality assessment for the current test state */
  async assessCriticality(tasks, testPlans, executions, project) {
    const prompt = GeminiService.buildCriticalityAssessmentPrompt(tasks, testPlans, executions, project);
    try {
      const model = this.getModel("gemini-2.5-flash");
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch {
      const model = this.getModel("gemini-2.0-flash");
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
  }
  /** Test run suggestions / deployment readiness */
  async getTestRunSuggestions(testPlans, executions, project) {
    const prompt = GeminiService.buildTestRunSuggestionsPrompt(testPlans, executions, project);
    try {
      const model = this.getModel("gemini-2.5-flash");
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch {
      const model = this.getModel("gemini-2.0-flash");
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
  }
  /** Select a minimal smoke test subset from candidates */
  async selectSmokeSubset(candidates, doneTasks, project) {
    const prompt = GeminiService.buildSmokeSubsetPrompt(candidates, doneTasks, project);
    let text = "";
    try {
      const model = this.getModel("gemini-2.5-flash");
      const result = await model.generateContent(prompt);
      text = result.response.text();
    } catch {
      const model = this.getModel("gemini-2.0-flash");
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }
    const extracted = GeminiService.extractFirstJsonArray(text);
    if (!extracted) return [];
    return JSON.parse(extracted);
  }
  /** Legacy compat wrapper for simple project analysis */
  async analyzeProject(projectContext) {
    const model = this.getModel("gemini-2.0-flash");
    const prompt = `You are a senior QA engineer. Analyze the following project context and suggest 3 key strategic improvements for the QA cycle:

${projectContext}

Provide output in these sections:
## Strategic Gaps
## Coverage Optimization
## Risk Assessment`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}
export {
  GeminiService
};
