import { createApiError } from '../utils/apiErrors.js';

const DEFAULT_SOURCE_CHAIN_BY_TYPE = {
  drama: ['platform_hot'],
  novel: ['platform_hot'],
  anime: ['platform_hot'],
  comic: ['platform_hot'],
};

const SOURCE_CHAIN_ENV_BY_TYPE = {
  drama: 'MEDIAHUB_SOURCE_CHAIN_DRAMA',
  novel: 'MEDIAHUB_SOURCE_CHAIN_NOVEL',
  anime: 'MEDIAHUB_SOURCE_CHAIN_ANIME',
  comic: 'MEDIAHUB_SOURCE_CHAIN_COMIC',
};

const SOURCE_HEALTH = new Map();
const SOURCE_CHAIN_OVERRIDES = new Map();

function normalizeType(type) {
  return String(type || '').trim().toLowerCase();
}

function normalizeSourceToken(token, type) {
  const value = String(token || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'builtin') {
    return 'platform_hot';
  }
  if (value === 'crawler' || value === 'platform' || value === 'platform_hot') return 'platform_hot';
  return value;
}

function supportsSource(type, source) {
  const list = DEFAULT_SOURCE_CHAIN_BY_TYPE[type] || [];
  return list.includes(source);
}

function parseSourceChain(input, type, fallback = []) {
  const values = (Array.isArray(input) ? input : String(input || '').split(','))
    .map(item => normalizeSourceToken(item, type))
    .filter(Boolean)
    .filter(item => supportsSource(type, item));

  const unique = [...new Set(values)];
  return unique.length > 0 ? unique : fallback;
}

function ensureValidType(type) {
  const normalizedType = normalizeType(type);
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SOURCE_CHAIN_BY_TYPE, normalizedType)) {
    throw createApiError('invalid_request', 'type must be one of drama/novel/anime/comic');
  }
  return normalizedType;
}

function listSupportedSources(type) {
  const normalizedType = ensureValidType(type);
  return [...(DEFAULT_SOURCE_CHAIN_BY_TYPE[normalizedType] || [])];
}

function resolveSourceChainByType(type) {
  const normalizedType = ensureValidType(type);
  const override = SOURCE_CHAIN_OVERRIDES.get(normalizedType);
  if (Array.isArray(override) && override.length > 0) {
    return [...override];
  }

  const fallback = DEFAULT_SOURCE_CHAIN_BY_TYPE[normalizedType] || [];
  const envKey = SOURCE_CHAIN_ENV_BY_TYPE[normalizedType];
  if (!envKey) return fallback;
  return parseSourceChain(process.env[envKey], normalizedType, fallback);
}

function upsertSourceChainOverride({ type, chain }) {
  const normalizedType = ensureValidType(type);
  const normalizedChain = parseSourceChain(chain, normalizedType, []);

  if (normalizedChain.length === 0) {
    throw createApiError(
      'invalid_request',
      `chain must contain at least one supported source: ${listSupportedSources(normalizedType).join(', ')}`
    );
  }

  SOURCE_CHAIN_OVERRIDES.set(normalizedType, normalizedChain);
  return {
    type: normalizedType,
    chain: [...normalizedChain],
  };
}

function clearSourceChainOverride(type) {
  const normalizedType = ensureValidType(type);
  SOURCE_CHAIN_OVERRIDES.delete(normalizedType);
  return {
    type: normalizedType,
    chain: resolveSourceChainByType(normalizedType),
  };
}

function healthKey(type, source) {
  return `${normalizeType(type)}:${String(source || '').trim().toLowerCase()}`;
}

function readOrCreateHealth(type, source) {
  const key = healthKey(type, source);
  const current = SOURCE_HEALTH.get(key) || {
    type: normalizeType(type),
    source: String(source || '').trim().toLowerCase(),
    attempts: 0,
    successes: 0,
    emptyHits: 0,
    failures: 0,
    rateLimited: 0,
    consecutiveFailures: 0,
    ewmaLatencyMs: 0,
    lastStatus: 'unknown',
    lastError: null,
    updatedAt: '',
  };
  SOURCE_HEALTH.set(key, current);
  return current;
}

