import { createHash } from 'node:crypto';
import { normalizeContent } from './contentNormalizer.js';

const PLATFORM_SOURCES = [
  {
    id: 'baidu-hot',
    label: '百度热搜',
    urls: ['https://top.baidu.com/board?tab=realtime'],
    weight: 1.0,
  },
  {
    id: 'weibo-hot',
    label: '微博热搜',
    urls: ['https://s.weibo.com/top/summary'],
    weight: 1.08,
  },
  {
    id: 'wechat-hot',
    label: '微信指数',
    urls: ['https://weixin.sogou.com/'],
    weight: 0.92,
  },
  {
    id: 'douyin-hot',
    label: '抖音热点',
    urls: ['https://www.douyin.com/hot'],
    weight: 1.12,
  },
];

const TYPE_KEYWORDS = {
  drama: ['短剧', '微短剧', '竖屏剧', '剧'],
  novel: ['小说', '网文', '阅读', '作家'],
};

const TYPE_DEFAULT_TAGS = {
  drama: ['短剧', '热榜'],
  novel: ['小说', '热榜'],
};

const HEAT_BASE_BY_TYPE = {
  drama: 180000,
  novel: 120000,
};

const TITLE_BLOCK_RE = /[\u4e00-\u9fa5A-Za-z0-9《》「」“”·：:，,、!！?？\-]{2,40}/g;

function hashId(seed) {
  return createHash('sha1').update(seed).digest('hex').slice(0, 14);
}

function cleanCandidateTitle(value) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/^[\d#\s.、-]+/, '')
    .replace(/热搜|榜单|更多|登录|搜索|首页|视频|发现/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function isLikelyContentTitle(title, type) {
  const value = cleanCandidateTitle(title);
  if (value.length < 2 || value.length > 28) return false;
  if (/^[0-9A-Za-z]+$/.test(value)) return false;
  const keywords = TYPE_KEYWORDS[type] || [];
  return keywords.some(keyword => value.includes(keyword)) || /《[^》]{2,24}》/.test(value);
}

function extractTitlesFromText(text, type, limit) {
  const seen = new Set();
  const titles = [];
  const matches = String(text || '').match(TITLE_BLOCK_RE) || [];
  for (const match of matches) {
    const title = cleanCandidateTitle(match).replace(/^《(.+)》$/, '$1');
    if (!isLikelyContentTitle(title, type)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
}

async function fetchText(url, { timeoutMs = 8000, abortSignal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': process.env.UPSTREAM_USER_AGENT || 'Mozilla/5.0 MediaHubBot/1.0',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
    if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
  }
}

function buildPlatformItem({ type, title, platform, rank, sourceUrl }) {
  const now = new Date().toISOString();
  const hotScore = Math.round((HEAT_BASE_BY_TYPE[type] || 100000) * platform.weight + Math.max(0, 40 - rank) * 2600);
  return normalizeContent({
    id: `${type}:${platform.id}:${hashId(`${type}|${platform.id}|${title}`)}`,
    title,
    summary: `${platform.label}公开热门内容采集，结合搜索热度、社交热议、内容传播和播放拉动形成榜单信号。`,
    type,
    tags: [...TYPE_DEFAULT_TAGS[type], platform.label],
    actors: [],
    characters: [],
    author: platform.label,
    ipName: title,
    status: 'ongoing',
    hotScore,
    createdAt: now,
    updatedAt: now,
    source: {
      provider: platform.id,
      label: platform.label,
      region: 'CN',
      url: sourceUrl,
    },
  });
}

async function fetchPlatformSource({ type, platform, limit, abortSignal }) {
  const titles = [];
  const errors = [];
  for (const url of platform.urls) {
    try {
      const text = await fetchText(url, { abortSignal });
      titles.push(...extractTitlesFromText(text, type, limit));
    } catch (error) {
      errors.push(`${platform.label}: ${error?.message || 'fetch failed'}`);
    }
    if (titles.length >= limit) break;
  }

  const unique = [...new Set(titles)].slice(0, limit);
  return {
    source: platform.id,
    label: platform.label,
    errors,
    list: unique.map((title, index) => buildPlatformItem({
      type,
      title,
      platform,
      rank: index + 1,
      sourceUrl: platform.urls[0],
    })),
  };
}

export async function fetchPlatformHotContents({
  type,
  page = 1,
  limit = 20,
  sort = 'hot',
  abortSignal,
} = {}) {
  const effectiveLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const perSourceLimit = Math.max(8, Math.ceil(effectiveLimit / PLATFORM_SOURCES.length) + 4);
  const settled = await Promise.allSettled(PLATFORM_SOURCES.map(platform => fetchPlatformSource({
    type,
    platform,
    limit: perSourceLimit,
    abortSignal,
  })));

  const errors = [];
  const list = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      errors.push(...result.value.errors);
      list.push(...result.value.list);
    } else {
      errors.push(result.reason?.message || 'platform fetch failed');
    }
  }

  const byId = new Map();
  for (const item of list) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const unique = [...byId.values()].sort((a, b) => {
    if (sort === 'latest') return new Date(b.updatedAt) - new Date(a.updatedAt);
    return b.hotScore - a.hotScore;
  });

  const start = (Math.max(1, Number(page) || 1) - 1) * effectiveLimit;
  return {
    list: unique.slice(start, start + effectiveLimit),
    total: unique.length,
    errors,
  };
}
