import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContentPage } from '../api';
import DashboardRankTable from '../components/dashboard/DashboardRankTable';
import DashboardShell from '../components/dashboard/DashboardShell';
import { CATEGORY_TEXT, VISIBLE_CONTENT_TYPES, type VisibleContentType } from '../constants';
import type { Content } from '../types';
import { hasBrokenText } from '../utils/contentMetrics';
import { buildRankDashboardSummary } from '../utils/rankBoard';

type ModuleState = Record<VisibleContentType, {
  items: Content[];
  loading: boolean;
  error: string;
}>;

function createModuleState(loading: boolean): ModuleState {
  const state = { items: [], loading, error: '' };
  return {
    drama: { ...state },
    novel: { ...state },
    anime: { ...state },
    comic: { ...state },
  };
}

function isDisplayableContent(content: Content) {
  const textFields = [
    content.title,
    content.summary,
    content.author,
    content.ipName,
    content.source?.label,
    content.source?.provider,
    ...(content.tags || []),
    ...(content.actors || []),
    ...(content.characters || []),
  ];
  return Boolean(String(content.title || '').trim()) && !textFields.some(hasBrokenText);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<ModuleState>(() => createModuleState(true));
  const [retryKey, setRetryKey] = useState(0);

  const reload = useCallback(() => setRetryKey(key => key + 1), []);

  useEffect(() => {
    let active = true;
    setModules(createModuleState(true));

    Promise.allSettled(
      VISIBLE_CONTENT_TYPES.map(type => getContentPage({ type, page: 1, limit: 12, sort: 'hot', searchMode: 'local' })),
    ).then((results) => {
      if (!active) return;
      const next = createModuleState(false);
      results.forEach((result, index) => {
        const type = VISIBLE_CONTENT_TYPES[index];
        if (result.status === 'fulfilled') {
          next[type] = {
            items: result.value.list.filter(isDisplayableContent),
            loading: false,
            error: '',
          };
          return;
        }
        next[type] = {
          items: [],
          loading: false,
          error: result.reason instanceof Error ? result.reason.message : '榜单加载失败',
        };
      });
      setModules(next);
    });

    return () => {
      active = false;
    };
  }, [retryKey]);

  const allItems = useMemo(
    () => VISIBLE_CONTENT_TYPES.flatMap(type => modules[type].items),
    [modules],
  );
  const summary = useMemo(() => buildRankDashboardSummary(allItems), [allItems]);

  return (
    <DashboardShell activeType="dashboard">
      <section className="dashboard-overview-hero">
        <div>
          <h1>四模块数据看板</h1>
          <p>短剧、小说、动漫、漫画统一展示播放/阅读、平台指数、搜索指数与综合分。</p>
        </div>
        <div className="dashboard-overview-stats">
          <span><strong>{summary.visibleCount}</strong>有效作品</span>
          <span><strong>{summary.sourceCount}</strong>数据来源</span>
          <span><strong>{summary.averageScore.toFixed(1)}</strong>平均综合分</span>
        </div>
      </section>

      <section className="dashboard-overview-grid">
        {VISIBLE_CONTENT_TYPES.map(type => (
          <DashboardRankTable
            key={type}
            compact
            title={`${CATEGORY_TEXT[type]}数据榜`}
            items={modules[type].items}
            loading={modules[type].loading}
            emptyTitle={modules[type].error || `${CATEGORY_TEXT[type]}暂无榜单`}
            onRetry={reload}
            onMore={() => navigate(`/${type}`)}
            onSelect={item => navigate(`/${item.type}?selected=${encodeURIComponent(item.id)}`)}
          />
        ))}
      </section>
    </DashboardShell>
  );
}