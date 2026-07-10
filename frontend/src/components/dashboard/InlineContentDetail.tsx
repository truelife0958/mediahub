import ApiState from '../ApiState';
import { CATEGORY_TEXT } from '../../constants';
import type { Content } from '../../types';
import { formatRankDateTime, getSourceDisplayName } from '../../utils/rankBoard';
import { buildPublicFactRows, formatFieldSourceLine, PUBLIC_FIELD_LABEL } from '../../utils/publicReportFields';
import MetricQuad from './MetricQuad';

interface InlineContentDetailProps {
  content?: Content;
  onSelectRelated?: (content: Content) => void;
}

export default function InlineContentDetail({ content, onSelectRelated }: InlineContentDetailProps) {
  if (!content) {
    return <ApiState title="暂无选中作品" description="请选择左侧列表中的作品查看详情。" />;
  }

  const coverUrl = String(content.cover || '').trim();
  const related = [...(content.relatedContents || []), ...(content.similarContents || [])]
    .filter((item, index, list) => list.findIndex(entry => entry.id === item.id) === index)
    .slice(0, 6);
  const factRows = buildPublicFactRows(content);
  const sourceRows = (content.fieldSources || []).filter(item => item.sourceName).slice(0, 8);
  const summarySource = (content.fieldSources || []).find(item => item.field === 'summary');

  return (
    <section className="inline-detail-panel">
      <div className="inline-detail-head">
        <span>{CATEGORY_TEXT[content.type]} / #{content.rank || '--'}</span>
        <h2>{content.title}</h2>
      </div>
      {coverUrl && (
        <a className="inline-detail-cover" href={coverUrl} target="_blank" rel="noreferrer">
          <img src={coverUrl} alt={content.title} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        </a>
      )}
      <div className="inline-detail-tags">
        {(content.tags || []).slice(0, 6).map(tag => <span key={tag}>{tag}</span>)}
      </div>
      <MetricQuad content={content} />
      <dl className="inline-detail-facts">
        {factRows.map(row => (
          <div key={row.field}>
            <dt>{row.label}</dt>
            <dd>
              <span>{row.value || '未找到公开报道'}</span>
              <small>{formatFieldSourceLine(row.source)}</small>
            </dd>
          </div>
        ))}
        <div><dt>IP</dt><dd><span>{content.ipName || '--'}</span></dd></div>
        <div><dt>来源</dt><dd><span>{getSourceDisplayName(content.source?.label, content.source?.provider)}</span></dd></div>
        <div><dt>更新</dt><dd><span>{formatRankDateTime(content.updatedAt || content.cachedAt || content.createdAt)}</span></dd></div>
      </dl>
      {content.summary ? (
        <div className="inline-detail-summary">
          <p>{content.summary}</p>
          <small>{formatFieldSourceLine(summarySource)}</small>
        </div>
      ) : (
        <p className="inline-detail-summary">简介未找到公开报道。</p>
      )}
      <details className="inline-detail-notes">
        <summary>公开报道来源</summary>
        <div className="inline-detail-note-list">
          <p>仅展示公开报道、平台公开页或可信第三方披露的数据；未找到来源时显示“未找到公开报道”，不使用热度、排名或推算值替代。</p>
          {sourceRows.length > 0 ? (
            <ul>
              {sourceRows.map(entry => (
                <li key={`${entry.field}-${entry.sourceId}-${entry.sourceUrl || entry.sourceName}`}>
                  {entry.sourceUrl ? (
                    <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                      {PUBLIC_FIELD_LABEL[entry.field]} · {entry.sourceName}
                    </a>
                  ) : (
                    <span>{PUBLIC_FIELD_LABEL[entry.field]} · {entry.sourceName}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无字段级公开报道来源。</p>
          )}
        </div>
      </details>
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
