import ApiState from './ApiState';
import ContentCard from './ContentCard';
import SkeletonCard from './SkeletonCard';
import type { Content } from '../types';

interface ContentGridProps {
  items: Content[];
  loading: boolean;
  page?: number;
  skeletonCount?: number;
  cardSize?: 'large' | 'medium' | 'small';
  keyword?: string;
  emptyTitle: string;
  emptyDesc: string;
  emptyIcon?: string;
  onRetry?: () => void;
  onItemClick?: (content: Content) => void;
}

export default function ContentGrid({
  items,
  loading,
  page = 1,
  skeletonCount = 10,
  cardSize = 'medium',
  keyword = '',
  emptyTitle,
  emptyDesc,
  emptyIcon = '·',
  onRetry,
  onItemClick,
}: ContentGridProps) {
  if (loading && page === 1) {
    return (
      <div className="content-grid">
        <SkeletonCard count={skeletonCount} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ApiState
        title={emptyIcon === '·' ? emptyTitle : `${emptyIcon} ${emptyTitle}`}
        description={emptyDesc}
        actionLabel="重试"
        onAction={onRetry}
      />
    );
  }

  return (
    <>
      {keyword && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          找到 {items.length} 条「{keyword}」相关结果
        </div>
      )}
      <div className="content-grid">
        {items.map(item => (
          <ContentCard key={item.id} content={item} size={cardSize} keyword={keyword} onClick={onItemClick} />
        ))}
      </div>
    </>
  );
}
