import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SystemSettings } from '../src/types/index.ts';
import { createSystemSettingsFormState, serializeSystemSettingsFormState } from '../src/pages/admin/systemSettingsState.ts';

function createSettingsSample(): SystemSettings {
  return {
    autoRefresh: {
      enabled: false,
      mode: 'interval',
      intervalMinutes: 5,
      failureBackoffEnabled: true,
      failureBackoffMultiplier: 2,
      failureBackoffMaxMinutes: 60,
      hour: 6,
      minute: 30,
      runOnStartup: false,
    },
    ingestBackfill: {
      pages: 2,
      pageSize: 20,
      sorts: ['hot'],
    },
    cache: {
      ttlMs: 15000,
      timeoutMs: 2000,
      retryMaxAttempts: 2,
      retryBaseDelayMs: 300,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerOpenMs: 30000,
      rateLimitPerSecond: 6,
      rateLimitBurst: 6,
    },
    notifications: {
      webhookEnabled: true,
      webhookTimeoutMs: 7000,
      webhookRetryMaxAttempts: 4,
      webhookRetryBaseDelayMs: 900,
    },
  };
}

describe('systemSettingsState', () => {
  it('creates stable form state snapshots', () => {
    const form = createSystemSettingsFormState(createSettingsSample());
    assert.equal(form.autoRefreshMode, 'interval');
    assert.equal(form.intervalMinutes, '5');
    assert.equal(form.failureBackoffEnabled, true);
    assert.equal(form.failureBackoffMultiplier, '2');
    assert.equal(form.failureBackoffMaxMinutes, '60');
    assert.equal(form.hour, '6');
    assert.equal(form.sortHot, true);
    assert.equal(form.sortLatest, false);
    assert.equal(form.webhookEnabled, true);
    assert.equal(form.webhookTimeoutMs, '7000');
    assert.equal(form.webhookRetryMaxAttempts, '4');
    assert.equal(form.webhookRetryBaseDelayMs, '900');
  });

  it('changes serialized snapshot when form fields change', () => {
    const form = createSystemSettingsFormState(createSettingsSample());
    const original = serializeSystemSettingsFormState(form);
    const changed = serializeSystemSettingsFormState({ ...form, autoRefreshEnabled: true });
    assert.notEqual(changed, original);
  });
});
