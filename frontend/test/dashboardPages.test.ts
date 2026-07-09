import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

describe('four-module dashboard pages', () => {
  it('exposes a dedicated dashboard route as the product entry point', () => {
    const dashboardUrl = new URL('../src/pages/Dashboard.tsx', import.meta.url);
    const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

    assert.equal(existsSync(dashboardUrl), true);
    assert.match(appSource, /lazy\(\(\) => import\('\.\/pages\/Dashboard'\)\)/);
    assert.match(appSource, /path="\/"\s+element=\{<Navigate to="\/dashboard" replace \/>}/);
    assert.match(appSource, /path="\/dashboard"\s+element=\{<Dashboard \/>}/);
  });

  it('makes the dashboard page a four-module ranking board', () => {
    const dashboardSource = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

    assert.match(dashboardSource, /VISIBLE_CONTENT_TYPES\.map/);
    assert.match(dashboardSource, /DashboardRankTable/);
    assert.match(dashboardSource, /compact/);
    assert.match(dashboardSource, /navigate\(`\/\$\{item\.type}\?selected=/);
  });

  it('adds a more entry on every dashboard module board that opens the module page', () => {
    const dashboardSource = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
    const rankTableSource = readFileSync(new URL('../src/components/dashboard/DashboardRankTable.tsx', import.meta.url), 'utf8');

    assert.match(dashboardSource, /onMore=\{\(\) => navigate\(`\/\$\{type\}`\)\}/);
    assert.match(rankTableSource, /onMore\?: \(\) => void/);
    assert.match(rankTableSource, /dashboard-panel-more/);
    assert.match(rankTableSource, />更多</);
  });
  it('uses left ranking and right inline detail on module pages', () => {
    const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');

    assert.match(homeSource, /DashboardShell/);
    assert.match(homeSource, /DashboardRankTable/);
    assert.match(homeSource, /InlineContentDetail/);
    assert.match(homeSource, /useLocation/);
    assert.match(homeSource, /new URLSearchParams\(location\.search\)\.get\('selected'\)/);
    assert.match(homeSource, /className="module-dashboard-layout"/);
    assert.match(homeSource, /className="module-rank-pane"/);
    assert.match(homeSource, /className="module-detail-pane"/);
    assert.doesNotMatch(homeSource, /PlatformRankList/);
    assert.doesNotMatch(homeSource, /navigate\(`\/detail\/\$\{item\.id}\}`/);
  });

  it('keeps related-item detail clicks inline even when the item is outside the current rank list', () => {
    const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');

    assert.match(homeSource, /selectedContentOverride/);
    assert.match(homeSource, /selectedContentOverride\?\.id === selectedId/);
    assert.match(homeSource, /setSelectedContentOverride\(item\)/);
    assert.match(homeSource, /setSelectedContentOverride\(null\)/);
  });

  it('enriches the inline module detail from the selected content detail endpoint', () => {
    const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
    const apiSource = readFileSync(new URL('../src/api/contents.ts', import.meta.url), 'utf8');

    assert.match(apiSource, /export function getContentDetail/);
    assert.match(homeSource, /import \{ getContentDetail, useContents \} from '\.\.\/api'/);
    assert.match(homeSource, /selectedContentDetail/);
    assert.match(homeSource, /getContentDetail\(selectedId/);
    assert.match(homeSource, /selectedContentDetail\?\.id === selectedId\s*\?\s*selectedContentDetail/);
    assert.ok(
      homeSource.indexOf('selectedContentDetail?.id === selectedId')
        < homeSource.indexOf('selectedContentOverride?.id === selectedId'),
      'full selected detail should be preferred over temporary related-item override',
    );
  });

  it('routes cross-module related items to their own module instead of mixing module context', () => {
    const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');

    assert.match(homeSource, /item\.type !== moduleType/);
    assert.match(homeSource, /navigate\(`\/\$\{item\.type}\?selected=\$\{encodeURIComponent\(item\.id\)\}`\)/);
  });

  it('does not let the default first-row selection override a selected query id', () => {
    const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');

    assert.match(homeSource, /querySelectedId/);
    assert.match(homeSource, /new URLSearchParams\(location\.search\)\.get\('selected'\)/);
    assert.match(homeSource, /if \(querySelectedId\) return;/);
  });

  it('exposes rank row selection with accessible button semantics', () => {
    const rankTableSource = readFileSync(new URL('../src/components/dashboard/DashboardRankTable.tsx', import.meta.url), 'utf8');

    assert.match(rankTableSource, /aria-current=\{selectedId === item\.id \? 'true' : undefined\}/);
    assert.match(rankTableSource, /aria-label=\{`/);
  });

  it('exposes the active top navigation item with page semantics', () => {
    const shellSource = readFileSync(new URL('../src/components/dashboard/DashboardShell.tsx', import.meta.url), 'utf8');

    assert.match(shellSource, /<nav className="dashboard-pro-nav" aria-label=/);
    assert.match(shellSource, /aria-current=\{activeType === 'dashboard' \? 'page' : undefined\}/);
    assert.match(shellSource, /aria-current=\{activeType === type \? 'page' : undefined\}/);
  });

  it('keeps the top dashboard clock on current Beijing date instead of dataset date', () => {
    const shellSource = readFileSync(new URL('../src/components/dashboard/DashboardShell.tsx', import.meta.url), 'utf8');
    const dashboardSource = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
    const homeSource = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');

    assert.doesNotMatch(shellSource, /boardDate/);
    assert.match(shellSource, /<span>\{clock\.date\}<\/span>/);
    assert.doesNotMatch(dashboardSource, /boardDate=/);
    assert.doesNotMatch(homeSource, /boardDate=/);
  });



  it('shows source-backed ranking evidence in rows and inline detail', () => {
    const rankTableSource = readFileSync(new URL('../src/components/dashboard/DashboardRankTable.tsx', import.meta.url), 'utf8');
    const platformRankSource = readFileSync(new URL('../src/components/PlatformRankList.tsx', import.meta.url), 'utf8');
    const detailSource = readFileSync(new URL('../src/components/dashboard/InlineContentDetail.tsx', import.meta.url), 'utf8');
    const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

    assert.match(rankTableSource, /ranking-confidence-badge/);
    assert.match(rankTableSource, /rankingMeta\?\.bestPlatformRank/);
    assert.match(platformRankSource, /rankingEvidence\?: Content\['rankingEvidence'\]/);
    assert.match(platformRankSource, /ranking-confidence-badge/);
    assert.match(detailSource, />排名依据</);
    assert.match(detailSource, />来源证据</);
    assert.match(detailSource, /rankingEvidence\.length > 0/);
    assert.match(cssSource, /\.ranking-confidence-badge/);
    assert.match(cssSource, /\.inline-detail-evidence a/);
  });

  it('does not ship visible unicode escape strings in dashboard components', () => {
    const files = [
      '../src/components/dashboard/DashboardShell.tsx',
      '../src/components/dashboard/DashboardRankTable.tsx',
      '../src/components/dashboard/InlineContentDetail.tsx',
      '../src/components/dashboard/MetricQuad.tsx',
    ];

    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /\\u[0-9a-fA-F]{4}/, file);
    }
  });
  it('keeps the mobile dashboard dense enough for first-screen ranking scans', () => {
    const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

    assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*\.dashboard-pro-header-inner[\s\S]*grid-template-areas:\s*"brand clock"\s*"nav actions"/);
    assert.match(cssSource, /\.dashboard-pro-brand \{[\s\S]*line-height:\s*1;/);
    assert.match(cssSource, /\.dashboard-pro-brand strong \{[\s\S]*line-height:\s*1\.2;/);
    assert.match(cssSource, /\.dashboard-pro-brand span \{[\s\S]*line-height:\s*1\.2;/);
    assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*\.dashboard-pro-brand span[\s\S]*display:\s*none/);
    assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*\.dashboard-overview-stats[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*\.dashboard-rank-metrics[\s\S]*display:\s*none/);
  });

  it('keeps the desktop inline detail panel bounded inside the viewport', () => {
    const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

    assert.match(cssSource, /\.module-detail-pane\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*74px;/);
    assert.match(cssSource, /\.inline-detail-panel\s*\{[\s\S]*max-height:\s*calc\(100vh - 92px\);/);
    assert.match(cssSource, /\.inline-detail-panel\s*\{[\s\S]*overflow-y:\s*auto;/);
    assert.match(cssSource, /@media \(max-width: 980px\)[\s\S]*\.inline-detail-panel\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow:\s*hidden;/);
  });});



