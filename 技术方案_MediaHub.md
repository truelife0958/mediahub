# 热门内容推荐平台（MediaHub）- 技术方案

## 1. 技术方案概述

本方案为 MediaHub 热门内容推荐平台提供完整的技术架构设计，采用前后分离的 SPA 架构，后端提供 RESTful API，前端负责页面渲染与用户交互。

**核心技术栈**：Node.js + Express + MongoDB + React

---

## 2. 技术选型

| 层级 | 技术选型 | 理由 | 备选方案 |
|------|----------|------|----------|
| 前端框架 | React 18 + Vite | 生态成熟，热度高，开发效率高 | Vue 3 |
| 前端状态管理 | Zustand | 轻量、简洁，适合中小型项目 | Redux Toolkit |
| UI 组件库 | Tailwind CSS + shadcn/ui | 高度可定制，设计一致性好 | Ant Design |
| 后端框架 | Node.js + Express | 轻量灵活，学习成本低 | NestJS |
| 数据库 | MongoDB | 文档模型灵活，适合内容数据结构 | PostgreSQL |
| ORM/ODM | Mongoose | MongoDB 官方推荐，生态成熟 | - |
| 认证（可选） | JWT | 无状态认证，适合分布式 | Session |

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      客户端 (Browser)                     │
│                   React SPA Application                  │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/REST
┌─────────────────────▼───────────────────────────────────┐
│                      API Gateway                         │
│                   (Express Server)                       │
├─────────────┬───────────────────────┬───────────────────┤
│  Content    │    Recommendation     │      User         │
│  Service    │      Service          │     Service       │
├─────────────┴───────────────────────┴───────────────────┤
│                      Data Layer                          │
│                    (MongoDB + Mongoose)                  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 分层职责

| 层级 | 职责 | 模块 |
|------|------|------|
| **表现层** | 页面渲染、用户交互、状态管理 | React Components, Zustand Store |
| **业务层** | 业务逻辑处理、数据聚合、推荐算法 | Express Routes + Services |
| **数据层** | 数据持久化、查询优化 | MongoDB Collections |

---

## 4. 模块划分

| 模块 | 职责 | 暴露接口 |
|------|------|----------|
| **ContentModule** | 内容管理（CRUD、搜索、筛选） | `/api/contents` |
| **RecommendationModule** | 推荐逻辑、关联分析 | `/api/recommendations` |
| **UserModule** | 用户管理、观看历史、收藏 | `/api/users` |
| **CategoryModule** | 分类管理、Tab 配置 | `/api/categories` |

---

## 5. 接口设计

### 5.1 内容模块 `/api/contents`

#### GET `/api/contents`
获取内容列表

**Query Parameters:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | `drama`/`novel`/`comic`/`anime` |
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页条数，默认 20 |
| sort | string | 否 | `hot`/`latest`，默认 `hot` |
| keyword | string | 否 | 搜索关键词 |

**Response:**
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "string",
        "title": "string",
        "cover": "string",
        "summary": "string",
        "type": "drama",
        "hotScore": 1000,
        "tags": ["string"],
        "actors": ["string"],
        "createdAt": "ISO8601"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100
    }
  }
}
```

#### GET `/api/contents/:id`
获取内容详情

**Response:**
```json
{
  "code": 0,
  "data": {
    "id": "string",
    "title": "string",
    "cover": "string",
    "summary": "string",
    "type": "drama",
    "hotScore": 1000,
    "tags": ["string"],
    "actors": ["string"],
    "author": "string",
    "status": "ongoing",
    "relatedContents": [],
    "similarContents": []
  }
}
```

### 5.2 推荐模块 `/api/recommendations`

#### GET `/api/recommendations/for-you`
获取个性化推荐

**Headers:**
| 参数 | 说明 |
|------|------|
| X-User-Id | 用户 ID（可选，未登录返回默认推荐） |

**Query Parameters:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 筛选类型 |
| limit | number | 否 | 返回条数，默认 10 |

**Response:**
```json
{
  "code": 0,
  "data": [
    {
      "id": "string",
      "title": "string",
      "cover": "string",
      "reason": "同演员：张三",
      "type": "drama"
    }
  ]
}
```

### 5.3 用户模块 `/api/users`

#### POST `/api/users/history`
标记已看

**Request Body:**
```json
{
  "userId": "string",
  "contentId": "string"
}
```

#### GET `/api/users/:userId/history`
获取观看历史

### 5.4 错误码规范

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 资源不存在 |
| 2001 | 服务器内部错误 |

---

## 6. 数据模型

### 6.1 Content（内容）

```javascript
{
  _id: ObjectId,
  title: String,           // 标题
  cover: String,           // 封面URL
  summary: String,         // 简介
  type: String,            // drama | novel | comic | anime
  tags: [String],         // 标签
  actors: [String],       // 演员/声优
  author: String,          // 作者
  ipName: String,          // IP名称（用于关联同一IP的不同形式）
  status: String,          // ongoing | completed
  hotScore: Number,        // 热度分
  createdAt: Date,
  updatedAt: Date
}
```

### 6.2 User（用户）

```javascript
{
  _id: ObjectId,
  username: String,
  watchHistory: [{
    contentId: ObjectId,
    watchedAt: Date
  }],
  favorites: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

### 6.3 索引设计

| Collection | 索引字段 | 类型 | 用途 |
|------------|----------|------|------|
| contents | type | 普通 | 按类型筛选 |
| contents | hotScore | 普通 | 热度排序 |
| contents | title, actors | 文本 | 全文搜索 |
| contents | ipName | 普通 | 关联推荐 |
| users | watchHistory.contentId | 普通 | 查询历史 |

---

## 7. 关键设计决策

| 序号 | 决策 | 理由 | 权衡 |
|------|------|------|------|
| 1 | MongoDB 替代关系型数据库 | 内容数据半结构化，IP 关联可能扩展字段 | 事务能力弱，但中小规模足够 |
| 2 | 后端生成模拟数据 | 无真实数据源，需 Demo 演示 | 数据真实性有限，后续可对接 API |
| 3 | 无复杂 ML 推荐 | 数据量小，规则推荐足够 | 效果不如算法，但实现简单可控 |
| 4 | JWT 可选 | MVP 阶段可用本地存储替代 | 长期需登录体系，可平滑升级 |

---

## 8. 实现计划

### Phase 1：基础框架搭建
- [ ] 初始化前端项目（Vite + React + TypeScript）
- [ ] 初始化后端项目（Express + MongoDB）
- [ ] 配置 Tailwind CSS
- [ ] 实现数据模型与种子数据生成

### Phase 2：核心功能
- [ ] 内容列表页（Tab 切换）
- [ ] 内容详情页
- [ ] 搜索功能（主演/IP/角色）
- [ ] 标记已看功能

### Phase 3：推荐与关联
- [ ] 关联推荐逻辑
- [ ] 为你推荐功能
- [ ] 个人中心（历史记录）

### Phase 4：可选功能
- [ ] 用户登录/注册
- [ ] 收藏功能
- [ ] 移动端适配

---

**确认后可进入「代码实现」阶段。**
