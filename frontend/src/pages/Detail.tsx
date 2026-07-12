import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useContentDetail,
} from '../api';
import ApiState from '../components/ApiState';
import { CATEGORY_COLORS, CATEGORY_TEXT, CATEGORY_ICONS } from '../constants';
import { IconBack, IconChart } from '../components/Icons';
import { buildRelationSections } from '../utils/contentRelations';
import { buildPublicFactRows, formatFieldSourceLine, PUBLIC_FIELD_LABEL } from '../utils/publicReportFields';
import {
  buildMetricRows,
  formatMetricScore,
  formatRealMetricDisplay,
  getTotalScore,
  hasBrokenText,
} from '../utils/contentMetrics';
import type { HotSignal } from '../types';

function formatRelationHeat(hotScore?: number) {
  const value = Math.max(0, Number(hotScore) || 0) / 10000;
  if (value >= 100) return `${Math.round(value)}分`;
  return `${value.toFixed(1)}分`;
}

function formatSignalMetric(signal: HotSignal) {
  const searchIndex = Number(signal.searchIndex);
  if (Number.isFinite(searchIndex) && searchIndex > 0) return `热搜 ${Math.round(searchIndex)}`;

  const topicPlayYi = Number(signal.topicPlayYi);
  if (Number.isFinite(topicPlayYi) && topicPlayYi > 0) {
    return `话题 ${topicPlayYi.toFixed(topicPlayYi >= 10 ? 1 : 2).replace(/\.0$/, '')} 亿`;
  }

  const topicScore = Number(signal.topicSignalScore);
  if (Number.isFinite(topicScore) && topicScore > 0) return `话题 ${Math.round(topicScore)}`;

  const heatValue = Number(signal.heatValue);
  if (Number.isFinite(heatValue) && heatValue > 0) return `热度 ${Math.round(heatValue)}`;

  return signal.rank ? `#${signal.rank}` : '已命中';
}

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [retryKey, setRetryKey] = useState(0);
  const contentId = id || '';
  const invalidContentId = contentId.length > 200 || !/^[a-z]+:[a-z0-9_-]+:[\w.-]+$/i.test(contentId);
  const { content, loading, error } = useContentDetail(contentId, retryKey);

  const handleGoBack = useCallback(() => navigate(-1), [navigate]);
  const buildSearchPath = useCallback((value: string) => (
    `/search?q=${encodeURIComponent(value)}`
  ), []);

  const cleanText = (value: unknown) => {
    const text = String(value || '').trim();
    return text && !hasBrokenText(text) ? text : '';
  };
  const cleanList = (values?: string[]) => (values || []).map(cleanText).filter(Boolean);
  const formatDate = (value?: string) => {
    if (!value) return '暂无日期';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '暂无日期';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="gold-surface w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center animate-float">
            <span className="text-sm font-black">MH</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] px-4">
        <ApiState
          title="详情源暂不可用"
          description={error || '内容不存在'}
          actionLabel={invalidContentId ? '返回首页' : '重新加载'}
          onAction={() => {
            if (invalidContentId) {
              navigate('/');
              return;
            }
            setRetryKey(key => key + 1);
          }}
        />
        <button
          onClick={handleGoBack}
          className="gold-surface inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border-0 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_-8px_rgba(232,168,56,0.5)]"
        >
          返回上一页
        </button>
      </div>
    );
  }

  const displayTitle = cleanText(content.title) || `${CATEGORY_TEXT[content.type]}内容待修复`;
  const displaySummary = cleanText(content.summary);
  const displayCharacters = cleanList(content.characters);
  const displayTags = cleanList(content.tags);
  const displayAuthor = cleanText(content.author);
  const displayIpName = cleanText(content.ipName);
  const displayCover = cleanText(content.cover);
  const hasContentQualityIssue = hasBrokenText(content.title)
    || hasBrokenText(content.summary)
    || (content.tags || []).some(hasBrokenText)
    || (content.actors || []).some(hasBrokenText)
    || (content.characters || []).some(hasBrokenText)
    || hasBrokenText(content.author)
    || hasBrokenText(content.ipName);
  const metricRows = buildMetricRows({
    heatMetric: content.heatMetric,
    metrics: content.metrics,
    hotScore: content.hotScore,
  });
  const totalScore = getTotalScore({ metrics: content.metrics, hotScore: content.hotScore });
  const realMetric = formatRealMetricDisplay({ heatMetric: content.heatMetric, metrics: content.metrics });
  const sourceLabel = content.source?.label || content.source?.provider || '综合榜';
  const sourceUrl = content.source?.url || content.leaderboardEvidence?.[0]?.sourceUrl || '';
  const displayUpdatedAt = content.updatedAt || content.cachedAt || content.createdAt;
  const relationSections = buildRelationSections(content);
  const hotSignals = (content.hotSignals || [])
    .filter(signal => !hasBrokenText(signal.keyword) && !hasBrokenText(signal.platformName))
    .slice(0, 8);
  const dataSources = (content.fieldSources || [])
    .map(entry => ({
      label: `${PUBLIC_FIELD_LABEL[entry.field]} · ${entry.sourceName || '公开报道'}`,
      url: cleanText(entry.sourceUrl),
      value: Array.isArray(entry.value) ? entry.value.join(' / ') : cleanText(entry.value),
    }))
    .filter((entry, index, list) => entry.label && list.findIndex(item => item.label === entry.label && item.url === entry.url) === index)
    .slice(0, 8);
  const publicFactRows = buildPublicFactRows(content);
  const summarySource = (content.fieldSources || []).find(entry => entry.field === 'summary');

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoBack}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              aria-label="返回"
            >
              <IconBack size={16} />
            </button>
            <h1 className="font-semibold text-base truncate flex-1">{displayTitle}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        {/* 主信息卡 */}
        <div className="rounded-2xl p-4 md:p-6 mb-6 animate-fade-in bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 flex-col gap-5 md:flex-row">
            {displayCover && (
              <a
                href={displayCover}
                target="_blank"
                rel="noreferrer"
                className="group relative mx-auto w-full max-w-[220px] shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.04)] shadow-[0_20px_45px_-30px_rgba(0,0,0,0.75)] md:mx-0"
                aria-label={`查看 ${displayTitle} 真实封面大图`}
              >
                <img
                  src={displayCover}
                  alt={`${displayTitle} 封面`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                  className="aspect-[3/4] h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute bottom-2 left-2 rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(0,0,0,0.55)] px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">真实封面</span>
              </a>
            )}
            <div className="min-w-0 flex-1">
            {/* 分类标签 + 状态 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md tracking-[0.02em] text-white" style={{ background: CATEGORY_COLORS[content.type] }}>
                分类 · {CATEGORY_ICONS[content.type]} {CATEGORY_TEXT[content.type]}
              </span>
              <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${content.status === 'ongoing' ? 'bg-[rgba(34,197,94,0.12)] text-[#4ade80] border border-[rgba(34,197,94,0.2)]' : 'bg-[rgba(161,161,170,0.12)] text-[var(--text-muted)] border border-[rgba(161,161,170,0.15)]'}`}>
                {content.status === 'ongoing' ? '连载中' : '已完结'}
              </span>
              <span className="detail-hot-score ml-auto">综合分 {totalScore.toFixed(1)}</span>
            </div>

            {/* 标题 */}
            <h2 className="text-2xl md:text-[28px] font-bold -tracking-[0.02em] leading-tight mb-3">{displayTitle}</h2>
            {hasContentQualityIssue && (
              <div className="mb-4 rounded-xl border border-[rgba(251,146,60,0.26)] bg-[rgba(251,146,60,0.08)] px-3 py-2 text-xs text-[#fed7aa]">
                该条内容存在乱码字段，已自动隐藏异常文本，可在后台重新编辑修复。
              </div>
            )}

            <div className="detail-metric-panel">
              <div className="detail-total-score">
                <IconChart size={16} />
                <span>综合热度</span>
                <strong>{totalScore.toFixed(1)}</strong>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2">{realMetric.meta} · 公开来源字段优先</p>
              <div className="detail-metric-grid">
                {metricRows.map(row => (
                  <div key={row.id} className="detail-metric-item">
                    <div className="detail-metric-head">
                      <span>{row.label}</span>
                      <strong>{formatMetricScore(row.score)}</strong>
                    </div>
                    <div className="detail-metric-bar">
                      <span style={{ width: `${row.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hotSignals.length > 0 && (
              <div className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.035)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">公开热榜信号</span>
                  <span className="text-xs text-[var(--text-muted)]">{hotSignals.length} 条命中</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hotSignals.map(signal => {
                    const body = (
                      <>
                        <span className="font-semibold">{signal.platformName || signal.platform}</span>
                        <span className="text-[var(--text-muted)]">#{signal.rank || '-'}</span>
                        <span className="max-w-[180px] truncate">{signal.keyword}</span>
                        <span className="text-[var(--accent-primary)]">{formatSignalMetric(signal)}</span>
                      </>
                    );
                    return signal.sourceUrl ? (
                      <a
                        key={`${signal.platform}-${signal.rank}-${signal.keyword}`}
                        href={signal.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {body}
                      </a>
                    ) : (
                      <span
                        key={`${signal.platform}-${signal.rank}-${signal.keyword}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                      >
                        {body}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {dataSources.length > 0 && (
              <div className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.035)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">数据来源</span>
                  <span className="text-xs text-[var(--text-muted)]">{dataSources.length} 个公开来源</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dataSources.map(entry => (
                    <a
                      key={entry.url}
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      title={entry.value || entry.label}
                    >
                      <span className="font-semibold">{entry.label}</span>
                      {entry.value ? <span className="max-w-[220px] truncate text-[var(--text-muted)]">{entry.value}</span> : null}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* 元信息 */}
            <div className="flex flex-col gap-2.5 mb-4 text-sm">
              {publicFactRows.map(row => (
                <div key={row.field} className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[48px] shrink-0 pt-0.5">{row.label}</span>
                  <div className="min-w-0">
                    <span className="block text-sm text-[var(--text-secondary)] break-words">
                      {row.value || '未找到公开报道'}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                      {formatFieldSourceLine(row.source)}
                    </span>
                  </div>
                </div>
              ))}
              {displayCharacters.length > 0 && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">角色</span>
                  <div className="min-w-0 flex flex-wrap gap-x-1 gap-y-0.5">
                    {displayCharacters.map((character, index) => (
                      <span key={character}>
                        <button
                          type="button"
                          onClick={() => navigate(buildSearchPath(character))}
                          className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                        >
                          {character}
                        </button>
                        {index < displayCharacters.length - 1 ? <span className="text-[var(--text-muted)]"> / </span> : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {displayAuthor && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">作者</span>
                  <button
                    type="button"
                    onClick={() => navigate(buildSearchPath(displayAuthor))}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {displayAuthor}
                  </button>
                </div>
              )}
              {displayIpName && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">IP</span>
                  <button
                    type="button"
                    onClick={() => navigate(buildSearchPath(displayIpName))}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {displayIpName}
                  </button>
                </div>
              )}
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">来源</span>
                {sourceUrl ? (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
                  >
                    {sourceLabel}
                  </a>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)]">{sourceLabel}</span>
                )}
              </div>
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-[var(--text-muted)] text-xs font-medium min-w-[36px] shrink-0 pt-0.5">更新</span>
                <span className="text-sm text-[var(--text-secondary)]">{formatDate(displayUpdatedAt)}</span>
              </div>
            </div>

            {/* 标签 */}
            {displayTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {displayTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => navigate(buildSearchPath(tag))}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.06)] transition-colors duration-200 hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {/* 简介 */}
            {displaySummary ? (
              <div className="mb-5">
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed break-words">{displaySummary}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">{formatFieldSourceLine(summarySource)}</p>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-sm leading-relaxed mb-5">简介未找到公开报道。</p>
            )}

            {relationSections.length > 0 && (
              <div className="detail-relation-panel">
                <div className="detail-relation-heading">
                  <span>数据关联</span>
                  <strong>{relationSections.reduce((sum, section) => sum + section.items.length, 0)} 条</strong>
                </div>
                <div className="detail-relation-sections">
                  {relationSections.map(section => (
                    <div key={section.id} className="detail-relation-section">
                      <div className="detail-relation-section-head">
                        <div>
                          <strong>{section.title}</strong>
                          <span>{section.description}</span>
                        </div>
                        <em>{section.items.length}</em>
                      </div>
                      <div className="detail-relation-list">
                        {section.items.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            className="detail-relation-row"
                            onClick={() => navigate(`/detail/${item.id}`)}
                          >
                            <span className="detail-relation-rank">#{item.rank || '-'}</span>
                            <span className="detail-relation-main">
                              <strong>{item.title}</strong>
                              <span>
                                {item.sourceName}
                                {item.matchedText ? ` · ${item.matchedText}` : ''}
                              </span>
                            </span>
                            <span className="detail-relation-heat">{formatRelationHeat(item.hotScore)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
