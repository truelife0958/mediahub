import { useMemo, useState } from 'react';
import type {
  AuditLogRecord,
  Content,
  ContentRevisionRecord,
  KeywordSubscription,
  KeywordSubscriptionHit,
  LeaderboardAlertsResponse,
  LeaderboardAnomaliesResponse,
  LeaderboardDiffResponse,
  LeaderboardLayerConfig,
  LeaderboardResponse,
  LeaderboardTrendResponse,
} from '../../types';
import { AdminMetricCard, AdminSection, EmptyHint, Pill } from './AdminWidgets';
import { TYPE_LABEL } from './types';

interface LeaderboardInsightsPanelProps {
  layerConfig: LeaderboardLayerConfig | null;
  selectedType: Content['type'];
  selectedLayer: 'overall' | 'new' | 'rising' | 'completed';
  leaderboard: LeaderboardResponse | null;
  trend: LeaderboardTrendResponse | null;
  diff: LeaderboardDiffResponse | null;
  alerts: LeaderboardAlertsResponse | null;
  anomalies: LeaderboardAnomaliesResponse | null;
  subscriptions: KeywordSubscription[];
  subscriptionHits: KeywordSubscriptionHit[];
  auditLogs: AuditLogRecord[];
  revisions: ContentRevisionRecord[];
  loading: boolean;
  saving: boolean;
  onTypeChange: (type: Content['type']) => void;
  onLayerChange: (layer: 'overall' | 'new' | 'rising' | 'completed') => void;
  onRefresh: () => void;
  onCapture: () => void;
  onExport: () => void;
  onCreateSubscription: (payload: { keyword: string; type?: '' | Content['type']; channel?: string; target?: string }) => void;
  onToggleSubscription: (item: KeywordSubscription) => void;
  onDeleteSubscription: (item: KeywordSubscription) => void;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

export default function LeaderboardInsightsPanel({
  layerConfig,
  selectedType,
  selectedLayer,
  leaderboard,
  trend,
  diff,
  alerts,
  anomalies,
  subscriptions,
  subscriptionHits,
  auditLogs,
  revisions,
  loading,
  saving,
  onTypeChange,
  onLayerChange,
  onRefresh,
  onCapture,
  onExport,
  onCreateSubscription,
  onToggleSubscription,
  onDeleteSubscription,
}: LeaderboardInsightsPanelProps) {
  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftType, setDraftType] = useState<'' | Content['type']>('');
  const [draftChannel, setDraftChannel] = useState<'internal' | 'webhook'>('internal');
  const [draftTarget, setDraftTarget] = useState('');

  const events = alerts?.events || [];
  const anomalyList = anomalies?.list || [];
  const topItem = leaderboard?.list?.[0] || null;
  const trendPoints = Array.isArray(trend?.timeline) ? trend.timeline.length : 0;

