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
    <section className="rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.7)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-2">
            <span
              className="rounded-md px-2 py-1 text-[10px] font-black tracking-[0.08em] text-white"
              style={{ background: CATEGORY_COLORS[type] }}
            >
              {CATEGORY_TEXT[type]}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Hot Now</span>
          </div>
          <h3 className="text-base font-bold tracking-[-0.02em]">{CATEGORY_TEXT[type]}热门榜</h3>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/leaderboards/${type}?layer=${layerId}`)}
          className="text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {layerLabel} · 查看更多
        </button>
      </div>

      {list.length > 0 ? (
        <div className="space-y-2">
          {list.map(item => (
            <button
              key={item.contentId}
              type="button"
              onClick={() => navigate(`/detail/${item.contentId}`)}
              className="flex w-full items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
            >
              <span className="min-w-8 text-lg font-black leading-none text-[var(--accent-primary)]">#{item.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatHotScoreShort(item.hotScore, item.heatMetric)}</span>
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
