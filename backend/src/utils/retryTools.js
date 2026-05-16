function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function buildExponentialBackoffDelayMs({ attempt, baseDelayMs, maxDelayMs }) {
  const factor = Math.max(0, attempt - 1);
  const next = Math.round(baseDelayMs * (2 ** factor));
  return Math.min(maxDelayMs, Math.max(0, next));
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { parsePositiveInt, buildExponentialBackoffDelayMs, sleep };