  const sortedSubscriptions = useMemo(
    () => [...subscriptions].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.updatedAt.localeCompare(a.updatedAt)),
    [subscriptions],
  );

  return (
    <div className="space-y-4">
      <AdminSection
        title="榜单控制台"
        description="支持总榜/新作榜/飙升榜/完结榜，提供趋势、异动、订阅、审计与修订追踪。"
        action={
          <div className="flex flex-wrap gap-2">
            <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={onRefresh} disabled={loading || saving}>刷新视图</button>
            <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={onExport} disabled={loading || saving}>导出CSV</button>
            <button className="gold-surface rounded-lg px-3 py-2 text-xs font-bold" onClick={onCapture} disabled={saving}>{saving ? '执行中...' : '立即抓取快照'}</button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-xs text-[var(--text-muted)]">
            分类
            <select value={selectedType} onChange={e => onTypeChange(e.target.value as Content['type'])} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
              {(layerConfig?.types || ['drama', 'novel', 'comic', 'anime']).map(type => (
                <option key={type} value={type}>{TYPE_LABEL[type]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--text-muted)]">
            榜单层级
            <select value={selectedLayer} onChange={e => onLayerChange(e.target.value as 'overall' | 'new' | 'rising' | 'completed')} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
              {(layerConfig?.layers || []).map(layer => (
                <option key={layer.id} value={layer.id}>{layer.name}</option>
              ))}
            </select>
          </label>
        <AdminMetricCard label="当前榜单条数" value={leaderboard?.total ?? 0} tone="cyan" />
        <AdminMetricCard label="异动事件" value={events.length} tone="warn" />
      </div>
    </AdminSection>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <AdminMetricCard label="榜首" value={topItem?.title || '-'} hint={topItem ? `${topItem.hotScore.toLocaleString('zh-CN')} 万次` : ''} tone="gold" />
        <AdminMetricCard label="趋势点位" value={trendPoints} tone="cyan" />
        <AdminMetricCard label="订阅命中" value={subscriptionHits.length} tone="green" />
        <AdminMetricCard label="异常告警" value={anomalyList.length} tone="purple" />
      </div>

      <AdminSection title="榜单异常监控" description="自动检测缺失快照、快照过期、榜单过短、热度为 0 和源连续失败。">
        {anomalyList.length ? (
          <div className="space-y-2">
            {anomalyList.slice(0, 24).map(item => (
              <div key={`${item.code}-${item.type}-${item.layer}-${item.source}-${item.message}`} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={item.severity === 'high' ? 'warn' : item.severity === 'medium' ? 'default' : 'ok'}>{item.severity}</Pill>
                  <span className="font-semibold">{TYPE_LABEL[item.type]}</span>
                  {item.layer ? <span className="text-[var(--text-muted)]">{item.layer}</span> : null}
                  {item.source ? <span className="text-[var(--text-muted)]">{item.source}</span> : null}
                  <span>{item.message}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDateTime(item.detectedAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyHint>当前未发现榜单异常。</EmptyHint>
        )}
      </AdminSection>

      <AdminSection title="榜单结果" description="当前分类与层级下的榜单快照。">
        {leaderboard?.list?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="py-2">排名</th>
                  <th>标题</th>
                  <th>热度</th>
                  <th>状态</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.list.slice(0, 20).map(item => (
                  <tr key={`${item.captureId}-${item.contentId}`} className="border-t border-[var(--border)]">
                    <td className="py-2">#{item.rank}</td>
                    <td>{item.title}</td>
                    <td>{item.hotScore.toLocaleString('zh-CN')} 万次</td>
                    <td>{item.status === 'ongoing' ? <Pill tone="ok">连载中</Pill> : <Pill>已完结</Pill>}</td>
                    <td>{formatDateTime(item.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyHint>暂无榜单数据，请先执行“立即抓取快照”。</EmptyHint>
        )}
      </AdminSection>

      <AdminSection title="榜单异动" description="展示新上榜、飙升、下滑、热度暴涨等变化。">
        {events.length ? (
          <div className="space-y-2">
            {events.slice(0, 20).map(item => (
              <div key={item.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={item.eventType.includes('up') || item.eventType.includes('new') || item.eventType.includes('spike') ? 'ok' : 'warn'}>{item.eventType}</Pill>
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-[var(--text-muted)]">{item.message}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDateTime(item.capturedAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyHint>暂无异动事件。</EmptyHint>
        )}
      </AdminSection>

      <AdminSection title="榜单对比" description="对比最新两次快照变化（新增/掉榜/位次变化）。">
        {!diff ? (
          <EmptyHint>暂无对比数据。</EmptyHint>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AdminMetricCard label="新增" value={diff.added.length} tone="green" />
            <AdminMetricCard label="掉榜" value={diff.dropped.length} tone="red" />
            <AdminMetricCard label="位次变化" value={diff.moved.length} tone="warn" />
          </div>
        )}
      </AdminSection>

      <AdminSection title="关键词订阅" description="订阅关键词后，命中内容会写入订阅命中记录。">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
          <input value={draftKeyword} onChange={e => setDraftKeyword(e.target.value)} placeholder="关键词，如：盛夏芬德拉" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          <select value={draftType} onChange={e => setDraftType(e.target.value as '' | Content['type'])} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
            <option value="">全部分类</option>
            <option value="drama">短剧</option>
            <option value="novel">小说</option>
            <option value="comic">漫画</option>
            <option value="anime">动漫</option>
          </select>
          <select value={draftChannel} onChange={e => setDraftChannel(e.target.value === 'webhook' ? 'webhook' : 'internal')} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
            <option value="internal">站内记录</option>
            <option value="webhook">Webhook</option>
          </select>
          <input value={draftTarget} onChange={e => setDraftTarget(e.target.value)} placeholder={draftChannel === 'webhook' ? 'Webhook 地址，如 https://example.com/hook' : '通知目标（可选）'} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" disabled={draftChannel !== 'webhook'} />
          <button
            className="gold-surface rounded-lg px-3 py-2 text-sm font-bold"
            onClick={() => {
              if (!draftKeyword.trim()) return;
              onCreateSubscription({ keyword: draftKeyword.trim(), type: draftType, target: draftTarget.trim(), channel: draftChannel });
              setDraftKeyword('');
              setDraftChannel('internal');
              setDraftTarget('');
            }}
          >
            新增
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {sortedSubscriptions.length ? sortedSubscriptions.map(item => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2 text-sm">
              <div className="flex items-center gap-2">
                <Pill tone={item.enabled ? 'ok' : 'default'}>{item.enabled ? '启用' : '停用'}</Pill>
                <span>{item.keyword}</span>
                <span className="text-xs text-[var(--text-muted)]">{item.type ? TYPE_LABEL[item.type] : '全部分类'}</span>
                <span className="text-xs text-[var(--text-muted)]">{item.channel === 'webhook' ? 'Webhook' : '站内记录'}</span>
              </div>
              <div className="flex gap-2">
                <button className="control-button rounded-lg px-2 py-1 text-xs" onClick={() => onToggleSubscription(item)}>{item.enabled ? '停用' : '启用'}</button>
                <button className="control-button rounded-lg px-2 py-1 text-xs" onClick={() => onDeleteSubscription(item)}>删除</button>
              </div>
            </div>
          )) : <EmptyHint>暂无订阅。</EmptyHint>}
        </div>
      </AdminSection>

      <AdminSection title="订阅命中" description="展示关键词匹配到的榜单内容。">
        {subscriptionHits.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="py-2">关键词</th>
                  <th>内容</th>
                  <th>命中字段</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {subscriptionHits.slice(0, 20).map(item => (
                  <tr key={item.id} className="border-t border-[var(--border)]">
                    <td className="py-2">{item.keyword}</td>
                    <td>{item.title}</td>
                    <td>{item.matchedField}</td>
                    <td>{formatDateTime(item.capturedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyHint>暂无命中记录。</EmptyHint>}
      </AdminSection>

      <AdminSection title="审计日志 / 修订记录" description="追踪系统配置、内容编辑、AI补齐等关键操作。">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold">审计日志</p>
            {auditLogs.length ? auditLogs.slice(0, 15).map(item => (
              <div key={item.id} className="mb-2 rounded-lg border border-[var(--border)] p-2 text-xs">
                <p className="font-semibold">{item.action}</p>
                <p className="text-[var(--text-muted)]">{item.entityType}#{item.entityId || '-'} · {formatDateTime(item.createdAt)}</p>
              </div>
            )) : <EmptyHint>暂无审计日志。</EmptyHint>}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">内容修订</p>
            {revisions.length ? revisions.slice(0, 15).map(item => (
              <div key={item.id} className="mb-2 rounded-lg border border-[var(--border)] p-2 text-xs">
                <p className="font-semibold">{item.action} · {item.contentId}</p>
                <p className="text-[var(--text-muted)]">{formatDateTime(item.createdAt)}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="rounded-lg bg-[rgba(255,255,255,0.03)] p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Before</p>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">{JSON.stringify(item.before || {}, null, 2)}</pre>
                  </div>
                  <div className="rounded-lg bg-[rgba(255,255,255,0.03)] p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">After</p>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">{JSON.stringify(item.after || {}, null, 2)}</pre>
                  </div>
                </div>
              </div>
            )) : <EmptyHint>暂无修订记录。</EmptyHint>}
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
