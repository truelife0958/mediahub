import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { hasBrokenText } from '../src/utils/contentMetrics.ts';

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx|md)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('workspace hygiene', () => {
  it('keeps local runtime artifacts out of git status', () => {
    const ignoreRules = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    assert.equal(ignoreRules.includes('tmp/'), true);
  });

  it('does not keep retired dashboard CSS blocks in the active stylesheet', () => {
    const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const retiredClassNames = [
      'dashboard-mini-rank',
      'dashboard-spotlight',
      'dashboard-insight',
      'dashboard-analysis',
      'dashboard-side-heading',
      'dashboard-side-note',
      'dashboard-token-grid-compact',
      'dashboard-mini-metric-grid-compact',
    ];

    for (const className of retiredClassNames) {
      assert.equal(stylesheet.includes(className), false, className);
    }
  });

  it('does not keep visible unicode escape copy in frontend source or tests', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ];
    const files = roots.flatMap(listSourceFiles);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /\\u[0-9a-fA-F]{4}/, file);
    }
  });

  it('does not keep mojibake copy outside explicit broken-text test fixtures', () => {
    const roots = [
      fileURLToPath(new URL('../src', import.meta.url)),
      fileURLToPath(new URL('../test', import.meta.url)),
    ];
    const files = roots.flatMap(listSourceFiles);
    const intentionalBrokenTextFixtures = new Set([
      fileURLToPath(new URL('../src/utils/contentMetrics.ts', import.meta.url)),
      fileURLToPath(new URL('../test/contentMetrics.test.ts', import.meta.url)),
      fileURLToPath(new URL('../test/contentRelations.test.ts', import.meta.url)),
    ]);

    for (const file of files) {
      if (intentionalBrokenTextFixtures.has(file)) continue;
      const source = readFileSync(file, 'utf8');
      assert.equal(hasBrokenText(source), false, file);
    }
  });
});
