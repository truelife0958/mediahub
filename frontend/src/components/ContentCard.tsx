import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../api';
import { CATEGORY_COLORS, CATEGORY_TEXT } from '../constants';
import type { Content } from '../types';

interface ContentCardProps {
  content: Content;
  size?: 'large' | 'medium' | 'small';
  showReason?: boolean;
}

const HEIGHTS: Record<string, string> = {
  large: 'h-[320px]',
  medium: 'h-[290px]',
  small: 'h-[240px]',
};

const ContentCard = memo(function ContentCard({ content, size = 'medium', showReason }: ContentCardProps) {
  const navigate = useNavigate();
  const { markWatched, toggleFavorite, userId, watchedIds, favoriteIds } = useUser();

  const isWatched = watchedIds.has(content.id);
  const isFavorite = favoriteIds.has(content.id);

  const handleClick = useCallback(() => navigate(`/detail/${content.id}`), [content.id, navigate]);

  const handleMarkWatched = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!userId) {
      navigate('/profile');
      return;
    }
    void markWatched(content.id);
  }, [content.id, markWatched, userId, navigate]);

  const handleToggleFavorite = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!userId) {
      navigate('/profile');
      return;
    }
    void toggleFavorite(content.id);
  }, [content.id, toggleFavorite, userId, navigate]);

  const statusText = content.status === 'ongoing' ? '连载中' : '已完结';
  const displayAuthor = content.actors?.length > 0 ? content.actors.slice(0, 2).join(' / ') : content.author;
  const paddingClass = size === 'large' ? 'p-4' : 'p-3';

  return (
    <div className={`content-card ${HEIGHTS[size]}`} onClick={handleClick}>
      <img src={content.cover} alt={content.title} loading="lazy" />
      <div className={`absolute inset-0 z-10 flex flex-col justify-end ${paddingClass}`}>
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

        {showReason && content.reason && (
          <div className="mb-2">
            <span className="reason-badge">推荐 · {content.reason}</span>
          </div>
        )}

        <div className="card-meta-bottom">
          <span className="hot-score">热度 {content.hotScore.toLocaleString()}</span>
          <div className="card-actions relative z-20">
            <button
              onClick={handleToggleFavorite}
              onMouseDown={event => event.stopPropagation()}
              className={`card-watched-btn ${isFavorite ? 'watched' : ''}`}
              title={isFavorite ? '取消收藏' : '收藏'}
            >
              {isFavorite ? '已藏' : '收藏'}
            </button>
            <button
              onClick={handleMarkWatched}
              onMouseDown={event => event.stopPropagation()}
              className={`card-watched-btn ${isWatched ? 'watched' : ''}`}
            >
              {isWatched ? '已看' : '标已看'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ContentCard;
