import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/database.js';
import {
  createSearchAliasGroup,
  listSearchAliasGroups,
  resolveSearchAliasContext,
  updateSearchAliasGroup,
  deleteSearchAliasGroup,
} from '../src/services/searchAliasService.js';

test('search alias service creates, updates and deletes alias groups', () => {
  resetDatabaseForTest(':memory:');

  const created = createSearchAliasGroup({
    canonicalKeyword: '家里家外',
    aliases: ['盛夏芬德拉', '家里家外短剧'],
    type: 'drama',
    enabled: true,
    notes: '短剧别名',
  });

  assert.equal(created.canonicalKeyword, '家里家外');
  assert.deepEqual(created.aliases, ['盛夏芬德拉', '家里家外短剧']);

  const updated = updateSearchAliasGroup(created.id, {
    aliases: ['盛夏芬德拉', '芬德拉'],
    enabled: false,
  });

  assert.deepEqual(updated.aliases, ['盛夏芬德拉', '芬德拉']);
  assert.equal(updated.enabled, false);
  assert.equal(listSearchAliasGroups().length, 1);

  const deleted = deleteSearchAliasGroup(created.id);
  assert.equal(deleted.deleted, true);
  assert.equal(listSearchAliasGroups().length, 0);
});

test('search alias service resolves expanded search terms by type', () => {
  resetDatabaseForTest(':memory:');

  createSearchAliasGroup({
    canonicalKeyword: '家里家外',
    aliases: ['盛夏芬德拉', '芬德拉家里家外'],
    type: 'drama',
    enabled: true,
  });
  createSearchAliasGroup({
    canonicalKeyword: '诡秘之主',
    aliases: ['小周', '塔罗会'],
    type: 'novel',
    enabled: true,
  });

  const drama = resolveSearchAliasContext('盛夏芬德拉', { type: 'drama' });
  assert.deepEqual(drama.searchTerms, ['盛夏芬德拉', '家里家外', '芬德拉家里家外']);

  const novel = resolveSearchAliasContext('塔罗会', { type: 'novel' });
  assert.deepEqual(novel.searchTerms, ['塔罗会', '诡秘之主', '小周']);

  const unmatched = resolveSearchAliasContext('不存在的词', { type: 'drama' });
  assert.deepEqual(unmatched.searchTerms, ['不存在的词']);
});
