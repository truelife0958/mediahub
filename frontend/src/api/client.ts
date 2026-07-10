interface ApiEnvelope<T> {
  code: number;
  data: T;
  error?: string;
  message?: string;
  requestId?: string;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const LONG_RUNNING_REQUEST_TIMEOUT_MS = 240_000;

const ERROR_MESSAGE_BY_CODE: Record<number, string> = {
  1001: '请求参数无效，请检查输入后重试。',
  1002: '请求资源不存在。',
  1004: '当前会话未登录或已过期。',
  1401: '内容解析失败，请稍后重试。',
  2002: '上游内容服务暂不可用，请稍后重试。',
  2003: '上游限流中，请稍后再试。',
  2004: '上游平台拒绝访问，请稍后重试或检查采集源。',
  2005: '数据采集请求超时，可稍后刷新榜单或在数据页重试。',
};

function normalizeApiErrorMessage(payload: ApiEnvelope<unknown> | null, status: number) {
  const backendMessage = String(payload?.message || '').trim();
  const fallback = ERROR_MESSAGE_BY_CODE[payload?.code || 0] || `请求失败(${status})`;
  const requestId = String(payload?.requestId || '').trim();

  if (!backendMessage) {
    return requestId ? `${fallback} [RID:${requestId}]` : fallback;
  }

  return requestId ? `${backendMessage} [RID:${requestId}]` : backendMessage;
}

export type RequestJsonInit = RequestInit & {
  timeoutMs?: number;
};

export async function requestJson<T>(path: string, init?: RequestJsonInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, Number(init?.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS));
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = init?.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }

  const headers = new Headers(init?.headers || {});
  const method = String(init?.method || 'GET').toUpperCase();
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(method) && !headers.has('X-MediaHub-Admin-Action')) {
    headers.set('X-MediaHub-Admin-Action', 'true');
  }

  try {
    const response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers,
    });

    let payload: ApiEnvelope<T> | null = null;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) {
        throw new Error(`请求失败(${response.status})`);
      }
      throw new Error('响应格式异常，请稍后重试。');
    }

    if (!response.ok) {
      throw new Error(normalizeApiErrorMessage(payload, response.status));
    }
    if (!payload || payload.code !== 0) {
      throw new Error(normalizeApiErrorMessage(payload as ApiEnvelope<unknown> | null, response.status));
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (timedOut) {
        throw new Error(`请求超时(${Math.round(timeoutMs / 1000)}s)，请稍后重试。`, { cause: error });
      }
      throw new DOMException('请求已取消', 'AbortError');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternal);
    }
  }
}
