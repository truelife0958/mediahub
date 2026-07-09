# Real Ranking Auto Update Design

Date: 2026-07-09
Project: MediaHub
Status: Approved design direction, pending user review of written spec

## Background

MediaHub currently serves four user-facing modules: drama, novel, anime, and comic. The project already has JSON-first hot datasets, current snapshots, source crawlers, automatic refresh services, scoring utilities, and dashboard pages. Recent work expanded the data catalog to 100 records per module and added source credibility, trend charts, filters, and detail covers.

The next goal is to make automatic updates and rankings consistently real, explainable, and auditable. The selected direction is a mixed ranking model: the default page ranking uses a composite hotness score, while each item preserves original platform rankings and gives priority to authority lists when appropriate.

## Goals

1. Automatically update real data for drama, novel, anime, and comic modules.
2. Preserve platform-original rankings from sources such as Hongguo, Fanqie, Qidian, Bilibili, Tencent Comic, Kuaikan, Douban, and other public sources.
3. Produce a default ranking that is explainable, stable, and based on multiple signals.
4. Allow authority or annual rankings to dominate when explicitly configured, such as the drama annual top list.
5. Surface source credibility and ranking reasons in the UI.
6. Keep a usable previous snapshot when an upstream source fails.
7. Add tests that prevent synthetic, zero-signal, or unverifiable rows from replacing real ranked content.

## Non-goals

1. Do not build a full standalone ranking engine in this phase.
2. Do not require a database migration for the first implementation; JSON datasets remain canonical.
3. Do not replace the existing dashboard layout.
4. Do not remove current hot score and trend chart features.
5. Do not claim a platform rank when the source did not provide or imply one.

## Recommended Approach

Use a ranking evidence layer. Each source crawl or curated authority list contributes ranking evidence. The final dataset stores both the evidence and a normalized ranking summary.

The data flow is:

1. Scheduled or manual refresh starts.
2. Four module crawlers collect public source data.
3. Raw source rows are normalized into ranking evidence.
4. Duplicate works are merged by id, title, source URL, IP name, or known aliases.
5. Source confidence is calculated.
6. Composite ranking score is calculated.
7. Authority rules are applied for configured lists.
8. Current JSON datasets, snapshots, indexes, and crawl logs are written.
9. Frontend displays rank, platform ranks, confidence, trend, and ranking reason.

## Data Model

### Ranking Evidence

Each content item may include a `rankingEvidence` array.

```ts
interface RankingEvidence {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  capturedAt: string;
  rank?: number;
  score?: number;
  evidenceType: 'official_rank' | 'platform_rank' | 'annual_rank' | 'search_signal' | 'topic_signal' | 'manual_verified';
  confidence: number;
  note?: string;
}
```

### Ranking Metadata

Each content item may include a `rankingMeta` object.

```ts
interface RankingMeta {
  displayRank: number;
  compositeScore: number;
  authorityRank?: number;
  authoritySource?: string;
  bestPlatformRank?: number;
  bestPlatformSource?: string;
  sourceConfidence: 'high' | 'medium' | 'low';
  rankingReason: string;
  updatedBy: 'auto_refresh' | 'manual_refresh' | 'seed_backfill';
}
```

## Ranking Policy

The default mixed ranking policy uses these weights:

| Signal | Default weight |
| --- | ---: |
| Authority or annual list | 35% |
| Platform-original rank | 30% |
| Playback, reading, or platform heat | 20% |
| Search and topic trend | 10% |
| Source confidence | 5% |

### Authority Rules

1. A configured authority list can pin or strongly boost items.
2. The drama annual top list keeps its configured order before normal composite ranking.
3. Authority rank must still be displayed as evidence, not hidden inside the score.
4. Items outside the authority list are sorted by composite score.

### Platform Rank Rules

1. Platform rank is preserved when directly observed from a platform list or strongly implied by crawl order from a platform ranking page.
2. Multiple platform ranks are stored separately, not overwritten.
3. The best platform rank is the highest-confidence, lowest-number rank among verified sources.
4. Platform-original ranks are visible in details and can be used as a filter dimension later.

