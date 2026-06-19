import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORY_COLORS, CATEGORY_TEXT } from '../constants';
import type { Content, LeaderboardResponse } from '../types';
import { formatHotScoreShort } from '../utils/hotScore';

interface LeaderboardStripProps {
  type: Content['type'];
  leaderboard: LeaderboardResponse | null;
  layerLabel?: string;
  layerId?: 'overall' | 'new' | 'rising' | 'completed';
}

export default function LeaderboardStrip({
  type,
  leaderboard,
  layerLabel = '总榜',
  layerId = 'overall',
}: LeaderboardStripProps) {
  const navigate = useNavigate();
  const list = useMemo(() => leaderboard?.list?.slice(0, 5) || [], [leaderboard]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-white"
              style={{ background: CATEGORY_COLORS[type] }}
            >
              {CATEGORY_TEXT[type]}
            </span>
            <span className="text-[11px] font-medium text-[var(--text-muted)]">{layerLabel}</span>
          </div>
          <h3 className="text-sm font-bold tracking-[-0.01em]">{CATEGORY_TEXT[type]}热门榜</h3>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/leaderboards/${type}?layer=${layerId}`)}
          className="text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] whitespace-nowrap"
        >
          查看全部 →
        </button>
      </div>

      {list.length > 0 ? (
        <div className="space-y-1.5">
          {list.map(item => (
            <button
              key={item.contentId}
              type="button"
              onClick={() => navigate(`/detail/${item.contentId}`)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
            >
              <span className="min-w-7 text-base font-black leading-none text-[var(--accent-primary)]">#{item.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{item.title}</span>
                <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{formatHotScoreShort(item.hotScore, item.heatMetric)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
          暂无榜单快照
        </div>
      )}
    </section>
  );
}
