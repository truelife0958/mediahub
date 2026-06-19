import https from 'node:https';
import http from 'node:http';

function extractContentPart(part) {
  if (typeof part === 'string') return part;
  if (!part || typeof part !== 'object') return '';
  return part.text || part.output_text || part.content || '';
}

function extractMessageContent(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map(extractContentPart).filter(Boolean).join('\n');
  }
  return '';
}

function extractAiOutputText(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const chatText = Array.isArray(payload.choices)
    ? payload.choices
      .map(choice => extractMessageContent(choice?.message) || String(choice?.text || choice?.delta?.content || ''))
      .filter(Boolean)
      .join('\n')
    : '';
  if (chatText.trim()) return chatText.trim();

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const responseChunks = Array.isArray(payload.output)
    ? payload.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
    : [];

  return responseChunks
    .map(extractContentPart)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildChatCompletionBody({ model, prompt, systemPrompt, temperature = 0.2 }) {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt || '你是 MediaHub 的内容数据助手。请严格按用户要求输出，不要添加无关说明。',
      },
      { role: 'user', content: prompt },
    ],
    temperature,
  };
}

function readAiRequestTimeoutMs(value = process.env.MEDIAHUB_AI_REQUEST_TIMEOUT_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 90_000;
  return Math.min(180_000, Math.max(1_000, parsed));
}

// Some AI gateways (e.g. Cloudflare-fronted proxies) challenge or block
// requests carrying the default Node fetch User-Agent. Send a conventional
// browser-style UA so the request is treated like a normal API client.
const AI_FETCH_USER_AGENT = String(
  process.env.UPSTREAM_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 MediaHub/1.0'
);

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

/**
 * Common HTTP status codes from AI providers that indicate transient or
 * configuration errors rather than a simple "timeout".
 */
const AI_RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Perform a POST request to the AI chat completions endpoint using node:https.
 *
 * Node's native `fetch` (undici) can be blocked by Cloudflare-fronted
 * gateways (TLS ECONNRESET).  Using the `https` module directly avoids
 * this — it works reliably with the same TLS configuration as curl.
 */
function httpsRequest({ url, method, headers, body, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const bodyBuffer = Buffer.from(body, 'utf8');

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        ...headers,
        'Content-Length': String(bodyBuffer.length),
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let payload = null;
        try { payload = JSON.parse(body); } catch { /* non-JSON body */ }
        resolve({ status: res.statusCode, statusText: res.statusMessage, payload, rawBody: body });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const err = new Error('请求超时');
      err.name = 'AbortError';
      reject(err);
    });

    req.on('error', (err) => {
      // Map common TLS/reset errors to a clearer message
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        const wrapped = new Error(`AI 网关连接失败（${err.code}），请检查网络或 API 地址。`);
        wrapped.publicCode = 'upstream_unavailable';
        wrapped.cause = err;
        reject(wrapped);
        return;
      }
      reject(err);
    });

    // Support abort via AbortSignal (both internal timeout and external backfill)
    const onAbort = () => {
      req.destroy();
      const err = new Error('请求已取消');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * Injectable HTTP request function for testing.
 * When set, all AI calls go through this instead of the real httpsRequest.
 * Usage in tests: import { _setMockRequest, _clearMockRequest } from './aiChatClient.js'
 */
let _mockRequestFn = null;

function _setMockRequestFn(fn) {
  _mockRequestFn = fn;
}

function _clearMockRequestFn() {
  _mockRequestFn = null;
}

async function postAiChatCompletion({ config, prompt, systemPrompt, temperature, timeoutMs, abortSignal } = {}) {
  const effectiveTimeoutMs = readAiRequestTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  // Propagate external abort (e.g. overall backfill timeout) to the in-flight
  // request so it is cancelled immediately rather than waiting for the per-call
  // timeout to elapse.
  let externalAborted = false;
  const onExternalAbort = () => {
    externalAborted = true;
    controller.abort();
  };
  if (abortSignal) {
    if (abortSignal.aborted) {
      externalAborted = true;
      controller.abort();
    } else {
      abortSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const requestFn = _mockRequestFn || httpsRequest;
    const { status, statusText, payload } = await requestFn({
      url: `${config.baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'User-Agent': AI_FETCH_USER_AGENT,
      },
      body: JSON.stringify(buildChatCompletionBody({
        model: config.model,
        prompt,
        systemPrompt,
        temperature,
      })),
      signal: controller.signal,
      timeoutMs: effectiveTimeoutMs,
    });

    // Check for non-OK responses from the AI API (rate-limit, server error, etc.)
    if (status < 200 || status >= 300) {
      const aiError = payload?.error?.message || payload?.message || '';
      const isRetryable = AI_RETRYABLE_STATUS_CODES.has(status);

      if (status === 403) {
        const error = new Error(`AI 服务拒绝访问（403），请检查 API Key 权限或内容合规策略。${aiError ? '详情：' + aiError : ''}`);
        error.publicCode = 'upstream_forbidden';
        error.status = 403;
        throw error;
      }

      if (status === 429) {
        const error = new Error(`AI 服务限流，请稍后重试。${aiError ? '详情：' + aiError : ''}`);
        error.publicCode = 'upstream_rate_limited';
        error.status = 429;
        throw error;
      }

      if (isRetryable) {
        const error = new Error(`AI 服务暂时不可用（${status} ${statusText || ''}），请稍后重试。`);
        error.publicCode = 'upstream_unavailable';
        error.status = status;
        throw error;
      }

      // Non-retryable API errors (401, 404, etc.)
      const error = new Error(`AI 请求失败（${status}）${aiError ? '：' + aiError : ''}`);
      error.publicCode = 'upstream_unavailable';
      error.status = status;
      throw error;
    }

    return { response: { ok: true, status }, payload };
  } catch (error) {
    if (isAbortError(error)) {
      // Distinguish external abort (overall backfill timeout) from per-call timeout
      if (externalAborted) {
        const abortError = new Error('请求已取消');
        abortError.publicCode = 'upstream_timeout';
        abortError.cause = error;
        throw abortError;
      }
      const timeoutSec = Math.round(effectiveTimeoutMs / 1000);
      const timeoutError = new Error(`AI 模型响应超时（${timeoutSec}s），可尝试减少请求内容或在后台管理刷新。`);
      timeoutError.publicCode = 'upstream_timeout';
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (abortSignal) abortSignal.removeEventListener('abort', onExternalAbort);
  }
}

export { buildChatCompletionBody, extractAiOutputText, postAiChatCompletion, readAiRequestTimeoutMs, _setMockRequestFn, _clearMockRequestFn };
