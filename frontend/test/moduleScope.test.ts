import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

import { VISIBLE_CONTENT_TYPES } from '../src/constants/index.ts';
import { TYPE_OPTIONS } from '../src/pages/admin/types.ts';

describe('visible module scope', () => {
  it('keeps the user-facing product focused on the four visible modules', () => {
    assert.deepEqual([...VISIBLE_CONTENT_TYPES], ['drama', 'novel', 'anime', 'comic']);
    assert.deepEqual(TYPE_OPTIONS.map(item => item.id), ['drama', 'novel', 'anime', 'comic']);
  });

  it('does not expose retired user-space API or page modules', () => {
    const apiIndex = readFileSync(new URL('../src/api/index.ts', import.meta.url), 'utf8');
    const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

    assert.doesNotMatch(apiIndex, /users/);
    assert.doesNotMatch(appSource, /path="\/me"/);
    assert.equal(existsSync(new URL('../src/pages/Me.tsx', import.meta.url)), false);
    assert.equal(existsSync(new URL('../src/hooks/useSharedUser.tsx', import.meta.url)), false);
  });

  it('keeps navigation within the approved data-app pages', () => {
    const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const detailSource = readFileSync(new URL('../src/pages/Detail.tsx', import.meta.url), 'utf8');
    const apiIndex = readFileSync(new URL('../src/api/index.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(appSource, /path="\/leaderboards/);
    assert.doesNotMatch(appSource, /path="\/topics/);
    assert.doesNotMatch(appSource, /path="\/compare"/);
    assert.doesNotMatch(detailSource, /`\/topics\//);
    assert.doesNotMatch(apiIndex, /leaderboards/);
  });

  it('keeps the active admin data collection surface scoped to visible modules', () => {
    const ingestionSection = readFileSync(new URL('../src/pages/admin/IngestionSection.tsx', import.meta.url), 'utf8');

    assert.match(ingestionSection, /Refresh four modules/);
    assert.match(ingestionSection, /admin-refresh-queue-status/);
  });

  it('removes retired complex admin panels from the frontend source tree', () => {
    const retiredFiles = [
      '../src/pages/Compare.tsx',
      '../src/pages/Leaderboards.tsx',
      '../src/pages/Topics.tsx',
      '../src/api/leaderboards.ts',
      '../src/components/LeaderboardStrip.tsx',
      '../src/pages/admin/AiConfigCard.tsx',
      '../src/pages/admin/ContentWorkspace.tsx',
      '../src/pages/admin/LeaderboardInsightsPanel.tsx',
      '../src/pages/admin/ObservabilityPanels.tsx',
      '../src/pages/admin/ReferencePanels.tsx',
      '../src/pages/admin/SourceRoutingSection.tsx',
      '../src/pages/admin/SystemSettingsCard.tsx',
      '../src/pages/admin/contentEditorState.ts',
      '../src/pages/admin/manualContent.ts',
      '../src/pages/admin/referenceDrafts.ts',
      '../src/pages/admin/systemSettingsState.ts',
    ];

    for (const file of retiredFiles) {
      assert.equal(existsSync(new URL(file, import.meta.url)), false, file);
    }
  });

  it('does not export retired complex admin API clients', () => {
    const adminApi = readFileSync(new URL('../src/api/admin.ts', import.meta.url), 'utf8');
    const retiredExports = [
      'getSourceHealth',
      'getSystemSettings',
      'updateSystemSettings',
      'getSearchAliasGroups',
      'createSearchAliasGroup',
      'updateSearchAliasGroup',
      'deleteSearchAliasGroup',
      'getSourceRoutingSettings',
      'upsertSourceRouting',
      'clearSourceRouting',
      'getAdminContents',
      'updateAdminContent',
      'createAdminContent',
      'getLeaderboardAnomalies',
      'triggerLeaderboardCapture',
      'listKeywordSubscriptions',
      'createKeywordSubscription',
      'updateKeywordSubscription',
      'deleteKeywordSubscription',
      'listSubscriptionHits',
      'listAuditLogs',
      'listContentRevisions',
    ];

    for (const name of retiredExports) {
      assert.doesNotMatch(adminApi, new RegExp(`export async function ${name}\\b`), name);
    }
  });
});
