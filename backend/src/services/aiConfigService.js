import { createApiError } from '../utils/apiErrors.js';
import { getRuntimeAiConfig, upsertRuntimeAiConfig } from '../repositories/aiConfigRepository.js';
import { parseEnvFile, writeEnvValues, envFilePath } from '../utils/envFile.js';

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

export { getAiConfigPublic, getAiConfigPrivate, updateAiConfig };
