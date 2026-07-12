const PLAY_LABEL_RE = /(?:全网有效播放量|累计播放量|总播放量|播放量|播放|观看)/;
const READ_LABEL_RE = /(?:累计阅读量|总阅读量|总阅读|阅读量|阅读)/;
const EXCLUDED_CONTEXT_RE = /(?:热度|热力|指数|排名|榜单|月票|推荐票|点赞|收藏|评论|弹幕|搜索|话题)/;
const PLAY_JSON_KEY_RE = /(?:^|_)(play|plays|playcount|play_count|view|views|viewcount|view_count)(?:$|_)/i;
const READ_JSON_KEY_RE = /(?:^|_)(read|reads|readcount|read_count|reading|readingcount|reading_count)(?:$|_)/i;
const HEAT_JSON_KEY_RE = /(hot|heat|score|rank|like|favorite|collect|comment|search|topic|vote|index)/i;

const TYPE_METRIC = {
  drama: 'play',
  anime: 'play',
  comic: 'read',
  novel: 'read',
};

const RELIABLE_CONFIDENCE = new Set(['official', 'trusted_third_party']);
const METHOD_BY_CONFIDENCE = {
  official: 'public_page',
  trusted_third_party: 'third_party',
};

const OFFICIAL_SOURCE_CATALOG = {
  drama: [
    { sourceId: 'hongguo', sourceName: '红果短剧', sourceUrl: 'https://www.hongguoduanju.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'douyin', sourceName: '抖音', sourceUrl: 'https://www.douyin.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'kuaishou', sourceName: '快手', sourceUrl: 'https://www.kuaishou.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
  ],
  anime: [
    { sourceId: 'bilibili', sourceName: '哔哩哔哩', sourceUrl: 'https://www.bilibili.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'tencent_video', sourceName: '腾讯视频', sourceUrl: 'https://v.qq.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'iqiyi', sourceName: '爱奇艺', sourceUrl: 'https://www.iqiyi.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'youku', sourceName: '优酷', sourceUrl: 'https://www.youku.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'] },
  ],
  novel: [
    { sourceId: 'fanqie', sourceName: '番茄小说', sourceUrl: 'https://fanqienovel.com/', metricTypes: ['read'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'qidian', sourceName: '起点中文网', sourceUrl: 'https://www.qidian.com/', metricTypes: ['read'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'jjwxc', sourceName: '晋江文学城', sourceUrl: 'https://www.jjwxc.net/', metricTypes: ['read'], methods: ['public_page'] },
    { sourceId: 'zongheng', sourceName: '纵横中文网', sourceUrl: 'https://www.zongheng.com/', metricTypes: ['read'], methods: ['public_page', 'embedded_json'] },
  ],
  comic: [
    { sourceId: 'ac_qq', sourceName: '腾讯动漫', sourceUrl: 'https://ac.qq.com/', metricTypes: ['read'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'bilibili_comic', sourceName: '哔哩哔哩漫画', sourceUrl: 'https://manga.bilibili.com/', metricTypes: ['read'], methods: ['public_page', 'embedded_json'] },
    { sourceId: 'kuaikan', sourceName: '快看漫画', sourceUrl: 'https://www.kuaikanmanhua.com/', metricTypes: ['read'], methods: ['public_page', 'embedded_json'] },
  ],
};

const TRUSTED_THIRD_PARTY_SOURCE_CATALOG = [
  { sourceId: 'maoyan', sourceName: '猫眼专业版', sourceUrl: 'https://piaofang.maoyan.com/', metricTypes: ['play'], methods: ['third_party'] },
  { sourceId: 'lighthouse', sourceName: '灯塔专业版', sourceUrl: 'https://www.endata.com.cn/', metricTypes: ['play'], methods: ['third_party'] },
  { sourceId: 'guduo', sourceName: '骨朵数据', sourceUrl: 'https://www.guduodata.com/', metricTypes: ['play'], methods: ['third_party'] },
  { sourceId: 'datawin', sourceName: '德塔文', sourceUrl: 'https://www.datawin.com/', metricTypes: ['play'], methods: ['third_party'] },
];

// Self-media sources: public content platforms that publish play/read metrics.
// Confidence is 'trusted_third_party' — lower than official platform data but still valuable.
const SELF_MEDIA_SOURCE_CATALOG = [
  { sourceId: 'sina', sourceName: '新浪', sourceUrl: 'https://www.sina.com.cn/', metricTypes: ['play', 'read'], methods: ['public_page'], hostPatterns: ['sina.com', 'sina.cn'] },
  { sourceId: 'sohu', sourceName: '搜狐', sourceUrl: 'https://www.sohu.com/', metricTypes: ['play', 'read'], methods: ['public_page'], hostPatterns: ['sohu.com'] },
  { sourceId: 'ifeng', sourceName: '凤凰网', sourceUrl: 'https://www.ifeng.com/', metricTypes: ['play', 'read'], methods: ['public_page'], hostPatterns: ['ifeng.com'] },
  { sourceId: 'ithome', sourceName: 'IT之家', sourceUrl: 'https://www.ithome.com/', metricTypes: ['play', 'read'], methods: ['public_page'], hostPatterns: ['ithome.com'] },
  { sourceId: 'hongguoduanju', sourceName: '红果短剧', sourceUrl: 'https://www.hongguoduanju.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'], hostPatterns: ['hongguoduanju.com'] },
  { sourceId: 'bilibili', sourceName: '哔哩哔哩', sourceUrl: 'https://www.bilibili.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'], hostPatterns: ['bilibili.com'] },
  { sourceId: 'douyin', sourceName: '抖音', sourceUrl: 'https://www.douyin.com/', metricTypes: ['play'], methods: ['public_page', 'embedded_json'], hostPatterns: ['douyin.com'] },
];

// Build a fetchText implementation with retry logic for robust page fetching.
// Retries up to 3 times with exponential backoff. Returns null on all-fail (graceful degradation).
function buildFetchTextWithRetry({ maxRetries = 3, baseDelayMs = 500, timeoutMs = 10_000 } = {}) {
  const userAgent = process.env.UPSTREAM_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 MediaHubBot/1.0';

  return async (url) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timer);
        if (response.ok) return await response.text();
        if (response.status === 404 || response.status === 410) return null;
        // 429/5xx — retry with backoff
      } catch (error) {
        clearTimeout(timer);
        // Network error — retry
      }
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
    return null;
  };
}

