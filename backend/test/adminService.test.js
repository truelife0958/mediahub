import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { recordSourceRun } from '../src/repositories/sourceRepository.js';
import {
  buildAdminSummary,
  getAdminLogs,
  getAdminQuality,
  listAdminContents,
  updateAdminContent,
} from '../src/services/adminService.js';

const sample = {
  id: 'anime:ai-search:admin-1',
  title: 'Admin Anime',
  cover: 'https://example.com/c.jpg',
  summary: 'Admin quality summary.',
  type: 'anime',
  tags: ['Action'],
  actors: ['Studio'],
  author: 'AI Discovery',
  ipName: 'Admin IP',
  status: 'completed',
  hotScore: 500,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/admin-1' },
};

test('admin service summarizes AI-only cached content and runs', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);
  recordSourceRun({ type: 'anime', source: 'ai_search', status: 'success', count: 1, error: null });

  const summary = buildAdminSummary();
  assert.equal(summary.totalContents, 1);
  assert.equal(summary.countsByType.anime, 1);
  assert.equal(summary.routing.effective.anime[0], 'ai_search');
  assert.equal(summary.runStats.totalRuns, 1);
  assert.equal(summary.runStats.successRate, 100);
  assert.equal(summary.quality.qualityScore, 100);
});

test('admin service lists and updates cached content safely', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);

  const before = listAdminContents({ type: 'anime', limit: 10 });
  assert.equal(before.list.length, 1);

  const updated = updateAdminContent(sample.id, {
    title: 'Updated Admin Anime',
    tags: '热血, 冒险',
    hotScore: 777,
    status: 'ongoing',
  });

  assert.equal(updated.title, 'Updated Admin Anime');
  assert.deepEqual(updated.tags, ['热血', '冒险']);
  assert.equal(updated.hotScore, 777);
  assert.equal(updated.status, 'ongoing');
});

test('admin service stores all-network volume metrics above legacy heat caps', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([sample]);

  const updated = updateAdminContent(sample.id, {
    hotScore: 5_380_000,
  });

  assert.equal(updated.hotScore, 5_380_000);
});

test('admin service creates manual content with all-network volume metrics intact', async () => {
  resetDatabaseForTest(':memory:');
  const { createAdminContent } = await import('../src/services/adminService.js');

  const created = createAdminContent({
    type: 'anime',
    title: '大体量动漫样本',
    hotScore: 17_000_000,
  });

  assert.equal(created.hotScore, 17_000_000);
});

test('admin quality and logs expose duplicate candidates and error categories', () => {
  resetDatabaseForTest(':memory:');
  upsertContents([
    sample,
    { ...sample, id: 'anime:ai-search:admin-2', title: ' Admin-Anime ', source: { provider: 'manual', label: 'Manual' } },
  ]);
  recordSourceRun({ type: 'anime', source: 'ai_search', status: 'failed', count: 0, error: 'upstream timeout' });

  const quality = getAdminQuality();
  const logs = getAdminLogs({ limit: 10 });

  assert.equal(quality.duplicateCandidates.length, 1);
  assert.equal(logs.runs[0].category, '超时');
  assert.equal(logs.errorSummary['超时'], 1);
});

test('admin service creates manual content and fills missing fields with AI without overwriting existing data', async () => {
  resetDatabaseForTest(':memory:');
  const { createAdminContent, fillMissingAdminContentWithAi } = await import('../src/services/adminService.js');

  const created = createAdminContent({
    type: 'comic',
    title: '补录漫画',
    summary: '',
    tags: [],
    actors: '',
    author: '',
    ipName: '',
    hotScore: 0,
  });

  assert.equal(created.type, 'comic');
  assert.equal(created.title, '补录漫画');
  assert.equal(created.source.provider, 'manual');

  const previous = {
    MEDIAHUB_AI_ENABLED: process.env.MEDIAHUB_AI_ENABLED,
    MEDIAHUB_AI_API_KEY: process.env.MEDIAHUB_AI_API_KEY,
    MEDIAHUB_AI_MODEL: process.env.MEDIAHUB_AI_MODEL,
    MEDIAHUB_AI_BASE_URL: process.env.MEDIAHUB_AI_BASE_URL,
  };
  const originalFetch = global.fetch;
  process.env.MEDIAHUB_AI_ENABLED = 'true';
  process.env.MEDIAHUB_AI_API_KEY = 'sk-fill-missing';
  process.env.MEDIAHUB_AI_MODEL = 'gpt-5-mini';
  process.env.MEDIAHUB_AI_BASE_URL = 'https://example.com/v1';
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/chat\/completions$/);
    const body = JSON.parse(String(options.body || '{}'));
    assert.ok(Array.isArray(body.messages));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        summary: 'AI 补全后的简介，长度足够用于质量检测。',
        tags: ['奇幻', '冒险'],
        actors: ['角色A'],
        author: 'AI 作者',
        ipName: 'AI 补全 IP',
        status: 'ongoing',
        hotScore: 6543,
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const filled = await fillMissingAdminContentWithAi(created.id);
    assert.equal(filled.title, '补录漫画');
    assert.equal(filled.summary, 'AI 补全后的简介，长度足够用于质量检测。');
    assert.deepEqual(filled.tags, ['奇幻', '冒险']);
    assert.equal(filled.author, 'AI 作者');
    assert.equal(filled.ipName, 'AI 补全 IP');
    assert.equal(filled.status, 'ongoing');
    assert.equal(filled.hotScore, 6543);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
