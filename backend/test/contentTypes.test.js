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
  const services = ['adminService.js', 'catalogService.js', 'contentService.js', 'searchAliasService.js'];
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
