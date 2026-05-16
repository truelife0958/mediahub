import { useState, useCallback } from 'react';
import { useCategories, useContents, useRecommendations } from '../api';
import ContentGrid from '../components/ContentGrid';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import SectionHeader from '../components/SectionHeader';
import ApiState from '../components/ApiState';
import type { Category, Content } from '../types';

function CategoryTabs({
  categories,
  active,
  onChange,
}: {
  categories: Category[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`control-button relative whitespace-nowrap px-4 py-2 rounded-lg font-medium text-sm inline-flex items-center gap-1.5 cursor-pointer ${active === cat.id ? 'is-active' : ''}`}
        >
          <span className="text-base">{cat.icon}</span>
          <span>{cat.name}</span>
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [activeType, setActiveType] = useState<Content['type']>('drama');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'hot' | 'latest'>('hot');
  const [retryKey, setRetryKey] = useState(0);

  const { categories, error: categoryError } = useCategories(retryKey);
  const {
    contents,
    total,
    loading: contentLoading,
    error: contentError,
  } = useContents(activeType, page, keyword, sort, retryKey);
  const {
    recommendations,
    loading: recLoading,
    error: recError,
  } = useRecommendations(activeType, retryKey);

  const hasMore = contents.length < total;

  const handleTypeChange = useCallback((type: string) => {
    setActiveType(type as Content['type']);
    setPage(1);
    setKeyword('');
    setSort('hot');
  }, []);

  const handleLoadMore = useCallback(() => {
    setPage(prev => prev + 1);
  }, []);

  const handleKeywordChange = useCallback((value: string) => {
    setKeyword(value);
    setPage(1);
  }, []);

  const handleRetry = useCallback(() => {
    setPage(1);
    setRetryKey(key => key + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />

      <Header>
        <SearchBar value={keyword} onChange={handleKeywordChange} />
      </Header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        {!keyword && (
          <section className="section-shell mb-10">
            <SectionHeader title="为你推荐" subtitle="基于热度、相似 IP 与近期更新综合排序" />
            {recError ? (
              <ApiState
                title="推荐源暂不可用"
                description={recError}
                onAction={handleRetry}
              />
            ) : (
              <ContentGrid
                items={recommendations.slice(0, 5)}
                loading={recLoading}
                skeletonCount={5}
                cardSize="large"
                showReason
                emptyTitle="暂无推荐内容"
                emptyDesc="推荐数据暂未返回，换个分类或稍后重试。"
                emptyIcon="推荐"
                onRetry={handleRetry}
              />
            )}
          </section>
        )}

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <SectionHeader
              title={keyword ? '搜索结果' : '热门内容'}
              subtitle={keyword ? '按关键词匹配标题、人物与 IP 线索' : '优先展示当前分类的高热度内容'}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSort('hot');
                  setPage(1);
                }}
                className={`control-button px-3 py-1.5 rounded-lg text-xs cursor-pointer ${sort === 'hot' ? 'is-active' : ''}`}
              >
                热度
              </button>
              <button
                onClick={() => {
                  setSort('latest');
                  setPage(1);
                }}
                className={`control-button px-3 py-1.5 rounded-lg text-xs cursor-pointer ${sort === 'latest' ? 'is-active' : ''}`}
              >
                最新
              </button>
            </div>
          </div>

          <CategoryTabs categories={categories} active={activeType} onChange={handleTypeChange} />

          {(categoryError || contentError) && (
            <div className="mb-4">
              <ApiState
                title={categoryError ? '分类源暂不可用' : '内容源暂不可用'}
                description={categoryError || contentError || '数据源暂不可用，请稍后重试。'}
                onAction={handleRetry}
              />
            </div>
          )}

          {keyword && (
            <div className="mb-5 flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">关键词</span>
              <span className="gold-surface px-2.5 py-1 rounded-md text-xs font-semibold">
                {keyword}
              </span>
              <button
                onClick={() => {
                  setKeyword('');
                  setPage(1);
                }}
                className="px-3 py-1.5 text-xs rounded-md bg-transparent text-[var(--text-secondary)] border-0 cursor-pointer hover:text-[var(--text-primary)]"
              >
                清空筛选
              </button>
            </div>
          )}

          {contentError ? null : (
            <>
              <ContentGrid
                items={contents}
                loading={contentLoading}
                page={page}
                emptyTitle="没有找到相关内容"
                emptyDesc="试试其他关键词或分类，或稍后重试。"
                onRetry={handleRetry}
              />

              {hasMore && (
                <div className="text-center mt-7">
                  <button
                    onClick={handleLoadMore}
                    disabled={contentLoading}
                    className="px-7 py-2.5 rounded-xl font-medium text-sm border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer transition-all duration-200 hover:bg-[var(--bg-card-hover)] disabled:opacity-60"
                  >
                    {contentLoading ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}

              {total > 0 && (
                <p className="text-center mt-3 text-xs text-[var(--text-muted)]">
                  已显示 {contents.length} / {total} 条
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
