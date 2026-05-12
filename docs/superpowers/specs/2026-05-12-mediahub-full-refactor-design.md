# MediaHub 全面重构设计

日期：2026-05-12

## 目标

本轮选择全面重构 UI 和架构，但必须保留可运行闭环。目标按优先级排序：

1. 跑通真实公开 API 内容闭环。
2. 允许 SQLite 作为真实 API 结果缓存，禁止本地假数据和本地模型。
3. 收敛后端状态边界，减少内存 store 与 SQLite 的重复职责。
4. 重构前端信息架构，让首页、详情、个人中心更简洁、稳定、易操作。
5. 使用浏览器逐项验证关键功能按钮和布局。

## 非目标

- 不实现在线播放、阅读器、下载、BT、媒体库扫描。
- 不引入本地模型或本地假数据兜底。
- 不接入生产私有 API 或需要敏感凭证的服务。
- 不做完整账号体系、支付、后台管理和复杂推荐模型。
- 不引入重型状态管理或大型 UI 组件库。

## 外部借鉴

综合媒体发现类项目和公开 API 项目的共性，本轮吸收以下模式：

- 发现流优先：分类、搜索、排序、推荐放在同一主路径。
- 清单闭环：已看、收藏、历史和推荐理由形成最小用户价值闭环。
- 来源透明：每条内容展示来源和更新时间。
- 缓存可见：缓存不是假数据，必须明确标记 stale 状态。
- 布局克制：减少装饰型区域，突出搜索、分类、内容卡和主要操作。

## 数据来源

继续使用免密公开 API：

- TVMaze：短剧/剧集内容。
- Open Library：小说和漫画/图书内容。
- Jikan：动漫内容。

后续可选 AniList 或 TMDB，但本轮不新增，避免扩大风险。

## 后端架构

### 模块边界

- `database.js`：SQLite 连接、建表、测试注入。
- `contentRepository.js`：真实内容缓存的 upsert、查询、详情、搜索。
- `sourceRepository.js`：刷新运行记录和来源状态。
- `userRepository.js`：用户、观看历史、收藏持久化。
- `catalogService.js`：实时公开 API 聚合；失败时读取真实缓存。
- `ingestionService.js`：手动刷新 orchestration，记录 source run。
- `recommendationService.js`：基于 SQLite 用户行为和真实内容快照推荐。
- `userService.js`：轻量用户行为 API，依赖 repository，不持有内存状态。
- `store.js`：只保留静态分类常量；移除用户和内容快照内存职责。

### API

- `GET /api/health`
- `GET /api/categories`
- `GET /api/contents?type=&page=&limit=&sort=&keyword=`
- `GET /api/contents/:id`
- `GET /api/recommendations/for-you?type=&limit=`
- `POST /api/users/register`
- `POST /api/users/logout`
- `GET /api/users/me`
- `POST /api/users/history`
- `GET /api/users/history`
- `POST /api/users/favorite`
- `GET /api/users/favorites`
- `GET /api/sources/status`
- `POST /api/ingestion/refresh?type=`

### 错误与缓存语义

- 实时 API 成功：返回 `stale: false`，写入 SQLite。
- 实时 API 失败且存在缓存：返回真实缓存，`stale: true`。
- 实时 API 失败且无缓存：返回稳定错误，不生成内容。
- 手动刷新成功：写入内容和 source run success。
- 手动刷新失败：写入 source run failed，并返回稳定错误。

## 前端架构

### 信息架构

首页改为三段：

1. 顶部操作区：品牌、个人中心、搜索。
2. 内容控制区：分类、排序、来源状态、刷新、缓存提示。
3. 内容区：推荐流和结果网格，空/错/加载状态统一。

详情页改为两段：

1. 内容主信息：封面、标题、元信息、来源、主操作按钮。
2. 关联内容：同 IP 和相似推荐，缺失时隐藏。

个人中心改为三段：

1. 登录/用户卡。
2. 统计概览。
3. 已看/收藏清单。

### 组件拆分

- `SourceStatusBar`：来源状态、刷新按钮、缓存提示。
- `ContentGrid`：统一内容网格、骨架、空状态。
- `PageShell` 或现有 Header 精简：减少重复 sticky header 实现。
- `ContentCard`：移动端操作按钮降噪，保留收藏/已看。
- `ApiState`：继续作为统一错误/空状态组件。

## 浏览器验证清单

桌面端：

- 首页加载。
- 四个分类切换。
- 热度/最新排序。
- 搜索和清除。
- 加载更多。
- 来源状态显示。
- 手动刷新。
- 卡片进入详情。
- 登录。
- 标记已看。
- 收藏/取消收藏。
- 个人中心历史和收藏。

移动端：

- 首页顶部不拥挤。
- 搜索框可点击输入。
- 分类横向滚动清晰。
- 卡片按钮不遮挡标题。
- 详情页主操作按钮可触达。
- 个人中心 tab 和内容网格可读。

## 验收标准

- 后端 `npm test --workspace=backend` 通过。
- 前端 `npm run lint --workspace=frontend` 通过。
- 前端 `npm run build --workspace=frontend` 通过。
- `POST /api/ingestion/refresh?type=anime` 可刷新真实 API 数据。
- `/api/sources/status` 返回最新来源状态。
- 项目重启后用户历史和收藏不丢。
- 浏览器逐项验证主流程按钮可用。
- UI 不展示任何本地假数据或本地模型结果。

## 工程原则

- KISS：不新增复杂依赖和后台系统。
- YAGNI：只实现当前闭环需要的模块。
- DRY：统一 API 状态、内容网格、来源状态和 repository 边界。
- SOLID：API 聚合、缓存、用户行为、推荐、UI 展示各自单一职责。
