import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getLeaderboard } from '../api';
import ApiState from '../components/ApiState';
import ContentGrid from '../components/ContentGrid';
import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import type { Content } from '../types';

const VALID_TYPES: Content['type'][] = ['drama', 'novel', 'comic', 'anime'];
const TYPE_LABEL: Record<Content['type'], string> = {
  drama: '短剧',
  novel: '小说',
  comic: '漫画',
  anime: '动漫',
};

const LAYER_OPTIONS = [
  { id: 'overall', label: '总榜' },
  { id: 'new', label: '新作榜' },
  { id: 'rising', label: '飙升榜' },
  { id: 'completed', label: '完结榜' },
] as const;

export default function Leaderboards() {
  const params = useParams<{ type: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = VALID_TYPES.includes(params.type as Content['type']) ? (params.type as Content['type']) : 'drama';
  const initialLayer = searchParams.get('layer');
  const [layer, setLayer] = useState<'overall' | 'new' | 'rising' | 'completed'>(
    initialLayer === 'new' || initialLayer === 'rising' || initialLayer === 'completed' ? initialLayer : 'overall',
  );
  const [items, setItems] = useState<Content[]>([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [captureId, setCaptureId] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setSearchParams({ layer });
  }, [layer, setSearchParams]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getLeaderboard({ type, layer })
      .then((data) => {
        if (!active) return;
        const mapped: Content[] = data.list.map(item => ({
          id: item.contentId,
          title: item.title,
          cover: '',
          summary: '',
          type,
          tags: item.tags || [],
          actors: [],
          author: '',
          ipName: item.title,
          status: item.status,
          hotScore: item.hotScore,
          heatMetric: item.heatMetric,
          createdAt: item.capturedAt,
          updatedAt: item.capturedAt,
          source: { provider: 'leaderboard', label: 'Leaderboard Snapshot', url: item.sourceUrl || '' },
        }));
        setItems(mapped);
        setVisibleCount(12);
        setCaptureId(data.captureId || '');
        setCapturedAt(data.list[0]?.capturedAt || '');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : '榜单加载失败');
        setItems([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [layer, retryKey, type]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  function exportCsv() {
    const query = new URLSearchParams({
      type,
      layer,
      format: 'csv',
      ...(captureId ? { captureId } : {}),
    });
    window.open(`/api/leaderboards/export?${query.toString()}`, '_blank');
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        <section className="section-shell mb-8">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader title={`${TYPE_LABEL[type]}榜单`} subtitle="支持总榜、新作榜、飙升榜、完结榜切换，展示完整榜单内容。" />
            <div className="flex flex-wrap items-center gap-2">
              {LAYER_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLayer(option.id)}
                  className={`control-button rounded-lg px-3 py-1.5 text-xs font-semibold ${layer === option.id ? 'is-active' : ''}`}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                onClick={exportCsv}
                className="control-button rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                导出 CSV
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>当前条数：{items.length}</span>
            <span>最近快照：{capturedAt ? new Date(capturedAt).toLocaleString('zh-CN') : '-'}</span>
          </div>

          {error ? (
            <ApiState
              title="榜单暂不可用"
              description={error}
              onAction={() => setRetryKey(key => key + 1)}
            />
          ) : (
            <>
              <ContentGrid
                items={visibleItems}
                loading={loading}
                emptyTitle="暂无榜单内容"
                emptyDesc="当前榜单还没有抓到可展示的数据。"
                onRetry={() => setRetryKey(key => key + 1)}
              />
              {hasMore && !loading && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(count => Math.min(count + 12, items.length))}
                    className="control-button rounded-xl px-5 py-2 text-sm font-semibold"
                  >
                    加载更多
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
