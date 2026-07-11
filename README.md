# MediaHub

MediaHub 是面向短剧、小说、动漫、漫画四类内容的 JSON-first 热榜看板。项目以真实公开数据为基础，提供四模块综合看板、模块榜单、作品详情、跨模块搜索、数据采集与管理能力。

## 核心能力

- **四模块榜单**：短剧、小说、动漫、漫画统一展示热度、平台指标、搜索指数、综合分。
- **真实数据采集**：通过公开页面/API 抓取播放量、阅读量、主演/声优、简介、封面、来源证据等字段。
- **JSON-first 数据层**：优先读取 `data/current`、`data/snapshots`、`data/indexes`，降低运行时对数据库的依赖。
- **跨模块搜索**：支持按标题、主演、作者、IP、分类等字段检索。
- **管理后台**：查看 JSON 数据状态、采集日志、数据质量、手动刷新四模块数据。
- **浏览器冒烟测试**：覆盖首页、四模块榜单、详情、搜索、管理员登录等普通用户主流程。

## 环境要求

- Node.js `>=22 <26`
- npm `>=10`
- Windows / macOS / Linux 均可运行；当前开发环境为 Windows + PowerShell。

## 快速开始

```bash
npm ci
cp .env.example .env
npm run dev
```

默认地址：

- 前端：<http://127.0.0.1:5173>
- 后端：<http://127.0.0.1:3001>
- 健康检查：<http://127.0.0.1:3001/api/health>

开发环境管理员默认密码：`MediaHub@2026`。生产环境必须通过 `MEDIAHUB_ADMIN_PASSWORD` 覆盖。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动前端和后端开发服务 |
| `npm run start` | 启动后端服务 |
| `npm run build` | 构建前端生产包 |
| `npm run test:backend` | 运行后端单元/集成测试 |
| `npm run test:frontend` | 运行前端工具和页面结构测试 |
| `npm run test:e2e` | 运行 Playwright 浏览器冒烟测试 |
| `npm run crawl:real` | 抓取真实公开数据并刷新 JSON 热榜数据 |

如需固定采集日期，可在运行前设置：

```powershell
$env:MEDIAHUB_DATASET_NOW='2026-07-10T00:00:00.000+08:00'
npm run crawl:real
```

> **说明**：`npm run dev` 默认不自动采集（`MEDIAHUB_AUTO_REFRESH_ON_STARTUP` 默认为 `false`），避免每次启动都触发真实外部爬虫。需要更新数据时，可在 `/admin` 后台手动点击刷新，或设置环境变量 `MEDIAHUB_AUTO_REFRESH_ON_STARTUP=true` 以恢复启动自动采集；生产环境通过该变量按需覆盖。

如需调整爬虫单请求超时：

```powershell
$env:MEDIAHUB_CRAWL_FETCH_TIMEOUT_MS=15000
npm run crawl:real
```

### 本地调试与提交前清理

```powershell
npm run dev
```

调试地址：

- 前端：<http://127.0.0.1:5173/>
- 后端健康检查：<http://127.0.0.1:3001/api/health>

本地调试可能会产生日志、缓存或浏览器测试产物，请统一放在 `.tmp/`、`tmp/`、`test-results/` 或 `playwright-report/` 下。这些目录已被 `.gitignore` 忽略，不应提交。

如果 `npm run dev` 或后台刷新任务改动了 `data/current/`、`data/indexes/` 或 `data/snapshots/`，提交前必须先确认这是有意更新的真实数据；否则请还原这些调试生成变更。

提交前建议执行：

```powershell
git status --short
git diff --stat
```

## 页面路由

| 路由 | 用途 |
| --- | --- |
| `/dashboard` | 四模块综合数据看板 |
| `/drama` | 短剧榜单与右侧详情联动 |
| `/novel` | 小说榜单与右侧详情联动 |
| `/anime` | 动漫榜单与右侧详情联动 |
| `/comic` | 漫画榜单与右侧详情联动 |
| `/detail/:id` | 作品详情深链 |
| `/search` | 跨模块搜索 |
| `/admin` | 数据采集与运行管理后台 |

## API 概览

| 接口 | 说明 |
| --- | --- |
| `GET /api/health` | 后端健康检查 |
| `GET /api/categories` | 获取四个可见模块 |
| `GET /api/contents?type=drama&page=1&limit=20` | 获取模块榜单 |
| `GET /api/contents/:id` | 获取作品详情 |
| `GET /api/contents/discover/grouped?keyword=非人哉` | 跨模块搜索 |
| `POST /api/admin/login` | 管理员登录 |
| `GET /api/system/json-data-status` | JSON 数据状态，需管理员登录 |
| `POST /api/ingestion/refresh-all` | 手动刷新四模块数据，需管理员登录 |

## 数据目录

