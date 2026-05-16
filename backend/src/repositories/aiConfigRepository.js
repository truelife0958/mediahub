import { getDatabase } from '../db/database.js';

function mapRow(row) {
  if (!row) return null;
  return {
    enabled: row.enabled === null ? undefined : Boolean(row.enabled),
    model: row.model || undefined,
    baseUrl: row.base_url || undefined,
    apiKey: row.api_key || undefined,
    updatedAt: row.updated_at,
  };
}

function getRuntimeAiConfig() {
  const row = getDatabase()
    .prepare('SELECT enabled, model, base_url, api_key, updated_at FROM ai_runtime_config WHERE id = 1')
    .get();
  return mapRow(row);
}

function upsertRuntimeAiConfig({ enabled, model, baseUrl, apiKey }) {
  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO ai_runtime_config (id, enabled, model, base_url, api_key, updated_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      model = excluded.model,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      updated_at = excluded.updated_at
  `).run(
    enabled === undefined ? null : Number(Boolean(enabled)),
    model || null,
    baseUrl || null,
    apiKey || null,
    now,
  );
}

export { getRuntimeAiConfig, upsertRuntimeAiConfig };
