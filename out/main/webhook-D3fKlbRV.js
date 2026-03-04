function buildSlackPayload(title, message, color) {
  return JSON.stringify({
    attachments: [{
      color,
      title,
      text: message,
      footer: "QAssistant",
      ts: Math.floor(Date.now() / 1e3)
    }]
  });
}
function buildTeamsPayload(title, message, _color) {
  return JSON.stringify({
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", size: "Medium", weight: "Bolder", text: title },
          { type: "TextBlock", text: message, wrap: true }
        ]
      }
    }]
  });
}
function buildGenericPayload(title, message) {
  return JSON.stringify({ title, message, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
}
async function sendWebhook(webhook, title, message, color = "#A78BFA") {
  if (!webhook.isEnabled || !webhook.url) return;
  try {
    const parsed = new URL(webhook.url);
    if (!["http:", "https:"].includes(parsed.protocol)) return;
  } catch {
    return;
  }
  let payload;
  switch (webhook.type) {
    case "Slack":
      payload = buildSlackPayload(title, message, color);
      break;
    case "Teams":
      payload = buildTeamsPayload(title, message);
      break;
    default:
      payload = buildGenericPayload(title, message);
  }
  try {
    await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(15e3)
    });
  } catch (err) {
    console.error("[WebhookService] error:", err);
  }
}
async function notifyTestPlanResult(webhooks, projectName, planName, passed, failed, total) {
  if (total === 0) return;
  const rate = passed / total * 100;
  const emoji = rate >= 80 ? "✅" : rate >= 50 ? "⚠️" : "❌";
  const color = rate >= 80 ? "#10B981" : rate >= 50 ? "#F59E0B" : "#EF4444";
  const title = `${emoji} Test Plan Complete – ${planName}`;
  const message = `*Project:* ${projectName}
*Plan:* ${planName}
*Result:* ${passed}/${total} passed (${rate.toFixed(0)}%)`;
  await Promise.all(webhooks.map((wh) => sendWebhook(wh, title, message, color)));
}
export {
  notifyTestPlanResult,
  sendWebhook
};
