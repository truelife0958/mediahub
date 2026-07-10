import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_COLORS, CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';
import { formatRealMetricDisplay, getTotalScore } from '../utils/contentMetrics';

interface ContentCardProps {
  content: Content;
  size?: 'large' | 'medium' | 'small';
  keyword?: string;
  onClick?: (content: Content) => void;
}

const HEIGHTS: Record<string, string> = {
  large: 'min-h-[160px]',
  medium: 'min-h-[132px]',
  small: 'min-h-[116px]',
};

function getMatchFields(content: Content, keyword = '') {
  const term = keyword.trim().toLowerCase();
  if (!term) return [];
  const fields: Array<[string, string[]]> = [
    ['标题', [content.title]],
    ['简介', [content.summary]],
    ['作者', [content.author]],
    ['IP', [content.ipName]],
    ['主演', content.actors || []],
    ['角色', content.characters || []],
    ['标签', content.tags || []],
  ];
  return fields
    .filter(([, values]) => values.some(value => String(value || '').toLowerCase().includes(term)))
    .map(([label]) => label)
    .slice(0, 3);
}

const ContentCard = memo(function ContentCard({ content, size = 'medium', keyword = '', onClick }: ContentCardProps) {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(content);
      return;
    }
    navigate(`/detail/${content.id}`);
  }, [content, navigate, onClick]);

  const statusText = content.status === 'ongoing' ? '连载中' : '已完结';
  const displayAuthor = content.actors?.length > 0 ? content.actors.slice(0, 2).join(' / ') : content.author;
  const paddingClass = size === 'large' ? 'p-4' : 'p-3';
  const matchFields = getMatchFields(content, keyword);
  const totalScore = getTotalScore({ metrics: content.metrics, hotScore: content.hotScore });
  const realMetric = formatRealMetricDisplay({ heatMetric: content.heatMetric, metrics: content.metrics });

  return (
    <button
      type="button"
      className={`content-card ${HEIGHTS[size]} w-full text-left will-change-transform focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] focus-visible:outline-offset-2`}
      onClick={handleClick}
      aria-label={`查看详情：${content.title}`}
    >
      <div className={`relative z-10 flex h-full flex-col ${paddingClass}`}>
        {/* 顶部标签行 */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-md tracking-[0.02em] text-white shrink-0"
            style={{ background: CATEGORY_COLORS[content.type] }}
          >
            {CATEGORY_TEXT[content.type]}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${content.status === 'ongoing' ? 'text-[#4ade80] bg-[rgba(34,197,94,0.1)]' : 'text-[var(--text-muted)] bg-[rgba(255,255,255,0.05)]'}`}
          >
            {statusText}
          </span>
          {matchFields.length > 0 && (
            <span className="reason-badge ml-auto">命中 · {matchFields.join(' / ')}</span>
          )}
        </div>

        {/* 标题 */}
        <h3 className="card-meta-title line-clamp-2">{content.title}</h3>

        {/* 作者/演员 */}
        {displayAuthor && <p className="text-xs text-[var(--text-muted)] mt-1 truncate">{displayAuthor}</p>}

        {/* 简介 */}
        <p className="mb-auto line-clamp-2 text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{content.summary || '暂无简介'}</p>

        {/* 底部热度 */}
        <div className="card-meta-bottom mt-2 pt-1.5 border-t border-[rgba(255,255,255,0.06)]">
          <span className="hot-score">{realMetric.label} {realMetric.value}</span>
          <span className="text-[10px] text-[var(--text-muted)]">综合分 {totalScore.toFixed(1)}</span>
        </div>
      </div>
    </button>
  );
});

export default ContentCard;
