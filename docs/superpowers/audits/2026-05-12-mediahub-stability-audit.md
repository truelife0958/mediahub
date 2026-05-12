# MediaHub 稳定性审计记录

日期：2026-05-12

## 1. 基线命令

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm test --workspace=backend` | 通过 | 当前为 `11/11` 通过，包含新增 `httpRoutes.test.js` |
| `npm run lint --workspace=frontend` | 通过 | 无输出，退出码 `0` |
| `npm run build --workspace=frontend` | 通过 | Vite 生产构建完成，输出 `dist/` 资源 |

## 2. 后端问题

| 编号 | 优先级 | 接口 | 复现步骤 | 期望 | 实际 | 根因 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 3. 前端问题

| 编号 | 优先级 | 端别 | 页面/组件 | 复现步骤 | 期望 | 实际 | 根因 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-001 | P1 | 移动端 / 桌面端 | `Detail` | 通过 CDP 分别打开 `http://127.0.0.1:5179/detail/drama:tvmaze:101` 的 `390x844` 与 `1440x1200` 视口，检查 `document.documentElement.scrollWidth` 与截图 | 页面不应出现页面级横向裁切或横向滚动条，封面徽标与背景层不应把文档宽度撑大 | 修复前移动端内容态 `scrollWidth=406 > clientWidth=390`，桌面端 `scrollWidth=1491 > clientWidth=1434` | 详情页封面外层在纵向布局时被拉伸为整行宽度，右下角分类徽标用负偏移撑大滚动宽度；背景模糊层 `transform: scale(1.08)` 直接作用在文档流可见区域，放大后把文档宽度推大 | 已修复 |

## 4. 外部依赖风险

| 编号 | 依赖 | 触发条件 | 项目侧兜底 | 状态 |
| --- | --- | --- | --- | --- |
| X-001 | TVMaze / Jikan / Open Library | 当前本地环境访问公开上游时频繁超时，`/api/contents` 与推荐接口会返回 `2002 upstream_unavailable` | 后端会返回稳定错误；当本地缓存存在时，内容列表/详情可回退为 `stale` 数据；前端能展示来源异常和错误态 | 已记录 |

## 5. 回归记录

| 修复项 | 验证命令/路径 | 结果 |
| --- | --- | --- |
| `Task 1` 后端可测化 | `npm test --workspace=backend -- test/httpRoutes.test.js` | 通过 |
| `Task 2` 后端契约覆盖 | `npm test --workspace=backend -- test/httpRoutes.test.js` | 通过 |
| `Task 2` 全量后端回归 | `npm test --workspace=backend` | 通过 |
| `F-001` 前端静态回归 | `npm run lint --workspace=frontend` | 通过 |
| `F-001` 前端构建回归 | `npm run build --workspace=frontend` | 通过 |
| `F-001` 首页移动端浏览器回归 | CDP `390x844` 打开 `http://127.0.0.1:5179/`，`doc.clientWidth=390`，`doc.scrollWidth=390` | 通过 |
| `F-001` 个人中心移动端浏览器回归 | CDP `390x844` 打开 `http://127.0.0.1:5179/profile`，`doc.clientWidth=390`，`doc.scrollWidth=390` | 通过 |
| `F-001` 详情页移动端浏览器回归 | CDP `390x844` 打开 `http://127.0.0.1:5179/detail/drama:tvmaze:101`，`doc.clientWidth=390`，`doc.scrollWidth=390` | 通过 |
| `F-001` 详情页桌面端浏览器回归 | CDP `1440x1200` 打开 `http://127.0.0.1:5179/detail/drama:tvmaze:101`，`doc.clientWidth=1440`，`doc.scrollWidth=1440` | 通过 |
| `Home` 移动端搜索/清除/分类 | CDP 移动端依次执行搜索 `Good Wife`、点击 `清除`、切换 `动漫` 分类 | 通过 |
| `Home` 来源刷新失败兜底 | CDP 移动端点击 `刷新来源`，确认按钮从 `刷新中...` 恢复为 `刷新来源`，缓存内容仍保留 | 通过 |
| `Detail` 未登录动作兜底 | CDP 移动端详情页点击 `标记已看`，确认显示 `请先登录` Toast | 通过 |
| `Profile` 登录与持久化 | CDP 移动端完成注册、返回详情页执行 `标记已看` 与 `收藏`、回到个人中心核对计数 `1/1/0/1` | 通过 |
| `Profile` 退出登录 | CDP 移动端点击 `退出`，确认重新回到登录表单 | 通过 |
