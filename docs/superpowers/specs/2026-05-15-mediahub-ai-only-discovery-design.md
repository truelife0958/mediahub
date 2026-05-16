# MediaHub AI-only Discovery Design

## 背景

MediaHub 当前已有 AI 搜索、SQLite 缓存、内容入库、手动刷新和启动/每日自动刷新能力，但仍保留 TVMaze、OpenLibrary、Jikan 等专用内容平台 API 作为来源或回退。新目标是让数据发现和结构化全部由 AI 大模型驱动，允许抓取公开网页文本辅助结构化，但不再调用专用内容平台 API；同时 API 不返回图片字段，前端不展示图片。

## 目标

- 所有剧集、小说、漫画、动漫数据通过 AI 搜索发现获取。
- 后端可读取 AI 返回的公开网页链接，并抓取网页文本作为结构化补充输入。
- 移除 TVMaze、OpenLibrary、Jikan 等专用平台 API 获取路径和回退路径。
- 启动后立即刷新全部内容类型，之后每天按固定时间自动刷新。
- API 默认不返回 `cover` 字段；数据库可继续保留 `cover` 以兼容现有 schema。
- 保留现有 SQLite 缓存、分页、排序、搜索、详情、推荐和手动刷新体验。

## 非目标

- 不做数据库 schema 大迁移，不删除 `contents.cover` 字段。
- 不引入新的图片生成、图片代理或封面抓取能力。
- 不实现多供应商 AI 网关抽象；继续复用现有 `aiConfigService` 的 `baseUrl/model/apiKey` 配置。
- 不保留可配置的平台源路由，不再让用户切换到 TVMaze/OpenLibrary/Jikan。

## 方案选择

采用“AI 搜索发现 + 公开网页文本抽取 + SQLite 缓存”的收敛方案。

相比只调整默认源，收敛方案能彻底去掉平台 API 回退，满足目标。相比全链路重写，它复用现有入库、缓存、分页、推荐和自动刷新能力，改动范围更小，符合 KISS/YAGNI。

## 后端设计

### AI 发现服务

`aiDiscoveryService` 负责调用 OpenAI Chat Completions 兼容接口 `/chat/completions`。Prompt 明确要求：

- 使用 web search 发现真实热门内容。
- 返回严格 JSON。
- 返回 `title`、`summary`、`tags`、`actors`、`author`、`ipName`、`status`、`hotScore`、`sourceUrl`、`releaseDate`。
- 不返回 `cover`，不要求图片。

服务会对模型输出做 JSON 解析、字段清洗、去重和 `normalizeContent`。内部 `cover` 使用空值或默认占位以兼容数据库，但响应层会剔除该字段。

### 公开网页补充抽取

新增轻量网页文本抓取能力，仅用于 AI 返回的 `sourceUrl`：

- 只接受 `http` 和 `https` URL。
- 设置超时、最大响应体大小和文本长度上限。
- 去除 HTML 标签、脚本和样式，保留标题与主体文本片段。
- 抓取失败不导致整页刷新失败，只记录为该条目的补充缺失。

当抓到有效文本时，再调用现有 AI 结构化能力或在发现 prompt 中纳入文本摘要，补充 summary/tags/status 等字段。该能力不调用专用平台 API，只读取公开网页。

### 入库刷新

`ingestionService` 的来源统一为 `ai_search`：

- `sourceForType(type)` 对所有类型返回 `ai_search`。
- backfill 的 `pageCount/pageSize/sortModes/incremental` 继续复用。
- 每个分页调用 AI 搜索发现。
- `source_runs` 和 ingestion cursor 记录来源为 `ai_search`。

这样保留现有手动刷新和自动刷新路径，不引入第二套调度系统。

### 目录查询

`catalogService` 收敛为：

