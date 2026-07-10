import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_COLORS, CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';
import { formatRealMetricDisplay, getTotalScore } from '../utils/contentMetrics';

interface RelatedCardProps {
  content: Content;
}

const RelatedCard = memo(function RelatedCard({ content }: RelatedCardProps) {
  const navigate = useNavigate();
  const handleClick = useCallback(() => navigate(`/detail/${content.id}`), [content.id, navigate]);
  const totalScore = getTotalScore({ metrics: content.metrics, hotScore: content.hotScore });
  const realMetric = formatRealMetricDisplay({ heatMetric: content.heatMetric, metrics: content.metrics });

  return (
    <button
      type="button"
      className="flex gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-[var(--bg-card-hover)] group text-left w-full"
      onClick={handleClick}
      aria-label={`查看关联内容：${content.title}`}
    >
      <div className="flex flex-col justify-center flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
            style={{ background: CATEGORY_COLORS[content.type] }}
          >
            {CATEGORY_TEXT[content.type]}
          </span>
          {content.status === 'ongoing' && (
            <span className="text-[10px] text-[#4ade80]">连载中</span>
          )}
        </div>
        <h4 className="font-medium text-sm truncate group-hover:text-[var(--accent-primary)] transition-colors">
          {content.title}
        </h4>
        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
          {content.actors?.length > 0
            ? content.actors.slice(0, 2).join(' · ')
            : content.author}
        </p>
      </div>
      <div className="flex flex-col items-end text-[#fb923c] font-semibold text-xs shrink-0 self-center">
        <span>{realMetric.value}</span>
        <small className="text-[10px] text-[var(--text-muted)]">{realMetric.label} / {totalScore.toFixed(1)}</small>
      </div>
    </button>
  );
});

export default RelatedCard;
