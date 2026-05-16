import { getDatabase } from '../db/database.js';

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getAdminReferenceSettings() {
  const row = getDatabase()
    .prepare(`
      SELECT prompt_templates_json, keyword_presets_json, recommendation_rules_json, updated_at
      FROM admin_reference_settings
      WHERE id = 1
    `)
    .get();

  if (!row) return null;

  return {
    promptTemplates: parseJson(row.prompt_templates_json, []),
    keywordPresets: parseJson(row.keyword_presets_json, []),
    recommendationRules: parseJson(row.recommendation_rules_json, []),
    updatedAt: row.updated_at,
  };
}

function upsertAdminReferenceSettings({ promptTemplates, keywordPresets, recommendationRules }) {
  const now = new Date().toISOString();
  getDatabase().prepare(`
    INSERT INTO admin_reference_settings (
      id,
      prompt_templates_json,
      keyword_presets_json,
      recommendation_rules_json,
      updated_at
    )
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      prompt_templates_json = excluded.prompt_templates_json,
      keyword_presets_json = excluded.keyword_presets_json,
      recommendation_rules_json = excluded.recommendation_rules_json,
      updated_at = excluded.updated_at
  `).run(
    JSON.stringify(promptTemplates),
    JSON.stringify(keywordPresets),
    JSON.stringify(recommendationRules),
    now,
  );

  return getAdminReferenceSettings();
}

export { getAdminReferenceSettings, upsertAdminReferenceSettings };
