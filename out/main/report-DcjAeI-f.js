function csvEscape(value) {
  if (!value) return "";
  let s = value;
  if (s.length > 0 && ["=", "+", "-", "@", "	", "\r"].includes(s[0])) {
    s = "'" + s;
  }
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function generateTestCasesCsv(project, filterPlanIds) {
  const plans = filterPlanIds ? (project.testPlans || []).filter((p) => filterPlanIds.includes(p.id)) : project.testPlans || [];
  const rows = [
    "Test Plan ID,Test Plan Name,Test Case ID,Title,Status,Pre-Conditions,Test Steps,Test Data,Expected Result,Actual Result,Source,Generated At"
  ];
  for (const plan of [...plans].sort((a, b) => (a.testPlanId || a.name).localeCompare(b.testPlanId || b.name))) {
    const cases = (plan.testCases || []).sort((a, b) => (a.testCaseId || "").localeCompare(b.testCaseId || ""));
    for (const tc of cases) {
      rows.push([
        csvEscape(plan.testPlanId || ""),
        csvEscape(plan.name),
        csvEscape(tc.testCaseId || ""),
        csvEscape(tc.title),
        csvEscape(tc.status || ""),
        csvEscape(tc.preConditions || ""),
        csvEscape(tc.steps || tc.testSteps || ""),
        csvEscape(tc.testData || ""),
        csvEscape(tc.expectedResult || ""),
        csvEscape(tc.actualResult || ""),
        csvEscape(tc.source || "Manual"),
        csvEscape(tc.createdAt || (/* @__PURE__ */ new Date()).toISOString().substring(0, 16).replace("T", " "))
      ].join(","));
    }
  }
  return rows.join("\n");
}
function generateExecutionsCsv(project, filterIds) {
  const executions = filterIds ? (project.testExecutions || []).filter((e) => filterIds.includes(e.id || "")) : project.testExecutions || [];
  const testCaseLookup = /* @__PURE__ */ new Map();
  const testPlanLookup = /* @__PURE__ */ new Map();
  for (const plan of project.testPlans || []) {
    testPlanLookup.set(plan.id, plan);
    for (const tc of plan.testCases || []) {
      if (tc.id) testCaseLookup.set(tc.id, tc);
    }
  }
  const rows = [
    "Execution ID,Test Case ID,Test Case Title,Test Plan ID,Result,Actual Result,Notes,Executed At"
  ];
  const sorted = [...executions].sort(
    (a, b) => new Date(b.executedAt || 0).getTime() - new Date(a.executedAt || 0).getTime()
  );
  for (const exec of sorted) {
    const tc = exec.testCaseId ? testCaseLookup.get(exec.testCaseId) : void 0;
    const plan = exec.testPlanId ? testPlanLookup.get(exec.testPlanId) : void 0;
    rows.push([
      csvEscape(exec.executionId || exec.id || ""),
      csvEscape(tc?.testCaseId || "N/A"),
      csvEscape(tc?.title || "Deleted"),
      csvEscape(plan?.testPlanId || plan?.name || "N/A"),
      csvEscape(exec.result || ""),
      csvEscape(exec.actualResult || ""),
      csvEscape(exec.notes || ""),
      csvEscape(exec.executedAt ? exec.executedAt.substring(0, 16).replace("T", " ") : "")
    ].join(","));
  }
  return rows.join("\n");
}
function generateTestSummaryMarkdown(project, filterPlanIds, criticalityAssessment) {
  const plans = filterPlanIds ? (project.testPlans || []).filter((p) => filterPlanIds.includes(p.id)) : project.testPlans || [];
  const allExecs = project.testExecutions || [];
  const allCases = plans.flatMap((p) => p.testCases || []);
  const passed = allCases.filter((c) => c.status === "passed").length;
  const failed = allCases.filter((c) => c.status === "failed").length;
  const blocked = allCases.filter((c) => c.status === "blocked").length;
  const skipped = allCases.filter((c) => c.status === "skipped").length;
  const notRun = allCases.filter((c) => !c.status || c.status === "not-run").length;
  const total = allCases.length;
  const passRate = total > 0 ? (passed / total * 100).toFixed(1) : "0.0";
  const lines = [];
  const now = (/* @__PURE__ */ new Date()).toLocaleString();
  lines.push(`# Test Summary Report`);
  lines.push(`**Project:** ${project.name}  `);
  lines.push(`**Generated:** ${now}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Test Plans | ${plans.length} |`);
  lines.push(`| Total Test Cases | ${total} |`);
  lines.push(`| Total Executions | ${allExecs.length} |`);
  lines.push(`| Pass Rate | ${passRate}% |`);
  lines.push("");
  lines.push("## Status Breakdown");
  lines.push("");
  lines.push("| Status | Count | % |");
  lines.push("|--------|-------|---|");
  const statuses = [
    ["✅ Passed", passed],
    ["❌ Failed", failed],
    ["🟡 Blocked", blocked],
    ["⏭️ Skipped", skipped],
    ["⬜ Not Run", notRun]
  ];
  for (const [label, count] of statuses) {
    const pct = total > 0 ? (+count / total * 100).toFixed(1) : "0.0";
    lines.push(`| ${label} | ${count} | ${pct}% |`);
  }
  lines.push("");
  lines.push("## Test Plans");
  lines.push("");
  for (const plan of [...plans].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())) {
    const cases = plan.testCases || [];
    const planPassed = cases.filter((c) => c.status === "passed").length;
    const planFailed = cases.filter((c) => c.status === "failed").length;
    const planRate = cases.length > 0 ? (planPassed / cases.length * 100).toFixed(0) : "0";
    lines.push(`### ${plan.testPlanId || ""} — ${plan.name}`);
    lines.push(`*${cases.length} cases · ${planRate}% pass rate (${planPassed} passed, ${planFailed} failed)*`);
    lines.push("");
    if (cases.length > 0) {
      lines.push("| ID | Title | Status | Priority |");
      lines.push("|----|-------|--------|----------|");
      for (const tc of [...cases].sort((a, b) => (a.testCaseId || "").localeCompare(b.testCaseId || ""))) {
        const statusIcon = tc.status === "passed" ? "✅" : tc.status === "failed" ? "❌" : tc.status === "blocked" ? "🟡" : "⬜";
        const shortTitle = tc.title.length > 60 ? tc.title.substring(0, 57) + "..." : tc.title;
        lines.push(`| \`${tc.testCaseId || ""}\` | ${shortTitle} | ${statusIcon} ${tc.status || "not-run"} | ${tc.priority || "medium"} |`);
      }
      lines.push("");
    }
  }
  const recentExecs = [...allExecs].sort((a, b) => new Date(b.executedAt || 0).getTime() - new Date(a.executedAt || 0).getTime()).slice(0, 30);
  if (recentExecs.length > 0) {
    const testCaseLookup = /* @__PURE__ */ new Map();
    for (const plan of plans) {
      for (const tc of plan.testCases || []) {
        if (tc.id) testCaseLookup.set(tc.id, tc);
      }
    }
    lines.push("## Recent Executions");
    lines.push("");
    lines.push("| Execution | Test Case | Result | Date |");
    lines.push("|-----------|-----------|--------|------|");
    for (const exec of recentExecs) {
      const tc = exec.testCaseId ? testCaseLookup.get(exec.testCaseId) : void 0;
      const tcLabel = tc ? `\`${tc.testCaseId}\` ${tc.title.substring(0, 30)}...` : "Deleted";
      const date = exec.executedAt ? exec.executedAt.substring(0, 16).replace("T", " ") : "";
      const resultIcon = exec.result === "passed" ? "✅" : exec.result === "failed" ? "❌" : "⬜";
      lines.push(`| \`${exec.executionId || exec.id || ""}\` | ${tcLabel} | ${resultIcon} ${exec.result || ""} | ${date} |`);
    }
    lines.push("");
  }
  if (criticalityAssessment) {
    lines.push("---");
    lines.push("");
    lines.push("## AI Criticality Assessment");
    lines.push("");
    lines.push("*AI-generated analysis based on project data, test cases, and execution results*");
    lines.push("");
    lines.push(criticalityAssessment);
    lines.push("");
  }
  lines.push("---");
  lines.push(`*QAssistant · ${project.name} · ${(/* @__PURE__ */ new Date()).toISOString().substring(0, 10)}*`);
  return lines.join("\n");
}
function autoDetectCsvMappings(headers) {
  const aliases = {
    Title: ["Title", "Name", "Summary", "Test Name", "Test Case Name", "Test Case", "Subject"],
    testCaseId: ["ID", "Test ID", "Test Case ID", "TestCaseId", "Identifier", "Key", "Case ID", "Ref", "Number"],
    preConditions: ["PreConditions", "Pre-conditions", "Pre Conditions", "Preconditions", "Setup", "Prerequisites"],
    steps: ["TestSteps", "Test Steps", "Steps", "Steps to Reproduce", "Actions", "Test Actions", "Step Description"],
    testData: ["TestData", "Test Data", "Data", "Input Data", "Test Input", "Inputs"],
    expectedResult: ["ExpectedResult", "Expected Result", "Expected", "Expected Outcome", "Expected Output", "Pass Criteria"],
    actualResult: ["ActualResult", "Actual Result", "Actual", "Actual Outcome", "Actual Output"],
    status: ["Status", "Result", "Test Result", "Execution Status", "Outcome", "Run Status"],
    priority: ["Priority", "Severity", "Importance", "Level", "Criticality"],
    sourceIssueId: ["SourceIssueId", "Issue ID", "Issue Key", "Linked Issue", "Related Issue", "Jira ID", "Linear ID"]
  };
  const map = {};
  for (const header of headers) {
    for (const [field, aliasList] of Object.entries(aliases)) {
      if (aliasList.some((a) => a.toLowerCase() === header.toLowerCase())) {
        if (!map[header]) map[header] = field;
        break;
      }
    }
    if (!map[header]) map[header] = "(Ignore)";
  }
  return map;
}
function parseCsvString(content) {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < values.length ? values[j] : "";
    }
    rows.push(row);
  }
  return { headers, rows };
}
function splitCsvLine(line) {
  const fields = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current.trim());
  return fields;
}
function mapCsvRowToTestCase(row, columnMap) {
  const tc = {};
  for (const [csvCol, tcField] of Object.entries(columnMap)) {
    if (tcField === "(Ignore)") continue;
    const val = row[csvCol];
    if (!val) continue;
    tc[tcField] = val;
  }
  return tc;
}
export {
  autoDetectCsvMappings,
  generateExecutionsCsv,
  generateTestCasesCsv,
  generateTestSummaryMarkdown,
  mapCsvRowToTestCase,
  parseCsvString
};
