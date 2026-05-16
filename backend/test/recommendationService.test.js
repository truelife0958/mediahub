import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { upsertContents } from '../src/repositories/contentRepository.js';
import { createUser, upsertWatchHistory } from '../src/repositories/userRepository.js';
import { getRecommendations } from '../src/services/recommendationService.js';

const baseContent = {
  cover: 'https://example.com/c.jpg',
  summary: 'Summary',
  type: 'anime',
  tags: ['Action'],
  actors: ['Studio A'],
  author: 'AI Discovery',
  ipName: 'Shared IP',
  status: 'completed',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  source: { provider: 'ai-search', label: 'AI Discovery', url: 'https://example.com/ai-search/1' },
};

test('getRecommendations builds profile from persisted watch history', async () => {
  resetDatabaseForTest(':memory:');
  const watched = { ...baseContent, id: 'anime:ai-search:1', title: 'Watched Anime', hotScore: 500 };
  const matched = { ...baseContent, id: 'anime:ai-search:2', title: 'Matched Anime', hotScore: 300 };
  const fallback = { ...baseContent, id: 'anime:ai-search:3', title: 'Fallback Anime', tags: ['Drama'], actors: ['Studio B'], ipName: 'Other IP', hotScore: 900 };
  upsertContents([watched, matched, fallback]);
  const user = createUser('recommendation-user');
  upsertWatchHistory(user.id, watched.id);

  const result = await getRecommendations({
    type: 'anime',
    limit: 2,
    userId: user.id,
    candidateLoader: async () => [watched, matched, fallback],
  });

  assert.equal(result.some(item => item.id === watched.id), false);
  assert.equal(result[0].id, matched.id);
  assert.match(result[0].reason, /同/);
});
