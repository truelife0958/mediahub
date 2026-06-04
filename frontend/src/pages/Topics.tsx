import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTopicContents, getCurrentUser } from '../api';
import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import ContentGrid from '../components/ContentGrid';
import ApiState from '../components/ApiState';
import type { Content, TopicField, UserProfile } from '../types';

const FIELD_LABEL: Record<TopicField, string> = {
  actor: '演员专题',
  author: '作者专题',
  ip: 'IP 专题',
};

export default function Topics() {
  const params = useParams<{ field: string; value: string }>();
  const field = (params.field === 'actor' || params.field === 'author' || params.field === 'ip') ? params.field : 'ip';
  const topicValue = decodeURIComponent(params.value || '');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [typeFilter, setTypeFilter] = useState<'' | Content['type']>('');
  const [minHotScore, setMinHotScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getTopicContents({
      field,
      value: topicValue,
      type: typeFilter,
      page,
      limit: 20,
      sort,
      minHotScore,
    })
      .then((data) => {
        if (!active) return;
        if (page === 1) {
          setItems(data.list);
        } else {
          setItems(prev => [...prev, ...data.list.filter(item => !prev.some(existing => existing.id === item.id))]);
        }
        setTotal(data.pagination.total);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : '专题加载失败');
        if (page === 1) setItems([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [field, topicValue, page, sort, typeFilter, minHotScore]);

  const hasMore = items.length < total;
  const title = useMemo(() => `${FIELD_LABEL[field]} · ${topicValue}`, [field, topicValue]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        <section className="section-shell">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader title={title} subtitle="围绕同一演员、作者或 IP 聚合同类内容，方便连续追踪。"/>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value as '' | Content['type']);
                  setPage(1);
                }}
                className="control-button rounded-lg px-3 py-2 text-xs font-semibold"
              >
                <option value="">全部分类</option>
                <option value="drama">短剧</option>
                <option value="novel">小说</option>
                <option value="comic">漫画</option>
                <option value="anime">动漫</option>
              </select>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value === 'latest' ? 'latest' : 'hot');
                  setPage(1);
                }}
                className="control-button rounded-lg px-3 py-2 text-xs font-semibold"
              >
                <option value="hot">按热度</option>
                <option value="latest">按最新</option>
              </select>
              <select
                value={String(minHotScore)}
                onChange={(event) => {
                  setMinHotScore(Number(event.target.value) || 0);
                  setPage(1);
                }}
                className="control-button rounded-lg px-3 py-2 text-xs font-semibold"
              >
                <option value="0">不限热度</option>
                <option value="1000">1000+</option>
                <option value="5000">5000+</option>
                <option value="10000">10000+</option>
              </select>
            </div>
          </div>

          {error ? (
            <ApiState title="专题暂不可用" description={error} onAction={() => setPage(1)} />
          ) : (
            <>
              <ContentGrid
                items={items}
                loading={loading}
                emptyTitle="暂无专题内容"
                emptyDesc="当前条件下还没有命中内容。"
              />
              {hasMore && !loading && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setPage(prev => prev + 1)}
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
