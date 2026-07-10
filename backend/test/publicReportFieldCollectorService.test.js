import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectPublicReportFieldsForItem,
  enrichItemsWithPublicReportFields,
  extractPublicReportFieldsFromText,
  selectPublicReportFieldPatch,
} from '../src/services/publicReportFieldCollectorService.js';

const capturedAt = '2026-07-10T00:00:00.000Z';
const title = '\u67d0\u67d0\u77ed\u5267';
const reportText = '\u300a\u67d0\u67d0\u77ed\u5267\u300b\u4e0a\u7ebf\u65f6\u95f4\uff1a2026\u5e747\u67081\u65e5\uff0c\u7c7b\u578b\uff1a\u90fd\u5e02\u590d\u4ec7\uff0c\u4e3b\u6f14\uff1a\u5f20\u4e09\u3001\u674e\u56db\uff0c\u7248\u6743\u65b9\uff1a\u67d0\u67d0\u5f71\u4e1a\u3002\u7b80\u4ecb\uff1a\u8bb2\u8ff0\u4e86\u5973\u4e3b\u9006\u88ad\u590d\u4ec7\u7684\u6545\u4e8b\u3002\u7d2f\u8ba1\u64ad\u653e\u91cf 1.2\u4ebf\u3002';

test('extractPublicReportFieldsFromText extracts field-level public report facts', () => {
  const sources = extractPublicReportFieldsFromText({
    text: reportText,
    sourceId: 'wechat_report',
    sourceName: '\u81ea\u5a92\u4f53\u62a5\u9053',
    sourceUrl: 'https://example.com/report/a',
    sourceType: 'self_media',
    capturedAt,
  });
  const patch = selectPublicReportFieldPatch(sources, { type: 'drama', metrics: {} });

  assert.equal(patch.releaseDate, '2026-07-01');
  assert.equal(patch.contentType, '\u90fd\u5e02\u590d\u4ec7');
  assert.deepEqual(patch.actors, ['\u5f20\u4e09', '\u674e\u56db']);
  assert.equal(patch.copyrightOwner, '\u67d0\u67d0\u5f71\u4e1a');
  assert.match(patch.summary, /\u5973\u4e3b\u9006\u88ad\u590d\u4ec7/);
  assert.equal(patch.metrics.realPlayCount, 120_000_000);
  assert.equal(patch.metrics.realMetricStatus, 'trusted_third_party');
  assert.ok(patch.fieldSources.some(item => item.field === 'releaseDate' && item.sourceUrl === 'https://example.com/report/a'));
  assert.ok(patch.fieldSources.some(item => item.field === 'playCount' && item.value === 120_000_000));
});

test('public report metric extraction does not treat heat or rank as real play/read data', () => {
  const sources = extractPublicReportFieldsFromText({
    text: '\u7ad9\u5185\u70ed\u5ea69800\uff0c\u6392\u540d\u7b2c1\uff0c\u70b9\u8d5e20\u4e07\uff0c\u6536\u85cf8\u4e07\uff0c\u8bdd\u9898\u6307\u65703000\u3002',
    sourceId: 'heat_board',
    sourceName: '\u70ed\u699c\u9875',
    sourceUrl: 'https://example.com/hot',
    sourceType: 'trusted_third_party',
    capturedAt,
  });
  const patch = selectPublicReportFieldPatch(sources, { type: 'drama', metrics: {} });

  assert.equal(patch.metrics, undefined);
  assert.equal(patch.fieldSources.length, 0);
});

test('collectPublicReportFieldsForItem uses searchPublicReports results', async () => {
  const result = await collectPublicReportFieldsForItem({
    item: { id: 'drama:test:a', type: 'drama', title, metrics: {} },
    searchPublicReports: async ({ title: searchTitle, fields }) => {
      assert.equal(searchTitle, title);
      assert.ok(fields.includes('releaseDate'));
      return [{
        sourceId: 'search_report',
        sourceName: '\u516c\u5f00\u62a5\u9053\u68c0\u7d22',
        sourceUrl: 'https://example.com/search-report',
        sourceType: 'trusted_third_party',
        text: reportText,
      }];
    },
    now: new Date(capturedAt),
  });

  assert.equal(result.patch.releaseDate, '2026-07-01');
  assert.equal(result.patch.metrics.realPlayCount, 120_000_000);
  assert.equal(result.errors.length, 0);
  assert.ok(result.sources.length >= 5);
});

test('enrichItemsWithPublicReportFields keeps ingestion alive when one public report search fails', async () => {
  const okTitle = '\u6210\u529f\u4f5c\u54c1';
  const failTitle = '\u5931\u8d25\u4f5c\u54c1';
  const result = await enrichItemsWithPublicReportFields([
    { id: 'drama:test:ok', type: 'drama', title: okTitle, metrics: {} },
    { id: 'drama:test:fail', type: 'drama', title: failTitle, metrics: {} },
  ], {
    searchPublicReports: async ({ title }) => {
      if (title === failTitle) throw new Error('search unavailable');
      return [{
        sourceId: 'report_ok',
        sourceName: '\u62a5\u9053',
        sourceUrl: 'https://example.com/ok',
        sourceType: 'self_media',
        text: reportText,
      }];
    },
    now: new Date(capturedAt),
  });

  assert.equal(result.list.length, 2);
  assert.equal(result.list[0].releaseDate, '2026-07-01');
  assert.equal(result.list[1].title, failTitle);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].id, 'drama:test:fail');
});
