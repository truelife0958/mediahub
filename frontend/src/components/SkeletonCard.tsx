export default function SkeletonCard({ height = '280px', count = 1 }: { height?: string; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton rounded-2xl" style={{ height }} />
      ))}
    </>
  );
}
