import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';

interface RelatedCardProps {
  content: Content;
}

const RelatedCard = memo(function RelatedCard({ content }: RelatedCardProps) {
  const navigate = useNavigate();
  const handleClick = useCallback(() => navigate(`/detail/${content.id}`), [content.id, navigate]);

  return (
    <button
      type="button"
      className="flex gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-[var(--bg-card-hover)] group"
      onClick={handleClick}
      aria-label={`查看关联内容：${content.title}`}
    >
      <div className="flex flex-col justify-center flex-1 min-w-0">
        <h4 className="font-medium text-sm truncate mb-1 group-hover:text-[var(--accent-primary)] transition-colors">
          {content.title}
        </h4>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-[var(--text-muted)]">
            {CATEGORY_TEXT[content.type]}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] truncate">
          {content.actors?.length > 0
            ? content.actors.slice(0, 2).join(' · ')
            : content.author}
        </p>
      </div>
      <div className="flex items-center gap-1 text-[#fb923c] font-semibold text-xs">
        {content.hotScore.toLocaleString()}
      </div>
    </button>
  );
});

export default RelatedCard;
