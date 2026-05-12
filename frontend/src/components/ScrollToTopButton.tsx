import { useState, useEffect } from 'react';

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-8 right-8 z-40 w-11 h-11 rounded-xl flex items-center justify-center border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] cursor-pointer transition-all duration-300 hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-light)] shadow-[var(--shadow-card)]"
      aria-label="回到顶部"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}
