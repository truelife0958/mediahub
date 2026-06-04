import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clonePromptTemplates, cloneStringList, serializePromptTemplates, serializeStringList } from '../src/pages/admin/referenceDrafts.ts';

describe('referenceDrafts', () => {
  it('clones prompt templates without sharing references', () => {
    const templates = [{ version: 'v1', name: '模板', status: '线上', prompt: '内容' }];
    const draft = clonePromptTemplates(templates);
    draft[0].name = '模板-改';
    assert.equal(templates[0].name, '模板');
  });

  it('clones string lists without sharing references', () => {
    const items = ['a', 'b'];
    const draft = cloneStringList(items);
    draft.push('c');
    assert.deepEqual(items, ['a', 'b']);
  });

  it('serializes prompt templates and strings consistently', () => {
    assert.notEqual(
      serializePromptTemplates([{ version: 'v1', name: '模板', status: '线上', prompt: '内容' }]),
      serializePromptTemplates([{ version: 'v1', name: '模板2', status: '线上', prompt: '内容' }]),
    );
    assert.notEqual(serializeStringList(['a']), serializeStringList(['a', 'b']));
  });
});
