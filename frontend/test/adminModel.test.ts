import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ADMIN_MODULES } from '../src/pages/admin/adminModel.ts';

describe('adminModel', () => {
  it('keeps the admin surface focused on data operations only', () => {
    assert.deepEqual(ADMIN_MODULES.map(module => module.id), ['data']);
    assert.deepEqual(ADMIN_MODULES[0].tabs.map(tab => tab.id), ['status', 'logs', 'json', 'anomalies']);
    assert.equal(ADMIN_MODULES[0].subtitle.includes('AI'), false);
    assert.equal(ADMIN_MODULES[0].subtitle.includes('Prompt'), false);
  });

  it('keeps admin page source free of visible unicode escape copy', () => {
    const source = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /\\u[0-9a-fA-F]{4}/);
  });

  it('uses the backend queued refresh-all endpoint for one-click four-module ingestion', () => {
    const source = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');

    assert.match(source, /enqueueRefreshAllContentTypes\(\)/);
    assert.doesNotMatch(source, /Promise\.all\(TYPE_OPTIONS\.map\(item => refreshContentType\(item\.id\)\)\)/);
    assert.match(source, /getRefreshJobQueueStatus\(\)/);
  });

});
