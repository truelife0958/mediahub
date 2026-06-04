import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Content } from '../src/types/index.ts';
import { cloneContentDraft, hasContentEditorChanges, parseEditorList } from '../src/pages/admin/contentEditorState.ts';

function createContentSample(): Content {
  return {
    id: 'anime:test:1',
    title: '样本内容',
    summary: '样本简介',
    type: 'anime',
    tags: ['热血', '校园'],
    actors: ['角色 A'],
    author: '作者 A',
    ipName: 'IP A',
    status: 'ongoing',
    hotScore: 1234,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('contentEditorState', () => {
  it('parses comma and newline separated tags', () => {
    assert.deepEqual(parseEditorList('热血, 校园\n冒险，成长'), ['热血', '校园', '冒险', '成长']);
  });

  it('clones editor drafts without mutating source arrays', () => {
    const source = createContentSample();
    const draft = cloneContentDraft(source);
    assert.ok(draft);
    draft.tags.push('新标签');
    assert.deepEqual(source.tags, ['热血', '校园']);
    assert.deepEqual(draft.tags, ['热血', '校园', '新标签']);
  });

  it('only marks editor dirty when editable fields change', () => {
    const source = createContentSample();
    const sameDraft = cloneContentDraft(source);
    assert.equal(hasContentEditorChanges(source, sameDraft), false);

    const changedDraft = cloneContentDraft(source);
    assert.ok(changedDraft);
    changedDraft.title = '样本内容 2';
    assert.equal(hasContentEditorChanges(source, changedDraft), true);
  });
});
