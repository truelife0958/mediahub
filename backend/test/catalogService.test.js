import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiError } from '../src/utils/apiErrors.js';

test('createApiError exposes stable http status and public code', () => {
  const err = createApiError('upstream_rate_limited', 'AI search rate limited');

  assert.equal(err.statusCode, 429);
  assert.equal(err.publicCode, 'upstream_rate_limited');
  assert.equal(err.message, 'AI search rate limited');
});

import { parseContentId } from '../src/services/catalogService.js';

test('parseContentId rejects fallback provider ids', () => {
  assert.throws(
    () => parseContentId('anime:fallback:1'),
    /Unsupported content source/
  );
});
