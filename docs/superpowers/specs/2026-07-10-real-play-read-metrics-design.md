# 真实播放量/阅读量采集与展示设计

日期：2026-07-10
项目：MediaHub

## 背景

当前前端已经避免把 `playOrReadYi`、`playOrReadScore`、`totalScore` 等热度或综合评分字段展示成真实“播放量/阅读量”。用户进一步要求恢复真实“播放量/阅读量”展示，但数据必须来自真实可追溯来源，并通过多种方法尽量获取。

本设计采用用户确认的 B 方案：公开真实数值 + 第三方可信平台数值；每个数值都标注来源和采集时间。

## 目标

1. 展示真实播放量或真实阅读量，而不是展示估算热度。
2. 支持多种采集方法，尽量提高覆盖率。
3. 明确标注来源、采集时间、来源类型和置信级别。
4. 官方公开数据优先；官方缺失时允许第三方可信来源补充。
5. 未采集到真实值时显示“未公开/待采集”，不能用热度分冒充。
6. 保持现有综合分、内容指数、平台热度等评分展示，但与真实播放/阅读量分开。

## 非目标

1. 不在本阶段购买或接入付费数据服务。
2. 不绕过登录、付费墙、验证码或平台反爬限制。
3. 不把搜索指数、榜单排名、热度值、点赞收藏量推算成真实播放量/阅读量。
4. 不保证所有平台和所有作品都能拿到真实数值；页面上必须允许显示缺失状态。

## 数据模型

在内容 `metrics` 下新增真实指标字段，保留现有评分字段不变。

```ts
type RealMetricSource = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  metricType: 'play' | 'read';
  value: number;
  unit: 'count';
  method: 'public_page' | 'embedded_json' | 'public_api' | 'third_party';
  confidence: 'official' | 'trusted_third_party';
  capturedAt: string;
};

type Metrics = {
  realPlayCount?: number;
  realReadCount?: number;
  realMetricStatus?: 'official' | 'trusted_third_party' | 'unavailable';
  realMetricCapturedAt?: string;
  realMetricSources?: RealMetricSource[];

  // Existing fields remain available for scoring/index display only.
  playOrReadYi?: number;
  playOrReadScore?: number;
  totalScore?: number;
};
```

### Selection rules

1. If official sources contain a valid value, choose the newest official value.
2. If no official value exists, choose the newest trusted third-party value.
3. If multiple values from the same confidence level conflict, show the selected value and preserve all sources in `realMetricSources` for inspection.
4. If no valid value exists, set `realMetricStatus` to `unavailable` and do not set `realPlayCount` or `realReadCount`.

## Backend design

### New service

Add `backend/src/services/realMetricCollectorService.js`.

Responsibilities:

1. Receive a content item or candidate item with title, type, source URL, source ID, and optional platform metadata.
2. Try registered collectors in priority order.
3. Normalize all successful results to `RealMetricSource`.
4. Pick the display value by the selection rules.
5. Return a metrics patch that can be merged into content records.

### Collector methods

#### 1. Public page collector

Parse visible text from official public pages and trusted third-party pages.

Examples of labels to parse:

- 播放量
- 总播放
- 累计播放
- 阅读量
- 总阅读
- 累计阅读
- 观看

This collector must parse Chinese units such as 万、亿 and normalize them to integer counts.

#### 2. Embedded JSON collector

Parse JSON embedded in script tags or hydration state blocks when a page includes structured data.

Examples of containers:

- `application/json` scripts
- `__INITIAL_STATE__`
- `__NEXT_DATA__`
- inline state assignment scripts

Only use explicit play/read fields. Do not infer from unrelated heat or rank fields.

#### 3. Public API collector

Support known public JSON endpoints if they are already exposed by platform pages and do not require private credentials. Responses are parsed through source-specific adapters.

The adapter must record the endpoint URL and captured time.

#### 4. Trusted third-party collector

Use trusted third-party public pages when official values are absent. Values collected here must be marked `confidence: 'trusted_third_party'` and displayed differently from official values.

## Integration points

### Ingestion

Integrate the collector into existing ingestion flow after target/platform item discovery and before content normalization persistence.

Likely touch points:

- `backend/src/services/ingestionService.js`
- `backend/src/services/targetPlatformCrawlerService.js`
- `backend/src/services/platformHotSourceService.js`
- `backend/src/services/contentNormalizer.js`
- `backend/src/services/hotDatasetService.js`

The implementation should avoid a hard dependency on any one collector. Collector failures should be captured as source errors, not fail the whole ingestion job.

### API response

Ensure content list/detail responses expose the new `metrics.real*` fields without changing existing fields.

Likely touch points:

- `backend/src/services/contentResponseService.js`
- `frontend/src/types/index.ts`

## Frontend design

### Display rules

Drama/anime/comic playback content:

- Official value: `真实播放量 1.26亿`
- Third-party value: `第三方播放量 1.26亿`
- Missing value: `真实播放量 未公开`

Novel content:

- Official value: `真实阅读量 8234万`
- Third-party value: `第三方阅读量 8234万`
- Missing value: `真实阅读量 未公开`

Every displayed value should have secondary metadata when space allows:

```text
来源：起点中文网公开页 · 采集：2026-07-10 07:30
```

Compact ranking rows may show only the value, with source details in detail panel or tooltip/secondary line.

### Separation from score fields

The following fields must not be displayed as real playback/read counts:

- `playOrReadYi`
- `playOrReadScore`
- `platformHeatWan`
- `searchIndex`
- `topicPlayYi`
- `totalScore`

They may continue to power `内容指数`、`平台指数`、`综合分` and similar labels.

### Likely frontend files

- `frontend/src/utils/contentMetrics.ts`
- `frontend/src/utils/hotScore.ts`
- `frontend/src/components/dashboard/MetricQuad.tsx`
- `frontend/src/components/dashboard/DashboardRankTable.tsx`
- `frontend/src/components/ContentCard.tsx`
- `frontend/src/components/RelatedCard.tsx`
- `frontend/src/components/PlatformRankList.tsx`
- `frontend/src/pages/Detail.tsx`
- `frontend/src/pages/Admin.tsx`
- `frontend/src/types/index.ts`

## Testing strategy

### Backend tests

Add tests for:

1. Chinese unit parsing: 个、万、亿 and decimal values.
2. Public page collector extracting explicit play/read labels.
3. Embedded JSON collector extracting explicit play/read fields.
4. Collector selection priority: official beats third-party.
5. Missing values produce unavailable status.
6. Collector errors do not fail entire ingestion.

### Frontend tests

Add or update tests for:

1. Official real playback/read display.
2. Third-party playback/read display with third-party label.
3. Missing value display.
4. Guard tests ensuring score fields are not formatted as real playback/read counts.
5. Dashboard/detail/card/admin surfaces use the same formatter.

## Rollout plan

1. Add real metric types and backend unit parser.
2. Add collector service with public page and embedded JSON support.
3. Integrate collector into ingestion with safe failure behavior.
4. Add API response propagation.
5. Add frontend formatter and update display surfaces.
6. Add tests for backend and frontend behavior.
7. Run backend tests, frontend tests, and production build.

## Acceptance criteria

1. If a real official playback/read value exists, the UI displays it with official source and capture time.
2. If only a trusted third-party value exists, the UI displays it as third-party, not official.
3. If no real value exists, the UI displays “未公开” or “待采集”.
4. No UI surface labels score or heat fields as real playback/reading volume.
5. Existing content index, platform index, and total score displays continue to work.
6. Tests and build pass.
