# MediaHub

## 最小可运行

### 环境要求
- Node.js 22+
- npm 10+

### 安装
```bash
npm install
```

### 启动（前后端一起）
```bash
npm run dev
```

默认地址：
- 前端：`http://127.0.0.1:5173`（或 Vite 自动分配端口）
- 后端：`http://127.0.0.1:3001`

### 常用命令
```bash
# 后端测试
npm run test --workspace=backend

# 前端静态检查
npm run lint --workspace=frontend

# 前端构建
npm run build --workspace=frontend

# 根构建（当前等价于 frontend build）
npm run build

# 一次性迁移：删除历史库中的 platform_sources 表
npm run db:migrate:drop-platform-sources
```

---

## 当前架构

### 目录
- `backend/`：Express API + SQLite 持久化 + 聚合/刷新服务
- `frontend/`：React + TypeScript + Vite 单页应用

### 后端分层（`backend/src`）
- `routes/`：HTTP 路由层（contents/recommendations/users/categories/sources/ingestion/system）
- `services/`：业务层（目录聚合、平台采集、AI 排序、自动刷新、用户态等）
- `repositories/`：数据访问层（内容、用户、来源、AI 配置、平台配置）
- `db/`：数据库初始化
- `middleware/`、`utils/`：错误处理、请求上下文、重试与游标工具

### 前端结构（`frontend/src`）
- `pages/`：`Home`、`Detail`、`Admin`
- `api/`：统一后端 API 调用
- `components/`：内容卡片、搜索、状态与反馈组件
- `types/`、`constants/`：类型与常量

### 关键运行链路
1. 前端只调用 `/api/*`。
2. 后端优先走平台来源（启用时），失败回退公开来源。
3. 内容统一归一化后入库，并提供列表/详情/推荐查询。
4. 启动后自动调度每日刷新任务。

---

## 已修复问题

本轮已完成：
- 执行激进清理（删除非运行必需内容）：
  - 已删除：`docs/`、`backend/backend.log`、`frontend/node_modules/.vite`
  - 已清空但目录不可移除（挂载占用）：`.agents/`、`.codex/`
  - `backend/data/` 已尝试删除，但被运行进程自动重建（SQLite 文件）
- 完成回归验证：
  - `npm run test --workspace=backend`：15/15 通过
  - `npm run lint --workspace=frontend`：通过
  - `npm run build --workspace=frontend`：通过
  - `npm run build`：通过

---

## 后续优化建议

1. 把 `backend/data` 改为可配置外置路径，并在开发脚本中区分“临时数据”与“持久数据”。
2. 增加 `clean` 脚本（仅删缓存/构建产物），避免人工 `rm -rf`。
3. 将 `frontend lint/build` 与 `backend test` 接入 CI，阻断未通过构建的提交。
4. 为平台采集链路增加端到端冒烟测试（最小样本 + 超时/回退断言）。
5. 按模块继续收敛 `services` 体积，避免单文件职责膨胀。
