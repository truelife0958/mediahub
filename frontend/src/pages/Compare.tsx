import { useEffect, useMemo, useState } from 'react';
import { compareContents } from '../api';
import { useSharedUser } from '../hooks/useSharedUser';
import ApiState from '../components/ApiState';
import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import { CATEGORY_COLORS, CATEGORY_TEXT } from '../constants';
import type { CompareResponse, Content } from '../types';
import { formatHotScore } from '../utils/hotScore';

function readCompareIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem('mediahub_compare_ids') || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 4) : [];
  } catch {
    return [];
  }
}

function writeCompareIds(ids: string[]) {
  try {
    window.localStorage.setItem('mediahub_compare_ids', JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export default function Compare() {
  const { user } = useSharedUser();
  const [ids, setIds] = useState<string[]>(() => readCompareIds());
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    if (ids.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    compareContents(ids, { signal: controller.signal })
      .then(setData)
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '对比加载失败');
      })
      .finally(() => setLoading(false));
    return () => { controller.abort(); };
  }, [ids]);

  const list = useMemo(() => data?.list || [], [data?.list]);
  const missingCount = Math.max(0, ids.length - list.length);
  const sharedTags = useMemo(() => {
    if (list.length < 2) return [];
    const [first, ...rest] = list.map(item => new Set(item.tags || []));
    return [...first].filter(tag => rest.every(set => set.has(tag)));
  }, [list]);

  const removeItem = (content: Content) => {
    const next = ids.filter(id => id !== content.id);
    writeCompareIds(next);
    setIds(next);
  };

  const clearAll = () => {
    try { window.localStorage.removeItem('mediahub_compare_ids'); } catch { /* ignore */ }
    setIds([]);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header user={user} />
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        <section className="section-shell">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <SectionHeader title="内容对比" subtitle="对比 2-4 个作品的热度、状态和标签差异。" />
            {ids.length > 0 && (
              <button
                className="control-button rounded-lg px-4 py-2 text-sm font-semibold"
                onClick={clearAll}
              >
                清空对比
              </button>
            )}
          </div>

          {error ? (
            <ApiState title="对比暂不可用" description={error} onAction={() => setIds(readCompareIds())} />
          ) : loading ? (
            <ApiState title="对比加载中" description="正在读取对比内容。" />
          ) : list.length === 0 ? (
            <ApiState
              title={ids.length > 0 ? '对比内容已失效' : '还没有对比内容'}
              description={ids.length > 0 ? '本地对比列表中的内容暂未入库或已不可用，清空后可重新加入。' : '进入详情页点击加入对比，可同时比较 2-4 个作品。'}
              actionLabel={ids.length > 0 ? '清空失效项' : undefined}
              onAction={ids.length > 0 ? clearAll : undefined}
            />
          ) : (
            <div className="space-y-5">
              {missingCount > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm text-[var(--text-secondary)]">
                  已自动忽略 {missingCount} 个暂未入库或失效的对比项
                </div>
              )}

              {/* 对比卡片 */}
              <div className={`grid gap-3 ${list.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : list.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
                {list.map(item => (
                  <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md text-white" style={{ background: CATEGORY_COLORS[item.type] }}>
                        {CATEGORY_TEXT[item.type]}
                      </span>
                      <button className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-secondary)] transition-colors" onClick={() => removeItem(item)}>移除</button>
                    </div>
                    <h3 className="line-clamp-2 text-lg font-bold mb-2">{item.title}</h3>
                    <p className="text-sm text-[var(--accent-primary)] font-semibold">{formatHotScore(item.hotScore, item.heatMetric)}</p>
                    <p className="mt-1.5 text-xs text-[var(--text-muted)]">{item.status === 'ongoing' ? '连载中' : '已完结'}{item.ipName ? ` · ${item.ipName}` : ''}</p>
                    {item.summary && <p className="mt-2 line-clamp-2 text-xs text-[var(--text-secondary)]">{item.summary}</p>}
                  </article>
                ))}
              </div>

              {/* 对比表格 */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <h3 className="mb-3 text-base font-semibold">关键差异</h3>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-left text-sm min-w-[400px]">
                    <thead className="text-xs text-[var(--text-muted)]">
                      <tr>
                        <th className="py-2 pr-4">作品</th>
                        <th className="py-2 pr-4">分类</th>
                        <th className="py-2 pr-4">热度</th>
                        <th className="py-2 pr-4">状态</th>
                        <th className="py-2 pr-4">标签</th>
                        <th className="py-2">主创</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.metrics.map(row => (
                        <tr key={row.id} className="border-t border-[var(--border)]">
                          <td className="py-2.5 pr-4 font-medium">{row.title}</td>
                          <td className="py-2.5 pr-4">{CATEGORY_TEXT[row.type]}</td>
                          <td className="py-2.5 pr-4">{formatHotScore(row.hotScore, row.heatMetric)}</td>
                          <td className="py-2.5 pr-4">{row.status === 'ongoing' ? '连载中' : '已完结'}</td>
                          <td className="py-2.5 pr-4">{row.tagCount}</td>
                          <td className="py-2.5">{row.actorCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sharedTags.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)] mb-2">共同标签</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sharedTags.map(tag => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]">#{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
