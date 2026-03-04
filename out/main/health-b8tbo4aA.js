const healthMap = /* @__PURE__ */ new Map();
let healthTimer = null;
function getAllHealth() {
  const result = {};
  for (const [id, entry] of healthMap.entries()) {
    result[id] = entry;
  }
  return result;
}
async function pingOne(env) {
  const url = env.healthCheckUrl || env.baseUrl;
  if (!url) {
    healthMap.set(env.id, { status: "unknown", lastChecked: (/* @__PURE__ */ new Date()).toISOString() });
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(1e4)
    });
    healthMap.set(env.id, {
      status: res.ok ? "healthy" : "unhealthy",
      lastChecked: (/* @__PURE__ */ new Date()).toISOString(),
      latencyMs: Date.now() - start
    });
  } catch {
    healthMap.set(env.id, {
      status: "unhealthy",
      lastChecked: (/* @__PURE__ */ new Date()).toISOString(),
      latencyMs: Date.now() - start
    });
  }
}
async function checkEnvironmentsNow(environments) {
  await Promise.all(environments.map(pingOne));
  return getAllHealth();
}
function startHealthService(environments, intervalMs = 3e4) {
  stopHealthService();
  checkEnvironmentsNow(environments).catch(() => {
  });
  healthTimer = setInterval(() => {
    checkEnvironmentsNow(environments).catch(() => {
    });
  }, intervalMs);
}
function stopHealthService() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}
const CCv2_BASE = "https://portalrotapi.hana.ondemand.com";
function str(obj, key) {
  return obj?.[key] ?? "";
}
function makeHeaders(apiToken) {
  return {
    "Authorization": `Bearer ${apiToken}`,
    "Accept": "application/json"
  };
}
async function ccv2GetEnvironments(subscriptionCode, apiToken, apiBase = CCv2_BASE) {
  const url = `${apiBase}/v2/subscriptions/${encodeURIComponent(subscriptionCode)}/environments`;
  const res = await fetch(url, { headers: makeHeaders(apiToken), signal: AbortSignal.timeout(3e4) });
  if (!res.ok) throw new Error(`CCv2 environments failed: ${res.status}`);
  const json = await res.json();
  return (json.value || []).map((item) => ({
    code: str(item, "code"),
    name: str(item, "name"),
    status: str(item, "status"),
    deploymentStatus: str(item, "deploymentStatus")
  }));
}
async function ccv2GetDeployments(subscriptionCode, apiToken, environmentCode, top = 20, apiBase = CCv2_BASE) {
  let qs = `$top=${top}&$orderby=scheduledTimestamp%20desc`;
  if (environmentCode) qs += `&environmentCode=${encodeURIComponent(environmentCode)}`;
  const url = `${apiBase}/v2/subscriptions/${encodeURIComponent(subscriptionCode)}/deployments?${qs}`;
  const res = await fetch(url, { headers: makeHeaders(apiToken), signal: AbortSignal.timeout(3e4) });
  if (!res.ok) throw new Error(`CCv2 deployments failed: ${res.status}`);
  const json = await res.json();
  return (json.value || []).map((item) => ({
    code: str(item, "code"),
    environmentCode: str(item, "environmentCode"),
    buildCode: str(item, "buildCode"),
    status: str(item, "status"),
    strategy: str(item, "strategy"),
    createdAt: str(item, "createdTimestamp"),
    deployedAt: str(item, "deployedTimestamp")
  }));
}
async function ccv2GetBuild(subscriptionCode, apiToken, buildCode, apiBase = CCv2_BASE) {
  try {
    const url = `${apiBase}/v2/subscriptions/${encodeURIComponent(subscriptionCode)}/builds/${encodeURIComponent(buildCode)}`;
    const res = await fetch(url, { headers: makeHeaders(apiToken), signal: AbortSignal.timeout(3e4) });
    if (!res.ok) return null;
    const item = await res.json();
    return {
      code: str(item, "code"),
      name: str(item, "name"),
      buildStatus: str(item, "buildStatus"),
      appVersion: str(item, "applicationDefinitionVersion"),
      createdAt: str(item, "createdTimestamp")
    };
  } catch {
    return null;
  }
}
export {
  ccv2GetBuild,
  ccv2GetDeployments,
  ccv2GetEnvironments,
  checkEnvironmentsNow,
  getAllHealth,
  startHealthService,
  stopHealthService
};
