import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT_TYPES, TYPE_LABELS } from '../src/constants/contentTypes.js';

test('CONTENT_TYPES exposes the four visible modules in canonical order', () => {
  assert.deepEqual(CONTENT_TYPES, ['drama', 'novel', 'anime', 'comic']);
});

test('TYPE_LABELS map every type to a Chinese label', () => {
  for (const type of CONTENT_TYPES) {
    assert.ok(TYPE_LABELS[type], `missing label for ${type}`);
  }
});

test('services import CONTENT_TYPES from the shared constant module', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const services = ['adminService.js', 'catalogService.js', 'contentService.js', 'searchAliasService.js', 'autoRefreshService.js', 'contentNormalizer.js'];
  for (const file of services) {
    const src = await readFile(resolve('src/services', file), 'utf8');
    assert.ok(
      src.includes("from '../constants/contentTypes.js'"),
      `${file} should import from constants/contentTypes.js`,
    );
    assert.ok(
      !/^(const|let|var)\s+CONTENT_TYPES\s*=\s*\[/m.test(src),
      `${file} should not define its own CONTENT_TYPES array`,
    );
  }
});

test('no file outside the constant module defines its own CONTENT_TYPES array literal', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (entry.name.endsWith('.js')) yield full;
    }
  }

  const arrayLiteral = /^(const|let|var)\s+CONTENT_TYPES\s*=\s*\[/m;
  const setLiteral = /new\s+Set\(\s*\[\s*'drama'/;
  for await (const file of walk('src')) {
    const src = await readFile(file, 'utf8');
    assert.ok(!arrayLiteral.test(src), `${file} should not define its own CONTENT_TYPES array`);
    assert.ok(!setLiteral.test(src), `${file} should not define its own Set(['drama'...]) literal`);
  }
});