function normalizeCountMetric(input) {
  if (input === null || input === undefined) return null;
  const text = String(input).replace(/,/g, '').trim();
  if (!text) return null;
  if (EXCLUDED_CONTEXT_RE.test(text) && !PLAY_LABEL_RE.test(text) && !READ_LABEL_RE.test(text)) return null;
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(亿|萬|万|千|次|个)?/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const unit = match[2] || '';
  const multiplier = unit === '亿' ? 100_000_000 : (unit === '万' || unit === '萬' ? 10_000 : (unit === '千' ? 1_000 : 1));
  return Math.round(numeric * multiplier);
}

function buildSource({ sourceId, sourceName, sourceUrl, metricType, value, method, confidence, capturedAt }) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return {
    sourceId: String(sourceId || 'unknown'),
    sourceName: String(sourceName || sourceId || '未知来源'),
    sourceUrl: String(sourceUrl || ''),
    metricType,
    value: Number(value),
    unit: 'count',
    method,
    confidence,
    capturedAt,
  };
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter(source => {
    const key = `${source.sourceId}|${source.metricType}|${source.value}|${source.confidence}|${source.method}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractRealMetricSourcesFromText({
  text,
  metricType,
  sourceId,
  sourceName,
  sourceUrl,
  capturedAt = new Date().toISOString(),
  confidence = 'official',
  method = 'public_page',
} = {}) {
  const labelRe = metricType === 'read' ? READ_LABEL_RE : PLAY_LABEL_RE;
  const sources = [];
  const normalizedText = String(text || '').replace(/\s+/g, ' ');
  const pattern = new RegExp(`(${labelRe.source})[^0-9]{0,16}([0-9][0-9,.]*(?:\\.[0-9]+)?\\s*(?:亿|万|萬|千|次|个)?)`, 'g');
  let match;
  while ((match = pattern.exec(normalizedText))) {
    const value = normalizeCountMetric(match[2]);
    const source = buildSource({ sourceId, sourceName, sourceUrl, metricType, value, method, confidence, capturedAt });
    if (source) sources.push(source);
  }
  return dedupeSources(sources);
}

function walkJson(value, visitor, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, visitor, [...path, String(index)]));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visitor(key, child, [...path, key]);
      walkJson(child, visitor, [...path, key]);
    }
  }
}

function extractRealMetricSourcesFromJson({
  json,
  sourceId,
  sourceName,
  sourceUrl,
  capturedAt = new Date().toISOString(),
  confidence = 'official',
  method = 'embedded_json',
} = {}) {
  const sources = [];
  walkJson(json, (key, value) => {
    const compactKey = String(key || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
    if (HEAT_JSON_KEY_RE.test(compactKey)) return;
    const metricType = PLAY_JSON_KEY_RE.test(compactKey) ? 'play' : (READ_JSON_KEY_RE.test(compactKey) ? 'read' : null);
    if (!metricType) return;
    const count = normalizeCountMetric(value);
    const source = buildSource({ sourceId, sourceName, sourceUrl, metricType, value: count, method, confidence, capturedAt });
    if (source) sources.push(source);
  });
  return dedupeSources(sources);
}

function parseEmbeddedJsonFromHtml(html) {
  const blocks = [];
  const text = String(html || '');
  const scriptRe = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(text))) {
    try { blocks.push(JSON.parse(match[1])); } catch { /* ignore malformed script json */ }
  }
  const nextMatch = text.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextMatch) {
    try { blocks.push(JSON.parse(nextMatch[1])); } catch { /* ignore malformed next data */ }
  }
  const stateMatch = text.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);
  if (stateMatch) {
    try { blocks.push(JSON.parse(stateMatch[1])); } catch { /* ignore malformed initial state */ }
  }
  return blocks;
}

function getHost(value) {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(sourceUrl, referenceUrl) {
  const sourceHost = getHost(sourceUrl);
  const referenceHost = getHost(referenceUrl);
  if (!sourceHost || !referenceHost) return false;
  return sourceHost === referenceHost || sourceHost.endsWith(`.${referenceHost}`) || referenceHost.endsWith(`.${sourceHost}`);
}

function catalogEntriesForType(type) {
  return OFFICIAL_SOURCE_CATALOG[type] || [];
}

function getKnownOfficialSource({ type, sourceId, sourceUrl } = {}) {
  const id = String(sourceId || '').toLowerCase();
  const entries = [
    ...catalogEntriesForType(type),
    ...Object.values(OFFICIAL_SOURCE_CATALOG).flat(),
  ];
  return entries.find(entry => entry.sourceId === id)
    || entries.find(entry => sourceUrl && hostMatches(sourceUrl, entry.sourceUrl))
    || null;
}

function getKnownTrustedThirdPartySource({ sourceId, sourceUrl } = {}) {
  const id = String(sourceId || '').toLowerCase();
  return TRUSTED_THIRD_PARTY_SOURCE_CATALOG.find(entry => entry.sourceId === id)
    || TRUSTED_THIRD_PARTY_SOURCE_CATALOG.find(entry => sourceUrl && hostMatches(sourceUrl, entry.sourceUrl))
    || null;
}

function normalizeMetricSourceCandidate(candidate = {}, base = {}) {
  const sourceId = String(candidate.sourceId || candidate.id || candidate.provider || base.sourceId || 'unknown').toLowerCase();
  const sourceUrl = String(candidate.sourceUrl || candidate.url || base.sourceUrl || '');
  const metricType = candidate.metricType || base.metricType || 'play';
  const knownOfficial = getKnownOfficialSource({ type: base.type, sourceId, sourceUrl });
  const knownThirdParty = getKnownTrustedThirdPartySource({ sourceId, sourceUrl });
  const confidence = RELIABLE_CONFIDENCE.has(candidate.confidence)
    ? candidate.confidence
    : (knownThirdParty ? 'trusted_third_party' : (knownOfficial || candidate.primary ? 'official' : ''));

  if (!RELIABLE_CONFIDENCE.has(confidence)) return null;

  const method = candidate.method
    || (confidence === 'trusted_third_party' ? 'third_party' : (candidate.publicApi || candidate.apiUrl ? 'public_api' : METHOD_BY_CONFIDENCE[confidence]));

  if (!['public_page', 'embedded_json', 'public_api', 'third_party'].includes(method)) return null;

  return {
    sourceId,
    sourceName: String(candidate.sourceName || candidate.label || knownOfficial?.sourceName || knownThirdParty?.sourceName || base.sourceName || sourceId),
    sourceUrl,
    metricType,
    method,
    confidence,
    text: candidate.text || candidate.html || '',
    json: candidate.json,
    publicApi: candidate.publicApi || candidate.apiUrl || '',
  };
}

function getKnownSelfMediaSource(url) {
  if (!url) return null;
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  for (const entry of SELF_MEDIA_SOURCE_CATALOG) {
    if (entry.hostPatterns?.some(pattern => host.includes(pattern))) return entry;
  }
  return null;
}

function getReliableMetricSourceCandidates(item = {}, options = {}) {
  const metricType = TYPE_METRIC[item?.type] || (item?.heatMetric === 'reading' ? 'read' : 'play');
  const sourceId = item?.source?.provider || item?.source || item?.sourceId || 'unknown';
  const sourceName = item?.source?.label || item?.sourceName || sourceId;
  const sourceUrl = item?.source?.url || item?.sourceUrl || item?.url || '';
  const base = { type: item?.type, metricType, sourceId, sourceName, sourceUrl };
  const candidates = [];

  // Primary: inline text from summary/description
  candidates.push({
    sourceId,
    sourceName,
    sourceUrl,
    metricType,
    confidence: 'official',
    method: 'public_page',
    text: [item?.summary, item?.description].filter(Boolean).join(' '),
    primary: true,
  });

  // Auto-candidate: if sourceUrl points to a known self-media or official platform,
  // add a fetch candidate to scrape the page for embedded play/read metrics
  const selfMediaSource = getKnownSelfMediaSource(sourceUrl);
  if (selfMediaSource && sourceUrl) {
    candidates.push({
      sourceId: selfMediaSource.sourceId,
      sourceName: selfMediaSource.sourceName,
      sourceUrl,
      metricType,
      confidence: 'trusted_third_party',
      method: 'public_page',
    });
  }

  const candidateInputs = [
    ...(Array.isArray(item?.realMetricSourceCandidates) ? item.realMetricSourceCandidates : []),
    ...(Array.isArray(item?.metricSourceCandidates) ? item.metricSourceCandidates : []),
    ...(Array.isArray(options.sourceCandidates) ? options.sourceCandidates : []),
  ];

  for (const candidate of candidateInputs) {
    candidates.push(candidate);
  }

  const normalized = candidates
    .map(candidate => normalizeMetricSourceCandidate(candidate, base))
    .filter(Boolean)
    .filter(candidate => candidate.metricType === metricType);

  const seen = new Set();
  return normalized.filter(candidate => {
    const key = `${candidate.sourceId}|${candidate.sourceUrl}|${candidate.method}|${candidate.confidence}|${candidate.text ? 'inline' : ''}|${candidate.publicApi}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseJsonText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return [];
  try {
    return [JSON.parse(trimmed)];
  } catch {
    return [];
  }
}

async function collectSourcesFromCandidate(candidate, { fetchText, fetchJson, capturedAt, item } = {}) {
  const sources = [];
  const base = {
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl || candidate.publicApi,
    capturedAt,
    confidence: candidate.confidence,
  };

  if (candidate.text) {
    sources.push(...extractRealMetricSourcesFromText({
      text: candidate.text,
      metricType: candidate.metricType,
      ...base,
      method: candidate.method === 'third_party' ? 'third_party' : 'public_page',
    }));
  }

  if (candidate.json) {
    sources.push(...extractRealMetricSourcesFromJson({
      json: candidate.json,
      ...base,
      method: candidate.method === 'third_party' ? 'third_party' : 'public_api',
    }));
  }

  const apiUrl = candidate.publicApi || (candidate.method === 'public_api' ? candidate.sourceUrl : '');
  if (apiUrl) {
    if (typeof fetchJson === 'function') {
      const json = await fetchJson(apiUrl, { item, candidate });
      sources.push(...extractRealMetricSourcesFromJson({ json, ...base, sourceUrl: apiUrl, method: 'public_api' }));
    } else if (typeof fetchText === 'function') {
      const text = await fetchText(apiUrl, { item, candidate });
      for (const json of parseJsonText(text)) {
        sources.push(...extractRealMetricSourcesFromJson({ json, ...base, sourceUrl: apiUrl, method: 'public_api' }));
      }
    }
  }

  if (candidate.sourceUrl && candidate.method !== 'public_api' && typeof fetchText === 'function') {
    const html = await fetchText(candidate.sourceUrl, { item, candidate });
    sources.push(...extractRealMetricSourcesFromText({
      text: html,
      metricType: candidate.metricType,
      ...base,
      method: candidate.method === 'third_party' ? 'third_party' : 'public_page',
    }));
    for (const json of [...parseJsonText(html), ...parseEmbeddedJsonFromHtml(html)]) {
      sources.push(...extractRealMetricSourcesFromJson({
        json,
        ...base,
        method: candidate.method === 'third_party' ? 'third_party' : 'embedded_json',
      }));
    }
  }

  return sources;
}

function selectRealMetricPatch(sources = [], preferredMetricType = 'play') {
  const realMetricSources = dedupeSources(sources.filter(source => source && Number(source.value) > 0));
  const validSources = realMetricSources
    .filter(source => source.metricType === preferredMetricType)
    .sort((a, b) => {
      const confidenceDiff = (a.confidence === 'official' ? 0 : 1) - (b.confidence === 'official' ? 0 : 1);
      if (confidenceDiff !== 0) return confidenceDiff;
      const dateDiff = Date.parse(b.capturedAt || '') - Date.parse(a.capturedAt || '');
      if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff;
      return Number(b.value) - Number(a.value);
    });

  if (validSources.length === 0) {
    return {
      realMetricStatus: 'unavailable',
      realMetricSources: [],
    };
  }

  const selected = validSources[0];
  const patch = {
    realMetricStatus: selected.confidence,
    realMetricCapturedAt: selected.capturedAt,
    realMetricSources,
  };
  if (selected.metricType === 'read') patch.realReadCount = selected.value;
  else patch.realPlayCount = selected.value;
  return patch;
}

async function collectRealMetricsForItem({ item, fetchText, fetchJson, now = new Date(), sourceCandidates = [] } = {}) {
  const capturedAt = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  const metricType = TYPE_METRIC[item?.type] || (item?.heatMetric === 'reading' ? 'read' : 'play');
  const candidates = getReliableMetricSourceCandidates(item, { sourceCandidates });
  const sources = [];
  const errors = [];

  for (const candidate of candidates) {
    try {
      sources.push(...await collectSourcesFromCandidate(candidate, { fetchText, fetchJson, capturedAt, item }));
    } catch (error) {
      errors.push({
        sourceId: candidate.sourceId,
        sourceUrl: candidate.sourceUrl || candidate.publicApi,
        message: error?.message || 'source collection failed',
      });
    }
  }

  const patch = selectRealMetricPatch(sources, metricType);
  if (patch.realMetricStatus === 'unavailable' && errors.length > 0) {
    const error = new Error(errors[0].message || 'real metric source collection failed');
    error.metricSourceErrors = errors;
    throw error;
  }
  return patch;
}

async function enrichItemsWithRealMetrics(items = [], options = {}) {
  const list = [];
  const errors = [];
  for (const item of items) {
    try {
      const patch = await collectRealMetricsForItem({ item, ...options });
      list.push({
        ...item,
        metrics: {
          ...(item.metrics || {}),
          ...patch,
        },
      });
    } catch (error) {
      errors.push({
        id: item?.id || '',
        title: item?.title || '',
        source: item?.source?.provider || item?.source || '',
        message: error?.message || 'real metric collection failed',
      });
      list.push({
        ...item,
        metrics: {
          ...(item.metrics || {}),
          realMetricStatus: 'unavailable',
          realMetricSources: [],
        },
      });
    }
  }
  return { list, errors };
}

export {
  buildFetchTextWithRetry,
  collectRealMetricsForItem,
  enrichItemsWithRealMetrics,
  extractRealMetricSourcesFromJson,
  extractRealMetricSourcesFromText,
  getReliableMetricSourceCandidates,
  normalizeCountMetric,
  selectRealMetricPatch,
};

