import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getTopicContents, getEntityProfile } from '../api';
import { useSharedUser } from '../hooks/useSharedUser';
import Header from '../components/Header';
import SectionHeader from '../components/SectionHeader';
import ContentGrid from '../components/ContentGrid';
import ApiState from '../components/ApiState';
import { CATEGORY_TEXT } from '../constants';
import type { Content, EntityProfileResponse, TopicField } from '../types';

const FIELD_LABEL: Record<TopicField, string> = {
  actor: '演员专题',
  character: '角色专题',
  author: '作者专题',
  ip: 'IP 专题',
};

const VALID_TYPES: Content['type'][] = ['drama', 'novel', 'comic', 'anime'];

export default function Topics() {
  const params = useParams<{ field: string; value: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isValidField = params.field === 'actor' || params.field === 'character' || params.field === 'author' || params.field === 'ip';
  const field = isValidField ? params.field : 'ip';
  const topicValue = decodeURIComponent(params.value || '');
  const initialType = searchParams.get('type');
  const normalizedInitialType = initialType === 'drama' || initialType === 'novel' || initialType === 'comic' || initialType === 'anime'
    ? initialType
    : '';
  const { user } = useSharedUser();
  const [items, setItems] = useState<Content[]>([]);
  const [entityProfile, setEntityProfile] = useState<EntityProfileResponse | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [typeFilter, setTypeFilter] = useState<'' | Content['type']>(normalizedInitialType);
  const [minHotScore, setMinHotScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isValidField) return;
    const controller = new AbortController();
    getEntityProfile(field, topicValue, { signal: controller.signal })
      .then(setEntityProfile)
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setEntityProfile(null);
      });
    return () => { controller.abort(); };
  }, [field, isValidField, topicValue]);

  useEffect(() => {
    if (!isValidField) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
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
    }, { signal: controller.signal })
      .then((data) => {
        if (page === 1) {
          setItems(data.list);
        } else {
          setItems(prev => [...prev, ...data.list.filter(item => !prev.some(existing => existing.id === item.id))]);
        }
        setTotal(data.pagination.total);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '专题加载失败');
        if (page === 1) setItems([]);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => { controller.abort(); };
  }, [field, isValidField, topicValue, page, sort, typeFilter, minHotScore]);

  const hasMore = items.length < total;
  const title = useMemo(() => `${FIELD_LABEL[field]} · ${topicValue}`, [field, topicValue]);

  if (!isValidField) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
        <div className="app-backdrop" />
        <Header user={user} />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-12 relative">
          <ApiState
            title="专题类型不存在"
            description="专题只支持演员、角色、作者和 IP 四种维度。"
            actionLabel="返回短剧"
            onAction={() => navigate('/drama', { replace: true })}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        <section className="section-shell">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader title={title} subtitle="围绕同一实体聚合同类内容，方便连续追踪。" />
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

          {/* 实体画像 */}
          {entityProfile && (
            <div className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-black">{entityProfile.value}</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">实体主页 · 共关联 {entityProfile.total} 条内容</p>
                  {entityProfile.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entityProfile.tags.slice(0, 10).map(tag => (
                        <span key={tag.name} className="gold-surface rounded-md px-2 py-0.5 text-xs font-semibold">{tag.name} · {tag.count}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 shrink-0">
                  {VALID_TYPES.map(type => (
                    <div key={type} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-center">
                      <p className="text-[11px] text-[var(--text-muted)]">{CATEGORY_TEXT[type]}</p>
                      <p className="mt-0.5 text-lg font-bold">{entityProfile.groups[type]?.length || 0}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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
              {total > 0 && items.length > 0 && (
                <p className="text-center mt-3 text-xs text-[var(--text-muted)]">
                  已显示 {items.length} / {total} 条
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
