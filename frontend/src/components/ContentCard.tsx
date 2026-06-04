import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_COLORS, CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';
import { formatHotScore } from '../utils/hotScore';

interface ContentCardProps {
  content: Content;
  size?: 'large' | 'medium' | 'small';
  showReason?: boolean;
  onClick?: (content: Content) => void;
}

const HEIGHTS: Record<string, string> = {
  large: 'min-h-[190px]',
  medium: 'min-h-[170px]',
  small: 'min-h-[150px]',
};

const ContentCard = memo(function ContentCard({ content, size = 'medium', showReason, onClick }: ContentCardProps) {
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

  return (
    <button
      type="button"
      className={`content-card ${HEIGHTS[size]} w-full text-left will-change-transform`}
      onClick={handleClick}
      aria-label={`查看详情：${content.title}`}
    >
      <div className={`relative z-10 flex h-full flex-col ${paddingClass}`}>
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-md tracking-[0.02em] text-white"
            style={{ background: CATEGORY_COLORS[content.type] }}
          >
            {CATEGORY_TEXT[content.type]}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${content.status === 'ongoing' ? 'text-[#4ade80] bg-[rgba(34,197,94,0.1)]' : 'text-[var(--text-muted)] bg-[rgba(255,255,255,0.05)]'}`}
          >
            {statusText}
          </span>
        </div>

        <h3 className="card-meta-title line-clamp-2">{content.title}</h3>
        <p className="text-xs text-[var(--text-muted)] mb-2">{displayAuthor}</p>
        <p className="mb-3 line-clamp-2 text-xs text-[var(--text-secondary)]">{content.summary || '暂无简介'}</p>

        {showReason && content.reason && (
          <div className="mb-2">
            <span className="reason-badge">推荐 · {content.reason}</span>
          </div>
        )}

        <div className="card-meta-bottom mt-auto">
          <span className="hot-score">{formatHotScore(content.hotScore, content.heatMetric)}</span>
        </div>
      </div>
    </button>
  );
});

export default ContentCard;
