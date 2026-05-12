# MediaHub

MediaHub 是一个聚合短剧、小说、漫画、动漫内容的全栈示例项目，前端负责浏览与用户交互，后端负责内容聚合、缓存、用户状态与来源刷新。

## 技术栈

- 前端：`React 19`、`TypeScript`、`Vite 8`、`Tailwind CSS 4`
- 后端：`Node.js 22`、`Express 4`、`node:sqlite`
- 测试与校验：`node:test`、`ESLint`

## 目录结构

- `frontend/`：前端应用
- `backend/`：后端 API、SQLite 仓储与聚合服务
- `docs/superpowers/specs/`：设计文档
- `docs/superpowers/plans/`：实施计划
- `docs/superpowers/audits/`：审计与回归记录
- `需求文档_MediaHub.md`：原始需求说明
- `技术方案_MediaHub.md`：原始技术方案

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 启动前后端

```bash
npm run dev
```

默认端口：

- 前端：`http://127.0.0.1:5173` 或 Vite 自动分配端口
- 后端：`http://127.0.0.1:3001`

### 3. 单独启动

```bash
npm run dev:backend
npm run dev:frontend
```

## 常用命令

```bash
npm test --workspace=backend
npm run lint --workspace=frontend
npm run build --workspace=frontend
npm run start
```

## 数据与缓存

- 默认 SQLite 文件：`data/mediahub.sqlite`
- 可通过 `MEDIAHUB_DB_PATH` 覆盖数据库路径
- 当公开上游不可用时，后端会优先返回本地缓存并标记 `stale`

## 当前稳定性状态

截至 `2026-05-12`，已完成一轮针对前后端与浏览器主流程的稳定性审计，重点结果如下：

- 后端已拆分为可测试的 `app factory`，支持进程内 HTTP 契约测试
- 后端关键契约已覆盖：健康检查、分类、登录/登出、`/me`、历史鉴权、内容列表/详情缓存回退、来源状态
- 前端已修复详情页响应式横向溢出问题
- 已完成移动端主流程回归：搜索、清除、分类切换、来源刷新、未登录拦截、注册、标记已看、收藏、个人中心校验、退出登录

详细记录见 `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`

## 已知限制

- 公开上游依赖（`TVMaze`、`Jikan`、`Open Library`）在当前环境下可能超时或返回错误
- 当前项目的稳定性主要依赖本地缓存兜底；无缓存时前端会展示错误态
- `node:sqlite` 仍带有实验性提示，推荐使用 Node.js 22 运行

## 本次补强内容

- `backend/src/app.js`：新增后端应用工厂，解耦应用创建与监听
- `backend/test/httpRoutes.test.js`：新增并补强后端契约测试
- `frontend/src/components/Header.tsx`：收敛顶部响应式布局
- `frontend/src/pages/Profile.tsx`：修正移动端登录卡片宽度约束
- `frontend/src/pages/Detail.tsx`：修正背景层与封面徽标导致的页面级横向溢出
- `docs/superpowers/audits/2026-05-12-mediahub-stability-audit.md`：补充审计与回归证据

## 后续建议

- 为前端主流程补充可重复执行的 E2E 自动化
- 为上游聚合层增加更细粒度的熔断、重试与观测信息
- 为来源刷新与缓存状态增加更明确的用户提示
- 清理历史临时文件与非核心产物前，先做一次明确范围确认
