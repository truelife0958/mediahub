import { createHmac } from 'node:crypto';
import { buildExponentialBackoffDelayMs, sleep } from '../utils/retryTools.js';

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getNotificationSettings() {
  return {
    webhookEnabled: parseBoolean(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_ENABLED, false),
    timeoutMs: Math.max(1000, Number(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_TIMEOUT_MS || 5000)),
    secret: String(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_SECRET || '').trim(),
    retryMaxAttempts: Math.max(1, Number(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_MAX_ATTEMPTS || 3)),
    retryBaseDelayMs: Math.max(0, Number(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_RETRY_BASE_DELAY_MS || 500)),
  };
}

function signPayload(payload, secret) {
  if (!secret) return '';
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

async function postJson(url, body, {
  timeoutMs = 5000,
  retryMaxAttempts = 3,
  retryBaseDelayMs = 500,
} = {}) {
  for (let attempt = 1; attempt <= retryMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const signature = signPayload(body, String(process.env.MEDIAHUB_WEBHOOK_NOTIFICATIONS_SECRET || '').trim());
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': process.env.UPSTREAM_USER_AGENT || 'MediaHub/1.0 (+https://example.local)',
          ...(signature ? { 'X-MediaHub-Signature': signature } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`webhook notify failed: ${response.status}`);
      }

      return await response.json().catch(() => ({ ok: true }));
    } catch (error) {
      if (attempt >= retryMaxAttempts) throw error;
      const delayMs = buildExponentialBackoffDelayMs({
        attempt,
        baseDelayMs: retryBaseDelayMs,
        maxDelayMs: 10_000,
      });
      await sleep(delayMs);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function dispatchSubscriptionNotifications({ subscription, hits = [], captureId = '', layer = 'overall' } = {}) {
  const settings = getNotificationSettings();
  if (!subscription || !subscription.enabled || hits.length === 0) return { delivered: 0, skipped: true };

  if (subscription.channel !== 'webhook') {
    return { delivered: 0, skipped: true };
  }

  const target = String(subscription.target || '').trim();
  if (!target || !settings.webhookEnabled) {
    return { delivered: 0, skipped: true };
  }

  const payload = {
    type: 'leaderboard_subscription_hit',
    subscription: {
      id: subscription.id,
      keyword: subscription.keyword,
      type: subscription.type || '',
      channel: subscription.channel,
    },
    captureId,
    layer,
    count: hits.length,
    hits: hits.map(item => ({
      contentId: item.contentId,
      title: item.title,
      matchedField: item.matchedField,
      hotScore: item.details?.hotScore ?? 0,
      heatMetric: item.details?.heatMetric || '',
      capturedAt: item.capturedAt,
    })),
  };

  await postJson(target, payload, {
    timeoutMs: settings.timeoutMs,
    retryMaxAttempts: settings.retryMaxAttempts,
    retryBaseDelayMs: settings.retryBaseDelayMs,
  });
  return { delivered: hits.length, skipped: false };
}

export { dispatchSubscriptionNotifications, getNotificationSettings };
