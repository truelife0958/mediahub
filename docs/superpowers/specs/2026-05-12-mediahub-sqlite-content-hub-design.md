# MediaHub SQLite 轻量内容中台设计

日期：2026-05-12

## 目标

第二轮在第一轮“公开 API + AI 增强 + 无假数据”基础上，加入 SQLite 轻量内容中台能力：

- 持久化真实内容、来源状态、采集记录和用户行为快照。
- 上游 API 超时或不可用时，允许返回 SQLite 中已缓存的真实数据，并标记 `stale: true`。
- 不生成、不展示、不写入任何本地假数据。
- 提供手动刷新接口，按分类触发公开 API 采集并写入 SQLite。
- 前端展示数据源状态、缓存时间、刷新按钮和缓存提示。

## 非目标

本轮不实现：

- 后台管理系统。
- 定时任务、队列、并发采集调度。
- 复杂爬虫框架或绕过反爬机制。
- 多用户认证体系。
- 外部数据库服务。

## 技术选择

使用 Node.js 22 的 `node:sqlite` 内置模块，不新增 npm 数据库依赖。

权衡：

- 优点：依赖最少，部署简单，符合 KISS。
- 缺点：`node:sqlite` 当前带实验性 warning；若未来运行环境不支持，需要替换为 `better-sqlite3` 或 `sqlite`。

## 后端架构

### 模块

- `database.js`：负责 SQLite 连接、建表、事务、测试库注入。
- `contentRepository.js`：负责内容 upsert、列表查询、详情查询、搜索和 stale 标记。
- `sourceRepository.js`：负责数据源运行记录、最新状态、错误信息。
- `userRepository.js`：负责轻量用户、观看历史、收藏持久化。
- `ingestionService.js`：按类型调用公开 API，归一化后写入 SQLite。
- `catalogService.js`：优先实时 API；失败时回退到 SQLite 真实缓存。
- `sourceRoutes.js`：暴露来源状态。
- `ingestionRoutes.js`：暴露手动刷新接口。

### 数据表

`contents`：

- `id TEXT PRIMARY KEY`
- `type TEXT NOT NULL`
- `title TEXT NOT NULL`
- `cover TEXT NOT NULL`
- `summary TEXT NOT NULL`
- `author TEXT`
- `ip_name TEXT`
- `status TEXT`
- `hot_score INTEGER`
- `tags_json TEXT NOT NULL`
- `actors_json TEXT NOT NULL`
- `source_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `cached_at TEXT NOT NULL`

`source_runs`：

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `type TEXT NOT NULL`
- `source TEXT NOT NULL`
- `status TEXT NOT NULL`
- `count INTEGER NOT NULL`
- `error TEXT`
- `started_at TEXT NOT NULL`
- `finished_at TEXT NOT NULL`

`users`：

- `id TEXT PRIMARY KEY`
- `username TEXT UNIQUE NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

`watch_history`：

- `user_id TEXT NOT NULL`
- `content_id TEXT NOT NULL`
- `watched_at TEXT NOT NULL`
- `PRIMARY KEY (user_id, content_id)`

`favorites`：

- `user_id TEXT NOT NULL`
- `content_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `PRIMARY KEY (user_id, content_id)`

## 数据流

### 列表查询

1. 前端请求 `/api/contents?type=anime`。
2. 后端尝试实时公开 API。
3. 成功：归一化、写入 SQLite、返回 `stale: false`。
4. 失败：查询 SQLite 中该分类真实缓存。
5. 有缓存：返回缓存列表和 `stale: true`。
6. 无缓存：返回稳定错误，不生成假数据。

### 手动刷新

1. 前端点击刷新按钮。
2. 请求 `POST /api/ingestion/refresh?type=anime`。
3. 后端调用公开 API，归一化并 upsert SQLite。
4. 写入 `source_runs` 成功或失败记录。
5. 前端重新拉取内容和来源状态。

### 来源状态

1. 前端请求 `/api/sources/status`。
2. 后端按 type/source 返回最近一次成功/失败、count、error、finishedAt。
3. 首页展示“实时/缓存/失败”状态。

### 用户行为

1. 登录/注册写入 `users`。
2. 已看写入 `watch_history`。
3. 收藏写入 `favorites`。
4. 个人中心从 SQLite 读取，重启后不丢。

## 前端设计

### 首页状态条

显示：

- 当前分类来源状态。
- 最近刷新时间。
- 当前是否使用缓存。
- 手动刷新按钮。

### 内容状态

- `stale: false`：正常显示。
- `stale: true`：显示缓存提示，但仍可浏览真实内容。
- 无缓存 + 上游失败：显示错误和重试/刷新入口。

### 个人中心

- 现有 UI 不大改。
- 数据来源改为 SQLite 后端持久化。
- 保持轻量登录方式。

## 错误处理

- `upstream_unavailable`：上游不可用，无缓存时展示错误。
- `upstream_rate_limited`：上游限流，有缓存则展示缓存提示。
- `invalid_request`：非法类型或参数。
- `internal_error`：数据库或未分类错误。

## 测试策略

### 后端测试

- SQLite 初始化建表。
- 内容 upsert + 查询。
- source run 写入 + 状态读取。
- ingestion 成功写缓存。
- 上游失败时读缓存。
- 无缓存时仍返回错误。
- 用户注册、历史、收藏持久化。

### 前端验证

- 首页状态条显示。
- 刷新按钮触发接口。
- stale 缓存提示显示。
- 个人中心重启后数据仍在。
- Chrome headless 验证关键 DOM。

## 验收标准

- `backend/data/mediahub.sqlite` 能自动创建。
- API 成功后内容写入 SQLite。
- 上游失败且有缓存时返回真实缓存内容，不报空。
- 上游失败且无缓存时返回错误，不返回假数据。
- `/api/sources/status` 返回来源状态。
- `POST /api/ingestion/refresh?type=...` 可手动刷新。
- 用户历史和收藏重启后不丢。
- 后端测试、前端 lint、生产 build 通过。
