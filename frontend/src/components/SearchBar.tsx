import { useState, useRef, useEffect } from 'react';
import { IconSearch } from './Icons';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const MAX_SEARCH_LENGTH = 80;

function SearchBar({ value, onChange, placeholder = '本地 + AI 搜索：短剧名、主演、角色、作者、IP...' }: SearchBarProps) {
  const [input, setInput] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <form onSubmit={handleSubmit} className="relative max-w-xl">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none z-10 flex items-center">
        <IconSearch size={16} />
      </span>
      <input
        type="text"
        value={input}
        maxLength={MAX_SEARCH_LENGTH}
        aria-label="搜索内容、主演、角色、作者、IP"
        onChange={e => setInput(e.target.value.slice(0, MAX_SEARCH_LENGTH))}
        placeholder={placeholder}
        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-xl)] py-3.5 pl-12 pr-24 text-[var(--text-primary)] text-[15px] transition-all duration-200 font-[inherit] outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(232,168,56,0.08)] placeholder:text-[var(--text-muted)]"
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {hasInput && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 rounded-xl font-medium text-xs border border-[var(--border)] cursor-pointer font-[inherit] text-[var(--text-secondary)] bg-[var(--bg-card)] transition-all duration-200 hover:text-[var(--text-primary)]"
          >
            清除
          </button>
        )}
        <button
          type="submit"
          className="gold-surface px-5 py-2 rounded-xl font-semibold text-sm border-0 cursor-pointer font-[inherit] transition-all duration-200 hover:shadow-[0_4px_16px_-4px_rgba(232,168,56,0.5)]"
        >
          搜索
        </button>
      </div>
    </form>
  );
}

export default SearchBar;
