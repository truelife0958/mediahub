import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const scriptPath = path.resolve('scripts/lighthouse-budget.mjs');

test('lighthouse budget script keeps report and Chrome workspace outside the repo root', () => {
  const source = readFileSync(scriptPath, 'utf8');

  assert.match(source, /os\.tmpdir\(\)/, 'should use a temporary workspace root');
  assert.match(source, /user-data-dir/, 'should set an explicit Chrome user data dir');
  assert.match(source, /rmSync\(workspaceRoot/, 'should clean up the temporary workspace');
  assert.doesNotMatch(source, /tmp-lighthouse-report\.json/, 'should not write the report into the repo root');
  assert.doesNotMatch(source, /REPORT_PATH/, 'should not keep a repo-root report constant');
});
