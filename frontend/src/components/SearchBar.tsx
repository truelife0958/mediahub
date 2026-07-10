import { useState, useRef, useEffect } from 'react';
import { IconSearch } from './Icons';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  variant?: 'default' | 'compact';
}

const MAX_SEARCH_LENGTH = 80;

function SearchBar({
  value,
  onChange,
  placeholder = '搜索标题、演员、作者、IP、分类...',
  variant = 'default',
}: SearchBarProps) {
  const [input, setInput] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompact = variant === 'compact';

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = input.trim();
      if (trimmed !== value) {
        onChange(trimmed);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, value, onChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = input.trim().slice(0, MAX_SEARCH_LENGTH);
    setInput(trimmed);
    onChange(trimmed);
  };

  const handleClear = () => {
    setInput('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange('');
  };

  const hasInput = input.length > 0;

  return (
    <form onSubmit={handleSubmit} className={`relative ${isCompact ? 'w-full max-w-[320px]' : 'max-w-xl'}`}>
      <span className={`absolute top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center ${isCompact ? 'left-3 text-slate-400' : 'left-4 text-[var(--text-muted)]'}`}>
        <IconSearch size={isCompact ? 14 : 16} />
      </span>
      <input
        type="text"
        value={input}
        maxLength={MAX_SEARCH_LENGTH}
        aria-label="搜索内容、主演、角色、作者、IP"
        onChange={e => setInput(e.target.value.slice(0, MAX_SEARCH_LENGTH))}
        placeholder={placeholder}
        className={isCompact
          ? 'w-full rounded-xl border border-[#d9e1ed] bg-white py-2.5 pl-9 pr-20 text-[13px] text-slate-900 transition-all duration-200 font-[inherit] outline-none focus:border-[#fb923c] focus:shadow-[0_0_0_3px_rgba(251,146,60,0.12)] placeholder:text-slate-400'
          : 'w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-xl)] py-3.5 pl-12 pr-24 text-[var(--text-primary)] text-[15px] transition-all duration-200 font-[inherit] outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(232,168,56,0.08)] placeholder:text-[var(--text-muted)]'}
      />
      <div className={`absolute top-1/2 -translate-y-1/2 flex items-center ${isCompact ? 'right-1 gap-1' : 'right-1.5 gap-1.5'}`}>
        {hasInput && (
          <button
            type="button"
            onClick={handleClear}
            className={isCompact
              ? 'px-2 py-1.5 rounded-lg border border-[#e2e8f0] cursor-pointer font-[inherit] text-[11px] font-medium text-slate-500 bg-slate-50 transition-all duration-200 hover:text-slate-900'
              : 'px-3 py-2 rounded-xl font-medium text-xs border border-[var(--border)] cursor-pointer font-[inherit] text-[var(--text-secondary)] bg-[var(--bg-card)] transition-all duration-200 hover:text-[var(--text-primary)]'}
          >
            清除
          </button>
        )}
        <button
          type="submit"
          className={isCompact
            ? 'gold-surface px-3.5 py-1.5 rounded-lg font-semibold text-xs border-0 cursor-pointer font-[inherit] transition-all duration-200 hover:shadow-[0_4px_16px_-4px_rgba(232,168,56,0.5)]'
            : 'gold-surface px-5 py-2 rounded-xl font-semibold text-sm border-0 cursor-pointer font-[inherit] transition-all duration-200 hover:shadow-[0_4px_16px_-4px_rgba(232,168,56,0.5)]'}
        >
          搜索
        </button>
      </div>
    </form>
  );
}

export default SearchBar;
