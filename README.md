# MediaHub

热门内容推荐平台，面向短剧、小说、漫画、动漫四大模块，支持本地 + AI 搜索、专题聚合、个性化推荐和后台质量管理。

## 环境要求

- Node.js 22.x–25.x（推荐 22 LTS）
- npm 10+

## 快速开始

```bash
npm ci
cp .env.example .env   # 编辑 .env 填入 AI API Key 等配置
npm run dev
```

默认地址：
- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动前后端开发服务器 |
| `npm run build` | 构建前端生产包 |
| `npm run start` | 生产模式启动后端 |
| `npm run test:backend` | 运行后端测试 |
| `npm run test:frontend` | 运行前端测试 |

## 项目结构

```
backend/
  src/
    routes/        HTTP 路由层
    services/      业务编排、AI 搜索、推荐、榜单、系统设置
    repositories/  SQLite 数据访问
    db/            数据库初始化和迁移
    middleware/     错误处理、后台认证、登录限速
    utils/         请求上下文、配置校验、通用工具
frontend/
  src/
    api/           请求层（client + 各模块 API）
    components/    通用 UI 组件
    hooks/         共享 React Hook
    pages/         页面组件（含 admin 子目录）
    types/         TypeScript 类型定义
scripts/           启动脚本（.env 加载 + 进程管理）
```

## 前端页面

| 路径 | 功能 |
|------|------|
| `/drama` `/novel` `/comic` `/anime` | 分类浏览 |
| `/detail/:id` | 内容详情 |
| `/topics/:field/:value` | 主演/角色/作者/IP 专题 |
| `/compare` | 内容对比 |
| `/me` | 我的空间（已看、收藏、追更） |
| `/admin` | 后台管理 |

## 环境变量

核心配置见 `.env.example`，关键项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MEDIAHUB_AI_ENABLED` | 启用 AI 搜索 | `false` |
| `MEDIAHUB_AI_MODEL` | AI 模型名称 | — |
| `MEDIAHUB_AI_BASE_URL` | AI API 地址 | — |
| `MEDIAHUB_AI_API_KEY` | AI API 密钥 | — |
| `MEDIAHUB_AI_REQUEST_TIMEOUT_MS` | AI 模型请求超时 | `90000` (90s) |
| `MEDIAHUB_INTERACTIVE_AI_SEARCH_TIMEOUT_MS` | 交互式搜索超时 | `30000` (30s) |
| `CACHE_TTL_MS` | 内容缓存有效期 | `180000` (3min) |

## 生产部署

`NODE_ENV=production` 时后端会强制校验：

```bash
MEDIAHUB_ADMIN_PASSWORD=替换为至少12位的强密码
MEDIAHUB_COOKIE_SECURE=true
MEDIAHUB_FRONTEND_URL=https://你的前端域名
```

## 安全注意事项

- `.env` 已在 `.gitignore` 中排除，切勿提交
- 默认管理员密码 `MediaHub@2026` 仅限开发环境
- 后台登录 IP 限速 5 次/5 分钟
- 用户注册 IP 限速 10 次/5 分钟
- Cookie 设置 `httpOnly` + `sameSite=lax`，生产环境启用 `secure`
- 系统设置写入 `.env` 时有白名单校验
- AI 搜索内容 ID 经过格式校验，SQL 查询均使用参数化
