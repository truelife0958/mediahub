import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { recordSourceRun, getSourceStatuses } from '../src/repositories/sourceRepository.js';

test('recordSourceRun stores latest source status by type', () => {
  resetDatabaseForTest(':memory:');
  recordSourceRun({ type: 'anime', source: 'ai_search', status: 'success', count: 12, error: null });
  recordSourceRun({ type: 'novel', source: 'ai_search', status: 'failed', count: 0, error: 'timeout' });

  const statuses = getSourceStatuses();
  const anime = statuses.find(item => item.type === 'anime');
  const novel = statuses.find(item => item.type === 'novel');

  assert.equal(anime.status, 'success');
  assert.equal(anime.count, 12);
  assert.equal(novel.status, 'failed');
  assert.equal(novel.error, 'timeout');
});
