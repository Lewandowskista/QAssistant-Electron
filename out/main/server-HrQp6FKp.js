import electron from "electron";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
const { app } = electron;
const server = express();
server.use(cors());
server.use(bodyParser.json());
let authToken = "qassistant-default-token";
let serverInstance = null;
function startServer(apiToken, port = 3030) {
  authToken = apiToken;
  const getDataPath = () => path.join(app.getPath("userData"), "QAssistantData", "projects.json");
  const readProjects = () => {
    try {
      if (!fs.existsSync(getDataPath())) return [];
      return JSON.parse(fs.readFileSync(getDataPath(), "utf8"));
    } catch {
      return [];
    }
  };
  const writeProjects = (projects) => {
    fs.writeFileSync(getDataPath(), JSON.stringify(projects, null, 2));
  };
  server.get("/health", (_req, res) => {
    res.json({
      status: "active",
      version: app.getVersion(),
      uptime: Math.floor(process.uptime()),
      platform: process.platform,
      dataPath: getDataPath()
    });
  });
  server.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${authToken}`) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized. Bearer token required." });
    }
  });
  server.get("/projects", (_req, res) => {
    try {
      const projects = readProjects();
      res.json(projects.map((p) => ({
        id: p.id,
        name: p.name,
        taskCount: p.tasks?.length || 0,
        testPlanCount: p.testPlans?.length || 0,
        testCaseCount: p.testPlans?.flatMap((tp) => tp.testCases || []).length || 0
      })));
    } catch (e) {
      res.status(500).json({ error: "Failed to read project data.", detail: e.message });
    }
  });
  server.get("/projects/:id", (req, res) => {
    try {
      const projects = readProjects();
      const project = projects.find((p) => p.id === req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found." });
      res.json(project);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  server.get("/testcases", (req, res) => {
    try {
      const projects = readProjects();
      const projectId = req.query.projectId;
      const planId = req.query.planId;
      const status = req.query.status;
      const results = [];
      for (const project of projects) {
        if (projectId && project.id !== projectId) continue;
        for (const plan of project.testPlans || []) {
          if (planId && plan.id !== planId) continue;
          for (const tc of plan.testCases || []) {
            if (status && tc.status !== status) continue;
            results.push({
              ...tc,
              planId: plan.id,
              planName: plan.name,
              projectId: project.id,
              projectName: project.name
            });
          }
        }
      }
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  server.get("/testcases/:displayId", (req, res) => {
    try {
      const projects = readProjects();
      const displayId = req.params.displayId;
      for (const project of projects) {
        for (const plan of project.testPlans || []) {
          const tc = plan.testCases?.find((t) => t.displayId === displayId);
          if (tc) {
            return res.json({ ...tc, planId: plan.id, planName: plan.name, projectId: project.id });
          }
        }
      }
      res.status(404).json({ error: `Test case '${displayId}' not found.` });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  server.post("/results", (req, res) => {
    const { displayId, status, actualResult, notes } = req.body;
    if (!displayId || !status) {
      return res.status(400).json({ error: "Required fields: displayId, status" });
    }
    const validStatuses = ["passed", "failed", "blocked", "skipped", "not-run"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }
    try {
      const projects = readProjects();
      let found = false;
      for (const project of projects) {
        for (const plan of project.testPlans || []) {
          const tc = plan.testCases?.find((t) => t.displayId === displayId);
          if (tc) {
            tc.status = status;
            if (actualResult) tc.actualResult = actualResult;
            tc.updatedAt = Date.now();
            const execution = {
              id: crypto.randomUUID(),
              testCaseId: tc.id,
              testPlanId: plan.id,
              result: status,
              actualResult: actualResult || "Automated result",
              notes: notes || "Submitted via Automation API",
              executedAt: Date.now(),
              snapshotTestCaseTitle: tc.title
            };
            project.testExecutions = [execution, ...project.testExecutions || []];
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) return res.status(404).json({ error: `Test case '${displayId}' not found.` });
      writeProjects(projects);
      res.json({ success: true, message: `Result recorded for ${displayId}` });
    } catch (e) {
      res.status(500).json({ error: "Failed to record result.", detail: e.message });
    }
  });
  server.post("/results/batch", (req, res) => {
    const results = req.body?.results;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'Request body must have a "results" array.' });
    }
    try {
      const projects = readProjects();
      const summary = [];
      for (const item of results) {
        const { displayId, status, actualResult, notes } = item;
        if (!displayId || !status) {
          summary.push({ displayId, success: false, error: "Missing displayId or status" });
          continue;
        }
        let found = false;
        for (const project of projects) {
          for (const plan of project.testPlans || []) {
            const tc = plan.testCases?.find((t) => t.displayId === displayId);
            if (tc) {
              tc.status = status;
              if (actualResult) tc.actualResult = actualResult;
              tc.updatedAt = Date.now();
              const execution = {
                id: crypto.randomUUID(),
                testCaseId: tc.id,
                testPlanId: plan.id,
                result: status,
                actualResult: actualResult || "Automated result",
                notes: notes || "Batch submitted via Automation API",
                executedAt: Date.now(),
                snapshotTestCaseTitle: tc.title
              };
              project.testExecutions = [execution, ...project.testExecutions || []];
              found = true;
              break;
            }
          }
          if (found) break;
        }
        summary.push({ displayId, success: found, error: found ? void 0 : "Not found" });
      }
      writeProjects(projects);
      res.json({ success: true, results: summary });
    } catch (e) {
      res.status(500).json({ error: "Batch operation failed.", detail: e.message });
    }
  });
  server.get("/executions", (req, res) => {
    try {
      const projects = readProjects();
      const projectId = req.query.projectId;
      const limit = parseInt(req.query.limit || "100", 10);
      const all = [];
      for (const project of projects) {
        if (projectId && project.id !== projectId) continue;
        for (const ex of project.testExecutions || []) {
          all.push({ ...ex, projectId: project.id, projectName: project.name });
        }
      }
      all.sort((a, b) => b.executedAt - a.executedAt);
      res.json(all.slice(0, limit));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  if (serverInstance) return;
  serverInstance = server.listen(port, () => {
    console.log(`[QAssistant] Automation API running on port ${port}`);
  });
  serverInstance.on("error", (err) => {
    console.error("[QAssistant] API server error:", err.message);
  });
}
function stopServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}
export {
  startServer,
  stopServer
};