function updateEwma(previous, sample, alpha = 0.3) {
  if (!Number.isFinite(sample) || sample <= 0) return previous;
  if (!Number.isFinite(previous) || previous <= 0) return sample;
  return Math.round(previous * (1 - alpha) + sample * alpha);
}

function recordSourceOutcome({ type, source, status, latencyMs = 0, error = null }) {
  const entry = readOrCreateHealth(type, source);
  entry.attempts += 1;
  entry.updatedAt = new Date().toISOString();
  entry.ewmaLatencyMs = updateEwma(entry.ewmaLatencyMs, Number(latencyMs) || 0);

  if (status === 'success') {
    entry.successes += 1;
    entry.consecutiveFailures = 0;
    entry.lastStatus = 'success';
    entry.lastError = null;
    return;
  }

  if (status === 'empty') {
    entry.emptyHits += 1;
    entry.consecutiveFailures = 0;
    entry.lastStatus = 'empty';
    entry.lastError = null;
    return;
  }

  if (status === 'rate_limited') {
    entry.failures += 1;
    entry.rateLimited += 1;
    entry.consecutiveFailures += 1;
    entry.lastStatus = 'rate_limited';
    entry.lastError = error?.message || 'upstream_rate_limited';
    return;
  }

  entry.failures += 1;
  entry.consecutiveFailures += 1;
  entry.lastStatus = 'failed';
  entry.lastError = error?.message || 'upstream_unavailable';
}

function computeHealthScore(entry) {
  if (!entry) return 0;
  if (!entry.attempts) return 100;

  const successRatio = entry.successes / entry.attempts;
  const rateLimitedRatio = entry.rateLimited / entry.attempts;
  const failureRatio = entry.failures / entry.attempts;
  const latencyPenalty = Math.min(30, Math.round((Number(entry.ewmaLatencyMs) || 0) / 200));
  const consecutivePenalty = Math.min(35, entry.consecutiveFailures * 10);

  const score = Math.round(
    100
    - (1 - successRatio) * 35
    - failureRatio * 25
    - rateLimitedRatio * 30
    - latencyPenalty
    - consecutivePenalty
  );

  return Math.max(0, Math.min(100, score));
}

function rankSourceChainByHealth(type, sourceChain = []) {
  const indexed = sourceChain.map((source, index) => {
    const health = readOrCreateHealth(type, source);
    return {
      source,
      index,
      score: computeHealthScore(health),
    };
  });

  indexed.sort((a, b) => {
    if (a.score === b.score) return a.index - b.index;
    if (Math.abs(a.score - b.score) < 8) return a.index - b.index;
    return b.score - a.score;
  });

  return indexed.map(item => item.source);
}

function getSourceHealthSnapshot({ type } = {}) {
  const normalizedType = type ? normalizeType(type) : '';
  return [...SOURCE_HEALTH.values()]
    .filter(item => (normalizedType ? item.type === normalizedType : true))
    .map(item => ({
      ...item,
      score: computeHealthScore(item),
    }))
    .sort((a, b) => {
      if (a.type === b.type) {
        if (b.score === a.score) return a.source.localeCompare(b.source);
        return b.score - a.score;
      }
      return a.type.localeCompare(b.type);
    });
}

function getSourceRoutingSettingsSnapshot() {
  const types = Object.keys(DEFAULT_SOURCE_CHAIN_BY_TYPE);
  const supported = Object.fromEntries(types.map(type => [type, listSupportedSources(type)]));
  const overrides = Object.fromEntries(types.map(type => [type, SOURCE_CHAIN_OVERRIDES.get(type) || []]));
  return {
    defaults: DEFAULT_SOURCE_CHAIN_BY_TYPE,
    supported,
    effective: Object.fromEntries(types.map(type => [type, resolveSourceChainByType(type)])),
    overrides,
  };
}

function resetSourceHealthRuntimeState() {
  SOURCE_HEALTH.clear();
}

function resetSourceRoutingRuntimeState() {
  SOURCE_CHAIN_OVERRIDES.clear();
}

export {
  resolveSourceChainByType,
  rankSourceChainByHealth,
  recordSourceOutcome,
  getSourceHealthSnapshot,
  getSourceRoutingSettingsSnapshot,
  upsertSourceChainOverride,
  clearSourceChainOverride,
  resetSourceHealthRuntimeState,
  resetSourceRoutingRuntimeState,
};
