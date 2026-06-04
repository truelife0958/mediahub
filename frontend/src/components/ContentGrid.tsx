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
  showReason?: boolean;
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
  showReason,
  emptyTitle,
  emptyDesc,
  emptyIcon = '·',
  onRetry,
  onItemClick,
}: ContentGridProps) {
  if (loading && page === 1) {
    return (
      <div className="content-grid">
        <SkeletonCard height={cardSize === 'large' ? '320px' : '290px'} count={skeletonCount} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ApiState
        title={emptyIcon === '·' ? emptyTitle : `${emptyIcon} ${emptyTitle}`}
        description={emptyDesc}
        actionLabel="重新加载"
        onAction={onRetry}
      />
    );
  }

  return (
    <div className="content-grid">
      {items.map(item => (
        <ContentCard key={item.id} content={item} size={cardSize} showReason={showReason} onClick={onItemClick} />
      ))}
    </div>
  );
}