```text
data/
  current/        当前线上读取的四模块 JSON 数据
  seeds/          可复用种子数据
  snapshots/      按日期保存的数据快照
  indexes/        搜索与关系索引
  real-casts/     爬虫抓取的公开真实演员/简介/指标原始整理数据
scripts/
  update-real-dataset-catalog.mjs  抓取公开真实数据
  fill-hot-datasets.mjs            将真实目录转换为 current/snapshot/index 数据
```

当前真实指标覆盖口径：

- 短剧：公开页面播放量、主演、简介、封面、热度。
- 动漫：Bilibili 番剧公开接口播放量、追番、弹幕、声优/演员、简介、封面。
- 漫画：腾讯动漫公开热度/阅读量、作者、简介、封面。
- 小说：真实公开书名、作者、分类、简介；起点/番茄阅读量接口存在反爬/签名限制，代码已预留 `readCount` / `readCountWan` 接入口。

## 项目结构

```text
backend/
  src/
    routes/        HTTP 路由
    services/      榜单、采集、数据质量、管理后台服务
    repositories/  SQLite 仓储；JSON-only 模式下主要作为兼容层
    store/         JSON 文件读写、关系索引、热度合并
    utils/         参数校验、错误处理、环境配置
  test/            后端测试
frontend/
  src/
    api/           前端 API Client 和 Hooks
    components/    通用 UI 与 dashboard 组件
    pages/         Dashboard / Home / Detail / Search / Admin 页面
    utils/         指标格式化、关系构建、榜单辅助函数
    types/         TypeScript 类型定义
  e2e/             Playwright 浏览器冒烟测试
scripts/           数据采集、填充、启动辅助脚本
```

## 测试与质量门禁

推荐提交前执行：

```bash
npm run test:backend
npm run test:frontend
npm run build
npm run test:e2e
```

本项目的 E2E 测试会覆盖：

1. 后端健康检查。
2. 四模块榜单 API 返回 100 条级别数据。
3. `/dashboard`、`/drama`、`/novel`、`/anime`、`/comic` 正常渲染。
4. 榜单行点击后右侧详情联动。
5. 详情页深链可访问。
6. 搜索页可检索真实作品。
7. 管理后台可登录并进入数据面板。
8. 移动端 viewport 下看板和四模块榜单可用。
9. 管理后台“一键采集四类内容”UI 流程（E2E 中使用 mock，避免触发真实爬虫）。
10. API 返回异常 code 时界面有可重试错误态，不抛出前端崩溃。
11. 页面无前端异常、无失败 API 响应、无明显错误文案。

首次运行 Playwright 如提示缺少浏览器，请执行：

```bash
npx playwright install chromium
```

## 环境变量

详见 `.env.example`。常用项：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `MEDIAHUB_FRONTEND_URL` | 前端公开地址 / CORS 允许源 | `http://127.0.0.1:5174` |
| `MEDIAHUB_ADMIN_PASSWORD` | 管理员密码 | 开发默认 `MediaHub@2026` |
| `MEDIAHUB_COOKIE_SECURE` | 是否启用安全 Cookie | `false` |
| `MEDIAHUB_JSON_DATASET_ENABLED` | 是否强制使用 JSON 热榜数据 | 自动回退 |
| `CACHE_TTL_MS` | 榜单缓存时间 | `180000` |
| `MEDIAHUB_DATASET_NOW` | 数据生成时间覆盖 | 当前时间 |
| `MEDIAHUB_CRAWL_FETCH_TIMEOUT_MS` | 爬虫单请求超时 | `15000` |
| `MEDIAHUB_CRAWL_FETCH_RETRY` | 爬虫单请求重试次数 | `2` |
| `MEDIAHUB_CRAWL_REQUEST_INTERVAL_MS` | 爬虫全局请求启动间隔（限速） | `120` |
| `MEDIAHUB_E2E_FRONTEND_URL` | E2E 前端地址 | `http://127.0.0.1:5173` |
| `MEDIAHUB_E2E_API_URL` | E2E 后端地址 | `http://127.0.0.1:3001` |

## 代码纯净约定

- 不提交 `.env`、`node_modules`、`frontend/dist`、`test-results`、`playwright-report`、临时截图和本地缓存。
- 不把爬虫调试 HTML、临时日志、浏览器 trace 当作源码提交。
- 新增数据采集源必须保留来源 URL 和采集口径说明。
- 前端不得展示估算播放/阅读量为“真实播放/阅读量”；只有 `realPlayCount` / `realReadCount` 可作为真实指标展示。
- 后端 API 错误应返回统一错误结构，避免页面出现裸异常。
- 调试运行后先执行 `git status --short`，只提交人工确认的源码、文档和有意更新的数据快照。

## 后续优化方向

- 增加小说平台稳定阅读量来源，补齐小说 `realReadCount`。
- 将爬虫任务做成后台队列，增加进度、失败重试和限速策略。
- 为管理后台增加数据差异对比、异常字段修复建议和一键回滚快照。
- 继续扩大 E2E 覆盖：后台异常流、移动端搜索/详情、截图回归。
- 对大 JSON 文件增加增量更新，减少每次采集写全量文件的成本。
