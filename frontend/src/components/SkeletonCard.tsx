export default function SkeletonCard({ count = 1 }: { height?: string; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton-card"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          {/* Tag bar */}
          <div className="flex items-center gap-1.5 mb-2.5">
            <div className="skeleton rounded-md" style={{ width: '36px', height: '18px' }} />
            <div className="skeleton rounded" style={{ width: '28px', height: '16px' }} />
          </div>
          {/* Title lines */}
          <div className="skeleton rounded mb-1.5" style={{ width: '85%', height: '16px' }} />
          <div className="skeleton rounded mb-2" style={{ width: '60%', height: '16px' }} />
          {/* Author line */}
          <div className="skeleton rounded mb-auto" style={{ width: '45%', height: '12px' }} />
          {/* Summary lines */}
          <div className="skeleton rounded mb-1" style={{ width: '100%', height: '12px' }} />
          <div className="skeleton rounded mb-3" style={{ width: '75%', height: '12px' }} />
          {/* Bottom bar */}
          <div className="skeleton rounded" style={{ width: '60px', height: '14px' }} />
        </div>
      ))}
    </>
  );
}