### Source Confidence Rules

High confidence:
- Official platform page, public API, or authority list.
- Stable title, URL, and cover or metadata.
- Captured recently.

Medium confidence:
- Public search result or aggregator with matching title and source URL.
- Missing some metadata but still externally verifiable.

Low confidence:
- Search-only signal, weak metadata, or stale source.
- Used only as supplemental evidence, not as a primary ranking source.

## Automatic Update Behavior

### Schedule

Use the existing auto-refresh runtime. The default should support:

1. Daily refresh for production-style use.
2. Interval refresh for development or realtime monitoring.
3. Manual refresh from admin/system endpoint.

### Failure Handling

1. If one source fails, keep successful sources and mark the run as partial.
2. If an entire module fails, keep the previous current dataset for that module.
3. Crawl logs record source, type, status, duration, item count, and error message.
4. Frontend status can show the last successful capture time.

### Snapshot Handling

1. Write `data/current/<type>.json` after successful ranking generation.
2. Write `data/snapshots/<date>/<type>.json` for trend history.
3. Trend matching should continue using id and title fallback.
4. Do not delete old snapshots during normal refresh.

## UI Requirements

### Ranking Rows

Each ranking row should show:

1. Display rank.
2. Title and categories.
3. Key metric values.
4. Source credibility.
5. Composite score.
6. Trend sparkline.
7. Platform-original rank summary when available.

### Detail Panel

Each content detail should show:

1. Cover image.
2. Main facts and source.
3. Ranking reason.
4. Authority rank if present.
5. Platform original ranks.
6. Ranking evidence list.
7. Captured time.

Example ranking reason:

> Annual authority rank #1, Hongguo platform rank #3, and stable multi-source heat signals.

## Module-specific Notes

### Drama

Primary sources include Hongguo, Duanju Baike, Douban annual lists, Iqiyi public pages, ChineseMov, TheTVDB, and public search validation. Annual top entries can be pinned or strongly boosted.

### Novel

Primary sources include Qidian, Fanqie, Baidu Novel search, and public platform pages. Qidian mobile search cover data can be used as cover evidence when matched by title.

### Anime

Primary sources include Bilibili ranking and season APIs. Additional sources can be added later for Douban or official streaming pages.

### Comic

Primary sources include Tencent Comic and Kuaikan. Image loading must use `referrerPolicy="no-referrer"` where needed because some official cover hosts reject localhost referrers.

## Testing Requirements

Add or extend tests for:

1. Four current datasets contain drama, novel, anime, and comic.
2. Each module keeps 100 real records when source data is available.
3. Items include ranking evidence when a source provides ranking context.
4. Authority-ranked drama entries remain in the configured order.
5. Platform ranks are preserved separately from composite rank.
6. Source confidence is high for official platform and authority sources.
7. Failed module refresh keeps the previous current dataset.
8. Partial source failure does not discard successful sources.
9. Detail API returns ranking metadata and evidence.
10. Frontend renders ranking reason and platform-original rank without breaking mobile layout.

## Implementation Units

1. Data schema helpers for ranking evidence and ranking metadata.
2. Source crawler normalization into evidence objects.
3. Composite score policy update.
4. Dataset refresh merge and fallback handling.
5. API response mapping for new metadata.
6. Frontend row and detail display updates.
7. Tests for backend scoring, dataset refresh, and frontend rendering.

## Acceptance Criteria

1. Manual and scheduled refresh can regenerate all four current datasets.
2. Drama annual top entries keep the approved order while still showing source evidence.
3. Novel, anime, and comic items preserve platform-original rank evidence when available.
4. Every displayed ranking has a readable ranking reason.
5. Source credibility is visible on ranking rows and details.
6. Existing frontend tests, backend tests, and production build pass.
7. Browser validation confirms dashboard, drama, novel, anime, and comic pages load without visible data errors.

## Open Decisions

None. The selected product direction is the mixed ranking model.
