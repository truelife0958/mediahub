import type { SourceHealth, SourceRoutingSettings } from '../../types';
import { TYPE_OPTIONS } from './types';

interface SourceRoutingSectionProps {
  routing: SourceRoutingSettings | null;
  sourceHealth: SourceHealth[];
  loadingHealth: boolean;
  onRefreshHealth: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  ai_search: 'AI 热门检索',
  'ai-search': 'AI 热门检索',
};

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] || source;
}

function chainLabel(chain: string[]) {
  if (!Array.isArray(chain) || chain.length === 0) return '-';
  return chain.map(sourceLabel).join(' -> ');
}

export default function SourceRoutingSection({
  routing,
  sourceHealth,
  loadingHealth,
  onRefreshHealth,
}: SourceRoutingSectionProps) {
  const healthByKey = new Map(sourceHealth.map(item => [`${item.type}:${item.source}`, item]));
  const expectedHealthKeys = new Set<string>();
  const expectedHealthRows = TYPE_OPTIONS.flatMap(item => {
    const sources = routing?.effective?.[item.id] || routing?.supported?.[item.id] || ['ai_search'];
    return (sources.length ? sources : ['ai_search']).map(source => {
      const key = `${item.id}:${source}`;
      expectedHealthKeys.add(key);
      return {
        ...(healthByKey.get(key) || {
          type: item.id,
          source,
          attempts: 0,
          successes: 0,
          emptyHits: 0,
          failures: 0,
          rateLimited: 0,
          consecutiveFailures: 0,
          ewmaLatencyMs: 0,
          score: 0,
          lastStatus: 'unknown' as const,
          lastError: null,
          updatedAt: '',
        }),
        sampled: healthByKey.has(key),
      };
    });
  });
  const extraHealthRows = sourceHealth
    .filter(item => !expectedHealthKeys.has(`${item.type}:${item.source}`))
    .map(item => ({ ...item, sampled: true }));
  const healthRows = [...expectedHealthRows, ...extraHealthRows];

  return (
    <section className="admin-panel rounded-xl p-4 mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-[-0.01em]">AI 路由与健康</h3>
        <button
          onClick={onRefreshHealth}
          disabled={loadingHealth}
          className="control-button px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loadingHealth ? '刷新中...' : '刷新健康状态'}
        </button>
      </div>

      <p className="mb-4 text-xs text-[var(--text-muted)]">
        当前所有分类已固定使用 AI 热门检索，不再提供平台 API 源切换。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {TYPE_OPTIONS.map(item => {
          const type = item.id;
          const supported = routing?.supported?.[type] || routing?.defaults?.[type] || [];
          const effective = routing?.effective?.[type] || [];

          return (
            <div key={type} className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--border)]/80">
              <div className="flex items-center justify-between gap-2 mb-2">
                <strong className="text-[var(--text-primary)]">{item.label}</strong>
                <span className="text-xs text-[var(--text-muted)]">支持源：{supported.map(sourceLabel).join(', ') || '-'}</span>
              </div>
              <p
                className="text-xs text-[var(--text-muted)] mb-2"
                data-testid={`admin-source-routing-effective-${type}`}
              >
                当前链路：{chainLabel(effective)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="py-2 pr-3">分类</th>
              <th className="py-2 pr-3">数据源</th>
              <th className="py-2 pr-3">健康分</th>
              <th className="py-2 pr-3">成功/失败</th>
              <th className="py-2 pr-3">限流</th>
              <th className="py-2 pr-3">EWMA 延迟</th>
              <th className="py-2 pr-3">最近状态</th>
              <th className="py-2">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {healthRows.map(item => (
              <tr key={`${item.type}:${item.source}`} className="border-b border-[var(--border)]/50">
                <td className="py-2 pr-3">{item.type}</td>
                <td className="py-2 pr-3">{sourceLabel(item.source)}</td>
                <td className="py-2 pr-3" data-testid={`admin-source-health-score-${item.type}-${item.source}`}>
                  {item.sampled ? item.score : '未采样'}
                </td>
                <td className="py-2 pr-3">{item.successes}/{item.failures}</td>
                <td className="py-2 pr-3">{item.rateLimited}</td>
                <td className="py-2 pr-3">{item.ewmaLatencyMs || 0} ms</td>
                <td className="py-2 pr-3">{item.sampled ? item.lastStatus : '未采样'}</td>
                <td className="py-2">
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
