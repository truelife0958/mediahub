import { useState, useEffect } from 'react';

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-40 w-10 h-10 rounded-xl flex items-center justify-center border border-[var(--border)] bg-[var(--bg-card)]/90 text-[var(--text-secondary)] cursor-pointer transition-all duration-300 hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-light)] hover:-translate-y-0.5 shadow-[var(--shadow-card)]"
      style={{ backdropFilter: 'blur(8px)' }}
      aria-label="回到顶部"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}
