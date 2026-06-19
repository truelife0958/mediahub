import { createApiError } from '../utils/apiErrors.js';
import { getRuntimeAiConfig, upsertRuntimeAiConfig } from '../repositories/aiConfigRepository.js';
import { parseEnvFile, writeEnvValues, envFilePath } from '../utils/envFile.js';
import { extractAiOutputText, postAiChatCompletion } from './aiChatClient.js';

const DEFAULT_CONFIG = {
  enabled: true,
  model: 'gpt-5-mini',
  baseUrl: 'https://api.openai.com/v1',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeBaseUrl(value) {
  const text = normalizeText(value);
  if (!text) return '';
  return text
    .replace(/\/+$/, '')
    .replace(/\/(?:v\d+\/)?chat\/completions$/i, match => (match.startsWith('/v') ? match.match(/^\/v\d+/i)?.[0] || '' : ''))
    .replace(/\/responses$/i, '');
}

function readEnvConfig() {
  const fileEnv = parseEnvFile();
  const readValue = (key) => process.env[key] ?? fileEnv[key];
  const envEnabledRaw = normalizeText(readValue('MEDIAHUB_AI_ENABLED'));
  const envEnabled = envEnabledRaw
    ? !['0', 'false', 'off', 'no'].includes(envEnabledRaw.toLowerCase())
    : undefined;
  const envModel = normalizeText(readValue('MEDIAHUB_AI_MODEL'));
  const envBaseUrl = normalizeBaseUrl(readValue('MEDIAHUB_AI_BASE_URL'));
  const envApiKey = normalizeText(readValue('MEDIAHUB_AI_API_KEY'));

  return {
    enabled: envEnabled,
    model: envModel || undefined,
    baseUrl: envBaseUrl || undefined,
    apiKey: envApiKey || undefined,
  };
}

function mergeConfig() {
  const runtime = getRuntimeAiConfig() || {};
  const envConfig = readEnvConfig();

  const enabled = envConfig.enabled ?? runtime.enabled ?? DEFAULT_CONFIG.enabled;
  const model = envConfig.model || runtime.model || DEFAULT_CONFIG.model;
  const baseUrl = normalizeBaseUrl(envConfig.baseUrl || runtime.baseUrl || DEFAULT_CONFIG.baseUrl);
  const apiKey = normalizeText(envConfig.apiKey || runtime.apiKey) || undefined;

  return {
    enabled,
    model,
    baseUrl,
    apiKey,
    source: {
      enabled: envConfig.enabled !== undefined ? 'env' : (runtime.enabled !== undefined ? 'runtime' : 'default'),
      model: envConfig.model ? 'env' : (runtime.model ? 'runtime' : 'default'),
      baseUrl: envConfig.baseUrl ? 'env' : (runtime.baseUrl ? 'runtime' : 'default'),
      apiKey: envConfig.apiKey ? 'env' : (runtime.apiKey ? 'runtime' : 'unset'),
    },
  };
}

function sanitizeConfig(config) {
  return {
    enabled: config.enabled,
    model: config.model,
    baseUrl: config.baseUrl,
    hasApiKey: Boolean(config.apiKey),
    source: config.source,
  };
}

function buildTransientConfig(input = {}) {
  const current = getAiConfigPrivate();
  return {
    ...current,
    enabled: Object.prototype.hasOwnProperty.call(input, 'enabled')
      ? input.enabled
      : current.enabled,
    model: Object.prototype.hasOwnProperty.call(input, 'model')
      ? normalizeText(input.model) || current.model
      : current.model,
    baseUrl: Object.prototype.hasOwnProperty.call(input, 'baseUrl')
      ? normalizeBaseUrl(input.baseUrl) || current.baseUrl
      : current.baseUrl,
    apiKey: Object.prototype.hasOwnProperty.call(input, 'apiKey') && normalizeText(input.apiKey)
      ? normalizeText(input.apiKey)
      : current.apiKey,
  };
}

function validateInput(input) {
  if (!input || typeof input !== 'object') {
    throw createApiError('invalid_request', 'Invalid ai config payload');
  }

  if ('enabled' in input && typeof input.enabled !== 'boolean') {
    throw createApiError('invalid_request', 'enabled must be boolean');
  }
  if ('model' in input && typeof input.model !== 'string') {
    throw createApiError('invalid_request', 'model must be string');
  }
  if ('baseUrl' in input && typeof input.baseUrl !== 'string') {
    throw createApiError('invalid_request', 'baseUrl must be string');
  }
  if ('apiKey' in input && typeof input.apiKey !== 'string') {
    throw createApiError('invalid_request', 'apiKey must be string');
  }
  if ('persistTarget' in input && !['runtime', 'env'].includes(input.persistTarget)) {
    throw createApiError('invalid_request', 'persistTarget must be runtime or env');
  }
}

function getAiConfigPublic() {
  return sanitizeConfig(mergeConfig());
}

function getAiConfigPrivate() {
  return mergeConfig();
}

function updateAiConfig(input) {
  validateInput(input);
  const currentRuntime = getRuntimeAiConfig() || {};

  const nextEnabled = Object.prototype.hasOwnProperty.call(input, 'enabled')
    ? input.enabled
    : currentRuntime.enabled;
  const nextModel = Object.prototype.hasOwnProperty.call(input, 'model')
    ? normalizeText(input.model) || undefined
    : currentRuntime.model;
  const nextBaseUrl = Object.prototype.hasOwnProperty.call(input, 'baseUrl')
    ? normalizeBaseUrl(input.baseUrl) || undefined
    : currentRuntime.baseUrl;
  const nextApiKey = Object.prototype.hasOwnProperty.call(input, 'apiKey')
    ? normalizeText(input.apiKey) || undefined
    : currentRuntime.apiKey;

  const persistTarget = input.persistTarget === 'env' ? 'env' : 'runtime';
  if (persistTarget === 'env') {
    writeEnvValues({
      MEDIAHUB_AI_ENABLED: nextEnabled === undefined ? true : Boolean(nextEnabled),
      MEDIAHUB_AI_MODEL: nextModel || DEFAULT_CONFIG.model,
      MEDIAHUB_AI_BASE_URL: nextBaseUrl || DEFAULT_CONFIG.baseUrl,
      ...(nextApiKey ? { MEDIAHUB_AI_API_KEY: nextApiKey } : {}),
    });
  }

  upsertRuntimeAiConfig({
    enabled: nextEnabled,
    model: nextModel,
    baseUrl: nextBaseUrl,
    apiKey: nextApiKey,
  });

  return { ...getAiConfigPublic(), persistedTo: persistTarget, envFilePath: persistTarget === 'env' ? envFilePath() : undefined };
}

async function testAiConnection(input = {}) {
  validateInput(input || {});
  const config = buildTransientConfig(input || {});
  const publicConfig = sanitizeConfig(config);
  const startedAt = Date.now();
  const finish = (payload) => ({
    ...payload,
    config: publicConfig,
    model: publicConfig.model,
    baseUrl: publicConfig.baseUrl,
    latencyMs: Date.now() - startedAt,
  });

  if (!config.enabled) {
    return finish({
      ok: false,
      status: 'disabled',
      message: 'AI 未启用，请先勾选“启用 AI 数据获取与排序”。',
    });
  }

  if (!config.apiKey) {
    return finish({
      ok: false,
      status: 'missing_api_key',
      message: '缺少 API Key，请填写后保存或在本次测试中临时输入。',
    });
  }

  if (!config.model || !config.baseUrl) {
    return finish({
      ok: false,
      status: 'invalid_config',
      message: '模型名或 Base URL 为空，请补齐后再测试。',
    });
  }

  try {
    const { response, payload } = await postAiChatCompletion({
      config,
      prompt: '请只返回 JSON: {"ok":true,"service":"mediahub"}',
      systemPrompt: '你是 MediaHub 的 AI 连接测试助手。只返回 JSON，不要解释。',
      temperature: 0,
      timeoutMs: input?.timeoutMs || 10_000,
    });
    const outputText = extractAiOutputText(payload);

    if (!response.ok) {
      const gatewayMessage = normalizeText(payload?.error?.message || response.statusText || 'AI 网关请求失败');
      return finish({
        ok: false,
        status: 'failed',
        httpStatus: response.status,
        message: `AI 网关返回 ${response.status}: ${gatewayMessage}`,
      });
    }

    return finish({
      ok: true,
      status: 'success',
      httpStatus: response.status,
      message: `AI 连接正常，模型 ${config.model} 已响应。`,
      sample: outputText.slice(0, 160),
    });
  } catch (error) {
    return finish({
      ok: false,
      status: 'failed',
      message: error?.message || 'AI 连接测试失败',
    });
  }
}

export { getAiConfigPublic, getAiConfigPrivate, testAiConnection, updateAiConfig };
