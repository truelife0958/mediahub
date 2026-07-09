import ApiState from '../ApiState';
import { CATEGORY_TEXT } from '../../constants';
import type { Content } from '../../types';
import { formatRankDateTime, getSourceDisplayName } from '../../utils/rankBoard';
import MetricQuad from './MetricQuad';

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高可信',
  medium: '中可信',
  low: '低可信',
};

const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  platform_rank: '平台榜单',
  official_rank: '官方榜单',
  annual_rank: '年度榜单',
  manual_verified: '人工核验',
  topic_signal: '话题热度',
  search_index: '搜索指数',
  source_score: '来源评分',
};

function formatEvidenceValue(rank?: number, score?: number) {
  if (Number.isFinite(Number(rank)) && Number(rank) > 0) return `#${Number(rank)}`;
  if (Number.isFinite(Number(score))) return `${Number(score).toFixed(1)}分`;
  return '已采集';
}

interface InlineContentDetailProps {
  content?: Content;
  onSelectRelated?: (content: Content) => void;
}

export default function InlineContentDetail({ content, onSelectRelated }: InlineContentDetailProps) {
  if (!content) {
    return <ApiState title="暂无选中作品" description="请选择左侧排行榜中的作品查看详情。" />;
  }

  const creatorLabel = content.type === 'drama' ? '主演/角色' : content.type === 'anime' ? '配音/角色' : '作者';
  const creatorValue = content.type === 'drama' || content.type === 'anime'
    ? [...(content.actors || []), ...(content.characters || [])].slice(0, 4).join(' / ')
    : content.author;
  const coverUrl = String(content.cover || '').trim();
  const related = [...(content.relatedContents || []), ...(content.similarContents || [])]
    .filter((item, index, list) => list.findIndex(entry => entry.id === item.id) === index)
    .slice(0, 6);
  const rankingEvidence = (content.rankingEvidence || []).slice(0, 8);
  const sourceConfidence = content.rankingMeta?.sourceConfidence || 'medium';
  const platformRank = Number(content.rankingMeta?.bestPlatformRank || content.metrics?.platformOriginalRank || content.metrics?.platformHotRank || content.metrics?.newDramaRank);
  const authorityRank = Number(content.rankingMeta?.authorityRank || content.metrics?.authorityOriginalRank);

  return (
    <section className="inline-detail-panel">
      <div className="inline-detail-head">
        <span>{CATEGORY_TEXT[content.type]} / #{content.rank || '--'}</span>
        <h2>{content.title}</h2>
      </div>
      {coverUrl && (
        <a className="inline-detail-cover" href={coverUrl} target="_blank" rel="noreferrer">
          <img src={coverUrl} alt={content.title} loading="lazy" referrerPolicy="no-referrer" />
        </a>
      )}
      <div className="inline-detail-tags">
        {(content.tags || []).slice(0, 6).map(tag => <span key={tag}>{tag}</span>)}
      </div>
      <MetricQuad content={content} />
      <dl className="inline-detail-facts">
        <div><dt>{creatorLabel}</dt><dd>{creatorValue || '--'}</dd></div>
        <div><dt>IP</dt><dd>{content.ipName || '--'}</dd></div>
        <div><dt>来源</dt><dd>{getSourceDisplayName(content.source?.label, content.source?.provider)}</dd></div>
        <div><dt>更新</dt><dd>{formatRankDateTime(content.updatedAt || content.cachedAt || content.createdAt)}</dd></div>
      </dl>
      {content.summary && <p className="inline-detail-summary">{content.summary}</p>}
      <div className="inline-detail-ranking">
        <h3>排名依据</h3>
        <p>{content.rankingMeta?.rankingReason || '综合真实来源、平台热度与搜索话题信号排序。'}</p>
        <div className="inline-detail-ranking-badges">
          <span className={`ranking-confidence-badge is-${sourceConfidence}`}>{CONFIDENCE_LABEL[sourceConfidence]}</span>
          {Number.isFinite(platformRank) && platformRank > 0 && <span>平台原榜 #{platformRank}</span>}
          {Number.isFinite(authorityRank) && authorityRank > 0 && <span>权威口径 #{authorityRank}</span>}
        </div>
      </div>
      <div className="inline-detail-evidence">
        <h3>来源证据</h3>
        {rankingEvidence.length > 0 ? rankingEvidence.map((entry) => (
          <a key={`${entry.sourceName}-${entry.evidenceType}-${entry.rank || entry.score || 'evidence'}`} href={entry.sourceUrl} target="_blank" rel="noreferrer">
            <strong>{entry.sourceName}</strong>
            <span>{EVIDENCE_TYPE_LABEL[entry.evidenceType] || '来源证据'} {formatEvidenceValue(entry.rank, entry.score)}</span>
            {entry.note && <em>{entry.note}</em>}
          </a>
        )) : <p>暂无可展示的来源证据。</p>}
      </div>
      <div className="inline-detail-signals">
        <h3>热信号</h3>
        {(content.hotSignals || []).slice(0, 6).map(signal => (
          <span key={`${signal.platform}-${signal.keyword}-${signal.rank}`}>
            {signal.platformName || signal.platform} #{signal.rank} / {signal.keyword}
          </span>
        ))}
      </div>
      <div className="inline-detail-related">
        <h3>关联作品</h3>
        {related.length > 0 ? related.map(item => (
          <button key={item.id} type="button" onClick={() => onSelectRelated?.(item)}>
            <strong>{item.title}</strong>
            <span>{CATEGORY_TEXT[item.type]} / #{item.rank || '--'}</span>
          </button>
        )) : <p>暂无关联作品。</p>}
      </div>
    </section>
  );
}
