import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import { recordSourceRun, getSourceStatuses } from '../src/repositories/sourceRepository.js';

test('recordSourceRun stores latest source status by type', () => {
  resetDatabaseForTest(':memory:');
  recordSourceRun({ type: 'drama', source: 'platform_hot', status: 'success', count: 12, error: null });
  recordSourceRun({ type: 'novel', source: 'qidian', status: 'failed', count: 0, error: 'timeout' });

  const statuses = getSourceStatuses();
  const drama = statuses.find(item => item.type === 'drama');
  const novel = statuses.find(item => item.type === 'novel');

  assert.equal(drama.status, 'success');
  assert.equal(drama.count, 12);
  assert.equal(novel.status, 'failed');
  assert.equal(novel.error, 'timeout');
});
