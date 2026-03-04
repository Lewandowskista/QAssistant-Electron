/**
 * WebhookService — mirrors C# WebhookService.cs
 * Sends notifications to Slack / Microsoft Teams webhooks.
 */

export interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    type: 'Slack' | 'Teams' | 'Generic';
    isEnabled: boolean;
    notifyOnTestPlanFail: boolean;
    notifyOnHighPriorityDone: boolean;
    notifyOnDueDate: boolean;
    notifyOnAiAnalysis: boolean;
}

function buildSlackPayload(title: string, message: string, color: string): string {
    return JSON.stringify({
        attachments: [{
            color,
            title,
            text: message,
            footer: 'QAssistant',
            ts: Math.floor(Date.now() / 1000),
        }]
    });
}

function buildTeamsPayload(title: string, message: string, _color: string): string {
    return JSON.stringify({
        type: 'message',
        attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
                type: 'AdaptiveCard',
                version: '1.4',
                body: [
                    { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: title },
                    { type: 'TextBlock', text: message, wrap: true },
                ],
            },
        }],
    });
}

function buildGenericPayload(title: string, message: string): string {
    return JSON.stringify({ title, message, timestamp: new Date().toISOString() });
}

export async function sendWebhook(
    webhook: WebhookConfig,
    title: string,
    message: string,
    color = '#A78BFA'
): Promise<void> {
    if (!webhook.isEnabled || !webhook.url) return;

    // Basic URL validation — only allow http/https
    try {
        const parsed = new URL(webhook.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return;
    } catch {
        return;
    }

    let payload: string;
    switch (webhook.type) {
        case 'Slack':
            payload = buildSlackPayload(title, message, color);
            break;
        case 'Teams':
            payload = buildTeamsPayload(title, message, color);
            break;
        default:
            payload = buildGenericPayload(title, message);
    }

    try {
        await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            signal: AbortSignal.timeout(15000),
        });
    } catch (err) {
        console.error('[WebhookService] error:', err);
    }
}

export async function notifyTestPlanResult(
    webhooks: WebhookConfig[],
    projectName: string,
    planName: string,
    passed: number,
    failed: number,
    total: number
): Promise<void> {
    if (total === 0) return;
    const rate = (passed / total) * 100;
    const emoji = rate >= 80 ? '✅' : rate >= 50 ? '⚠️' : '❌';
    const color = rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444';
    const title = `${emoji} Test Plan Complete – ${planName}`;
    const message = `*Project:* ${projectName}\n*Plan:* ${planName}\n*Result:* ${passed}/${total} passed (${rate.toFixed(0)}%)`;
    await Promise.all(webhooks.map(wh => sendWebhook(wh, title, message, color)));
}

export async function notifyHighPriorityDone(
    webhooks: WebhookConfig[],
    projectName: string,
    taskTitle: string
): Promise<void> {
    const title = '🎯 High-Priority Task Done';
    const message = `*Project:* ${projectName}\n*Task:* ${taskTitle}`;
    await Promise.all(
        webhooks
            .filter(wh => wh.notifyOnHighPriorityDone)
            .map(wh => sendWebhook(wh, title, message, '#10B981'))
    );
}

export async function notifyAiAnalysis(
    webhooks: WebhookConfig[],
    projectName: string,
    taskTitle: string,
    summary: string
): Promise<void> {
    const title = '🤖 AI Analysis Complete';
    const message = `*Project:* ${projectName}\n*Task:* ${taskTitle}\n${summary}`;
    await Promise.all(
        webhooks
            .filter(wh => wh.notifyOnAiAnalysis)
            .map(wh => sendWebhook(wh, title, message, '#A78BFA'))
    );
}
