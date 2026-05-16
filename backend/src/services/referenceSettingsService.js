import { getAdminReferenceSettings, upsertAdminReferenceSettings } from '../repositories/referenceSettingsRepository.js';
import { createApiError } from '../utils/apiErrors.js';

const DEFAULT_REFERENCE_SETTINGS = {
  promptTemplates: [
    { version: 'v3.2', name: '热门发现', status: '线上', prompt: '请输出真实世界热门内容清单，严格 JSON，字段含 title/summary/tags/hotScore/sourceUrl。' },
    { version: 'v2.8', name: '质量补全', status: '备用', prompt: '根据标题补齐简介、标签、IP 名和热度解释，避免虚构不存在来源。' },
    { version: 'v2.1', name: '去重说明', status: '归档', prompt: '解释重复候选之间的标题、IP、来源相似点，并给出主记录建议。' },
  ],
  keywordPresets: ['短剧爽文', '国漫热播', '赛博朋克', '悬疑反转', '女性成长', '校园恋爱', '修仙升级', '治愈日常'],
  recommendationRules: ['候选池先按 hotScore 初排', '同 IP 与同标签提高相似度', 'AI 可用时补充推荐理由', '失败时保留本地排序，不影响用户浏览'],
};

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizePromptTemplates(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createApiError('invalid_request', 'promptTemplates must be a non-empty array');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw createApiError('invalid_request', `promptTemplates[${index}] must be object`);
    }
    const template = {
      version: String(item.version || '').trim(),
      name: String(item.name || '').trim(),
      status: String(item.status || '').trim(),
      prompt: String(item.prompt || '').trim(),
    };
    if (!template.version || !template.name || !template.status || !template.prompt) {
      throw createApiError('invalid_request', `promptTemplates[${index}] fields are required`);
    }
    return template;
  });
}

function normalizeTextList(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createApiError('invalid_request', `${field} must be a non-empty array`);
  }
  const unique = [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw createApiError('invalid_request', `${field} must contain non-empty items`);
  }
  return unique;
}

function isValidStoredSettings(settings) {
  return settings
    && Array.isArray(settings.promptTemplates)
    && settings.promptTemplates.length > 0
    && Array.isArray(settings.keywordPresets)
    && settings.keywordPresets.length > 0
    && Array.isArray(settings.recommendationRules)
    && settings.recommendationRules.length > 0;
}

function getReferenceSettings() {
  const stored = getAdminReferenceSettings();
  if (!isValidStoredSettings(stored)) {
    return {
      promptTemplates: [...DEFAULT_REFERENCE_SETTINGS.promptTemplates],
      keywordPresets: [...DEFAULT_REFERENCE_SETTINGS.keywordPresets],
      recommendationRules: [...DEFAULT_REFERENCE_SETTINGS.recommendationRules],
    };
  }
  return {
    promptTemplates: normalizePromptTemplates(stored.promptTemplates),
    keywordPresets: normalizeTextList(stored.keywordPresets, 'keywordPresets'),
    recommendationRules: normalizeTextList(stored.recommendationRules, 'recommendationRules'),
  };
}

function updateReferenceSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createApiError('invalid_request', 'Invalid reference settings payload');
  }

  const current = getReferenceSettings();
  const next = {
    promptTemplates: hasOwn(input, 'promptTemplates') ? normalizePromptTemplates(input.promptTemplates) : current.promptTemplates,
    keywordPresets: hasOwn(input, 'keywordPresets') ? normalizeTextList(input.keywordPresets, 'keywordPresets') : current.keywordPresets,
    recommendationRules: hasOwn(input, 'recommendationRules') ? normalizeTextList(input.recommendationRules, 'recommendationRules') : current.recommendationRules,
  };

  upsertAdminReferenceSettings(next);
  return getReferenceSettings();
}

export { DEFAULT_REFERENCE_SETTINGS, getReferenceSettings, updateReferenceSettings };
