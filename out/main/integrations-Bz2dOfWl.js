function mapLinearStatus(stateName) {
  const s = stateName.toLowerCase();
  if (["backlog", "triage", "unstarted"].includes(s)) return "backlog";
  if (s === "todo") return "todo";
  if (["in progress", "started", "doing"].includes(s)) return "in-progress";
  if (["in review", "review", "qa"].includes(s)) return "in-review";
  if (["done", "completed", "closed"].includes(s)) return "done";
  if (["canceled", "cancelled"].includes(s)) return "canceled";
  if (s === "duplicate") return "duplicate";
  return "backlog";
}
function mapLinearPriority(priority) {
  if (priority === 1) return "critical";
  if (priority === 2) return "high";
  if (priority === 3) return "medium";
  return "low";
}
function cleanDescription(raw) {
  if (!raw) return "";
  let s = raw;
  s = s.replace(/!\[.*?\]\(.*?\)/g, "");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/https?:\/\/[^\s)"\]]+\.(?:png|jpe?g|gif|webp|svg|bmp|mp4|webm|mov)(?:\?[^\s)"\]]*)?/gi, "");
  s = s.replace(/#{1,6}\s/g, "");
  s = s.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  s = s.replace(/```[\s\S]*?```/g, "[code block]");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}
async function linearGraphQL(apiKey, query, variables) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiKey
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`Linear API HTTP ${res.status}: ${res.statusText}`);
  const result = await res.json();
  if (result.errors?.length > 0) throw new Error(result.errors[0].message);
  return result;
}
async function resolveLinearTeamUuid(apiKey, teamId) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) {
    return teamId;
  }
  const teams = await getLinearTeams(apiKey);
  const found = teams.find(
    (t) => t.key?.toLowerCase() === teamId.toLowerCase() || t.name?.toLowerCase() === teamId.toLowerCase() || t.id === teamId
  );
  return found?.id || null;
}
async function getLinearTeams(apiKey) {
  const query = `{ teams { nodes { id key name } } }`;
  const result = await linearGraphQL(apiKey, query);
  return result.data?.teams?.nodes || [];
}
async function fetchLinearIssues(apiKey, teamKey, connectionId) {
  const resolvedTeamId = teamKey ? await resolveLinearTeamUuid(apiKey, teamKey) : null;
  const allTasks = [];
  let cursor = null;
  let pagesFetched = 0;
  const MAX_PAGES = 10;
  do {
    let result;
    if (resolvedTeamId) {
      const query = `
            query($teamId: String!, $after: String) {
                team(id: $teamId) {
                    issues(first: 250, after: $after) {
                        pageInfo { hasNextPage endCursor }
                        nodes {
                            id identifier title description priority
                            state { name }
                            assignee { name }
                            dueDate url
                            labels { nodes { name } }
                            attachments { nodes { url title } }
                        }
                    }
                }
            }`;
      const vars = { teamId: resolvedTeamId };
      if (cursor) vars.after = cursor;
      result = await linearGraphQL(apiKey, query, vars);
      const issuesEl = result.data?.team?.issues;
      parseLinearNodes(issuesEl?.nodes || [], allTasks, connectionId);
      cursor = null;
      if (issuesEl?.pageInfo?.hasNextPage) cursor = issuesEl.pageInfo.endCursor;
    } else {
      const query = `
            query($after: String) {
                issues(first: 250, after: $after) {
                    pageInfo { hasNextPage endCursor }
                    nodes {
                        id identifier title description priority
                        state { name }
                        assignee { name }
                        dueDate url
                        labels { nodes { name } }
                        attachments { nodes { url title } }
                    }
                }
            }`;
      const vars = {};
      if (cursor) vars.after = cursor;
      result = await linearGraphQL(apiKey, query, vars);
      const issuesEl = result.data?.issues;
      parseLinearNodes(issuesEl?.nodes || [], allTasks, connectionId);
      cursor = null;
      if (issuesEl?.pageInfo?.hasNextPage) cursor = issuesEl.pageInfo.endCursor;
    }
    pagesFetched++;
  } while (cursor && pagesFetched < MAX_PAGES);
  return allTasks;
}
function parseLinearNodes(nodes, tasks, connectionId) {
  for (const node of nodes) {
    const stateName = node.state?.name || "";
    const labels = (node.labels?.nodes || []).map((l) => l.name).join(", ");
    const attachmentUrls = (node.attachments?.nodes || []).map((a) => a.url).filter(Boolean);
    tasks.push({
      id: crypto.randomUUID(),
      externalId: node.id,
      sourceIssueId: node.identifier || "",
      title: node.title || "",
      description: cleanDescription(node.description),
      rawDescription: node.description || "",
      status: mapLinearStatus(stateName),
      priority: mapLinearPriority(node.priority || 0),
      ticketUrl: node.url || "",
      assignee: node.assignee?.name || "",
      labels,
      dueDate: node.dueDate ? new Date(node.dueDate).getTime() : void 0,
      source: "linear",
      connectionId,
      attachmentUrls,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
}
async function getLinearComments(apiKey, issueId) {
  const query = `
    query($issueId: String!) {
        issue(id: $issueId) {
            comments {
                nodes { body createdAt user { name } }
            }
        }
    }`;
  const result = await linearGraphQL(apiKey, query, { issueId });
  const nodes = result.data?.issue?.comments?.nodes || [];
  return nodes.map((n) => ({
    body: cleanDescription(n.body),
    authorName: n.user?.name || "Unknown",
    createdAt: n.createdAt ? new Date(n.createdAt).getTime() : Date.now()
  }));
}
async function addLinearComment(apiKey, issueId, body) {
  const mutation = `
    mutation($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`;
  await linearGraphQL(apiKey, mutation, { issueId, body });
}
async function getLinearWorkflowStates(apiKey) {
  const query = `{ workflowStates(first: 200) { nodes { id name } } }`;
  const result = await linearGraphQL(apiKey, query);
  return result.data?.workflowStates?.nodes || [];
}
async function updateLinearIssueStatus(apiKey, issueId, stateId) {
  const mutation = `
    mutation($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }`;
  await linearGraphQL(apiKey, mutation, { issueId, stateId });
}
async function getLinearIssueHistory(apiKey, issueId) {
  const query = `
    query($issueId: String!) {
        issue(id: $issueId) {
            history(first: 50) {
                nodes {
                    createdAt actor { name }
                    fromState { name } toState { name }
                    fromPriority toPriority
                    fromAssignee { name } toAssignee { name }
                }
            }
        }
    }`;
  const result = await linearGraphQL(apiKey, query, { issueId });
  const nodes = result.data?.issue?.history?.nodes || [];
  const entries = [];
  for (const node of nodes) {
    const author = node.actor?.name || "";
    const timestamp = node.createdAt ? new Date(node.createdAt).getTime() : Date.now();
    if (node.fromState && node.toState) {
      entries.push({ timestamp, author, field: "Status", fromValue: node.fromState.name, toValue: node.toState.name });
    }
    if (node.fromPriority != null && node.toPriority != null) {
      entries.push({ timestamp, author, field: "Priority", fromValue: linearPriorityName(node.fromPriority), toValue: linearPriorityName(node.toPriority) });
    }
    if (node.fromAssignee !== void 0 && node.toAssignee !== void 0) {
      const from = node.fromAssignee?.name || "Unassigned";
      const to = node.toAssignee?.name || "Unassigned";
      if (from !== to) entries.push({ timestamp, author, field: "Assignee", fromValue: from, toValue: to });
    }
  }
  return entries;
}
function linearPriorityName(priority) {
  const names = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
  return names[priority] ?? `Priority ${priority}`;
}
async function createLinearIssue(apiKey, teamId, title, description, priority = 3) {
  const resolvedTeamId = await resolveLinearTeamUuid(apiKey, teamId);
  if (!resolvedTeamId) throw new Error(`Could not resolve Linear team '${teamId}'.`);
  const mutation = `
    mutation($teamId: String!, $title: String!, $description: String!, $priority: Int!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority }) {
            success issue { url identifier }
        }
    }`;
  const result = await linearGraphQL(apiKey, mutation, { teamId: resolvedTeamId, title, description, priority });
  return result.data?.issueCreate?.issue?.url || null;
}
function mapJiraStatus(statusName) {
  const s = statusName.toLowerCase();
  if (["to do", "open", "new", "backlog"].includes(s)) return "todo";
  if (["in progress", "in development", "in-progress", "started"].includes(s)) return "in-progress";
  if (["in review", "in testing", "code review", "qa"].includes(s)) return "in-review";
  if (["done", "closed", "resolved", "completed"].includes(s)) return "done";
  if (["canceled", "cancelled", "wont fix", "won't do"].includes(s)) return "canceled";
  if (s === "duplicate") return "duplicate";
  return "backlog";
}
function mapJiraPriority(priorityName) {
  if (!priorityName) return "medium";
  const p = priorityName.toLowerCase();
  if (p === "blocker" || p === "critical") return "critical";
  if (p === "major" || p === "high") return "high";
  if (p === "minor" || p === "low") return "low";
  return "medium";
}
function extractJiraDescription(adfOrText) {
  if (!adfOrText) return "";
  if (typeof adfOrText === "string") return adfOrText;
  if (adfOrText.type === "doc") {
    return extractAdfText(adfOrText);
  }
  return JSON.stringify(adfOrText);
}
function extractAdfText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  const parts = [];
  if (node.content) {
    for (const child of node.content) {
      parts.push(extractAdfText(child));
    }
  }
  const separator = ["paragraph", "bulletList", "orderedList", "listItem", "heading"].includes(node.type) ? "\n" : "";
  return parts.join(separator);
}
async function fetchJiraIssues(domain, email, apiKey, projectKey, connectionId) {
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const base = domain.includes(".") ? `https://${domain}` : `https://${domain}.atlassian.net`;
  const allIssues = [];
  let startAt = 0;
  const maxResults = 100;
  const MAX_PAGES = 25;
  for (let page = 0; page < MAX_PAGES; page++) {
    const jql = projectKey ? `project=${projectKey}` : "ORDER BY updated DESC";
    const url = `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,priority,status,assignee,duedate,labels,issuetype,comment,attachment,url`;
    const res = await fetch(url, {
      headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" }
    });
    if (!res.ok) throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const issues = data.issues || [];
    for (const issue of issues) {
      const f = issue.fields;
      const labels = (f.labels || []).join(", ");
      const attachmentUrls = (f.attachment || []).map((a) => a.content).filter(Boolean);
      allIssues.push({
        id: crypto.randomUUID(),
        externalId: issue.id,
        sourceIssueId: issue.key,
        title: f.summary || "",
        description: cleanDescription(extractJiraDescription(f.description)),
        status: mapJiraStatus(f.status?.name || ""),
        priority: mapJiraPriority(f.priority?.name),
        assignee: f.assignee?.displayName || "",
        labels,
        dueDate: f.duedate ? new Date(f.duedate).getTime() : void 0,
        issueType: f.issuetype?.name || "",
        ticketUrl: `${base}/browse/${issue.key}`,
        source: "jira",
        connectionId,
        attachmentUrls,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    if (issues.length < maxResults || startAt + issues.length >= (data.total || 0)) break;
    startAt += issues.length;
  }
  return allIssues;
}
async function getJiraComments(domain, email, apiKey, issueKey) {
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const base = domain.includes(".") ? `https://${domain}` : `https://${domain}.atlassian.net`;
  const res = await fetch(`${base}/rest/api/3/issue/${issueKey}/comment`, {
    headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.comments || []).map((c) => ({
    body: cleanDescription(extractJiraDescription(c.body)),
    authorName: c.author?.displayName || "Unknown",
    createdAt: new Date(c.created).getTime()
  }));
}
async function addJiraComment(domain, email, apiKey, issueKey, body) {
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const base = domain.includes(".") ? `https://${domain}` : `https://${domain}.atlassian.net`;
  await fetch(`${base}/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] }
    })
  });
}
async function transitionJiraIssue(domain, email, apiKey, issueKey, transitionName) {
  const creds = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const baseUrl = `https://${domain}.atlassian.net/rest/api/3`;
  const transResp = await fetch(`${baseUrl}/issue/${issueKey}/transitions`, {
    headers: { Authorization: `Basic ${creds}`, Accept: "application/json" }
  });
  if (!transResp.ok) throw new Error(`Failed to get transitions: ${transResp.status}`);
  const transData = await transResp.json();
  const match = transData.transitions?.find(
    (t) => t.name?.toLowerCase() === transitionName.toLowerCase() || t.to?.name?.toLowerCase() === transitionName.toLowerCase()
  );
  if (!match) throw new Error(`Transition '${transitionName}' not available for ${issueKey}`);
  const doResp = await fetch(`${baseUrl}/issue/${issueKey}/transitions`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ transition: { id: match.id } })
  });
  if (!doResp.ok) throw new Error(`Transition failed: ${doResp.status}`);
}
async function getJiraIssueHistory(domain, email, apiKey, issueKey) {
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const base = domain.includes(".") ? `https://${domain}` : `https://${domain}.atlassian.net`;
  const url = `${base}/rest/api/3/issue/${issueKey}?expand=changelog&fields=summary`;
  const res = await fetch(url, {
    headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const entries = [];
  if (data.changelog && data.changelog.histories) {
    for (const history of data.changelog.histories) {
      const author = history.author?.displayName || "Unknown";
      const timestamp = new Date(history.created).getTime();
      if (history.items) {
        for (const item of history.items) {
          entries.push({
            timestamp,
            author,
            field: item.field || "Unknown",
            fromValue: item.fromString || "",
            toValue: item.toString || ""
          });
        }
      }
    }
  }
  return entries;
}
async function getJiraProjects(domain, email, apiKey) {
  const creds = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const resp = await fetch(`https://${domain}.atlassian.net/rest/api/3/project`, {
    headers: { Authorization: `Basic ${creds}`, Accept: "application/json" }
  });
  if (!resp.ok) throw new Error(`Jira API returned ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();
  return Array.isArray(data) ? data.map((p) => ({ id: p.id, key: p.key, name: p.name })) : [];
}
export {
  addJiraComment,
  addLinearComment,
  createLinearIssue,
  fetchJiraIssues,
  fetchLinearIssues,
  getJiraComments,
  getJiraIssueHistory,
  getJiraProjects,
  getLinearComments,
  getLinearIssueHistory,
  getLinearTeams,
  getLinearWorkflowStates,
  transitionJiraIssue,
  updateLinearIssueStatus
};