- `fetchListByType` 只调用 `searchTrendingContentsWithAi`，不再按类型路由到 TVMaze/OpenLibrary/Jikan。
- `listContents` 仍优先读 SQLite；缓存为空时触发 AI 入库。
- `getContentById` 优先读 SQLite；未命中时返回内容不存在或数据尚未入库，不再根据外部平台 ID 实时请求详情。
- 相关内容和相似内容继续通过本地缓存与 AI 搜索关键词获取。

平台 API 映射函数、平台 base URL、平台详情函数和平台 ID 解析分支应删除或停止导出，避免死代码。

### 来源路由

`sourceStrategyService` 不再暴露多源链路：

- 每个类型支持源固定为 `['ai_search']`。
- 默认链路、有效链路均为 `['ai_search']`。
- 后台 API 对源路由写入可保留兼容，但只接受 `ai_search`；也可以在前端移除对应操作。

推荐前端移除源路由操作区，避免用户误以为仍支持平台源。

### 响应去图

`contentResponseService` 改为默认剔除 `cover`：

- API 响应不返回 `cover`。
- 保留环境变量反向开关不是必要项；若保留，应默认隐藏。
- 列表、详情、相关推荐、相似推荐和用户历史中的嵌套内容都应统一处理。

## 前端设计

前端保持无图卡片体验：

- `ContentCard` 和 `RelatedCard` 使用现有占位媒体图形，不读取 `content.cover`。
- `Detail` 使用现有详情占位图形，不读取 `content.cover`。
- `Content` 类型保留 `cover?: string` 兼容旧响应，但 UI 不依赖该字段。
- 后台管理移除或弱化“源路由”配置，仅保留 AI 配置、系统设置、手动刷新和来源运行状态。

## 自动刷新

使用现有 `startDailyAutoRefresh`：

- 默认 `MEDIAHUB_AUTO_REFRESH_ENABLED=true`。
- 默认 `MEDIAHUB_AUTO_REFRESH_ON_STARTUP=true`。
- 启动后立即刷新 `drama/novel/comic/anime`。
- 每天按 `MEDIAHUB_AUTO_REFRESH_HOUR` 和 `MEDIAHUB_AUTO_REFRESH_MINUTE` 再刷新。
- 刷新时继续使用 backfill 配置，默认抓取 hot/latest 多页以提高覆盖。

并发刷新不做扩展，保持串行执行，降低 AI 接口限流风险。

## 错误处理

- AI 未启用或缺少 API Key：返回明确的 `upstream_unavailable`，后台展示配置错误。
- AI 输出非 JSON：返回“AI 搜索未返回可解析结果”。
- AI 返回空数组：返回“AI 搜索结果为空”。
- 公开网页抓取失败：单条降级，不阻断整批入库。
- 自动刷新单类型失败：记录失败并继续刷新其他类型。

## 测试策略

- 后端单元测试：
  - AI 搜索 prompt 不包含 `cover` 要求。
  - `sourceForType` 对四类均返回 `ai_search`。
  - `fetchListByType` 不调用平台 API 分支。
  - 响应层默认剔除 `cover`。
  - 自动刷新启动即执行并调度下一次每日刷新。
- 后端契约测试：
  - `/api/contents`、`/api/contents/:id`、`/api/recommendations` 响应不含 `cover`。
  - `/api/sources/status` 来源显示 `ai_search`。
- 前端验证：
  - lint/build 通过。
  - 首页、详情页无图片依赖。
  - 后台不再展示可切换平台源。

## 兼容性与迁移

不迁移现有数据库。旧平台来源数据仍可能存在于 SQLite 中，但后续刷新只写入 `ai_search` 来源数据。列表查询按类型和排序读取缓存，若需要彻底清理旧数据，应作为独立维护任务处理，避免本次范围扩大。

## 原则应用

- KISS：复用现有缓存、入库和调度链路，只替换数据来源。
- YAGNI：不做 schema 删除、不引入 AI 多供应商抽象、不新增图片逻辑。
- DRY：AI 发现统一入口，避免每个类型维护独立平台适配器。
- SOLID：AI 发现、网页文本抓取、入库调度、响应塑形保持职责分离。
