import { useEffect, useState } from 'react';
import type { EditableSystemSettings, SystemSettings } from '../../types';

interface SystemSettingsCardProps {
  settings: SystemSettings | null;
  saving: boolean;
  onSave: (payload: EditableSystemSettings) => void;
}

interface SystemSettingsFormState {
  autoRefreshEnabled: boolean;
  autoRefreshRunOnStartup: boolean;
  hour: string;
  minute: string;
  pages: string;
  pageSize: string;
  sortHot: boolean;
  sortLatest: boolean;
  ttlMs: string;
  timeoutMs: string;
  retryMaxAttempts: string;
  retryBaseDelayMs: string;
  circuitBreakerFailureThreshold: string;
  circuitBreakerOpenMs: string;
  rateLimitPerSecond: string;
  rateLimitBurst: string;
}

function createFormState(settings: SystemSettings | null): SystemSettingsFormState {
  return {
    autoRefreshEnabled: Boolean(settings?.autoRefresh.enabled),
    autoRefreshRunOnStartup: Boolean(settings?.autoRefresh.runOnStartup),
    hour: String(settings?.autoRefresh.hour ?? 0),
    minute: String(settings?.autoRefresh.minute ?? 0),
    pages: String(settings?.ingestBackfill.pages ?? 1),
    pageSize: String(settings?.ingestBackfill.pageSize ?? 1),
    sortHot: Boolean(settings?.ingestBackfill.sorts?.includes('hot')),
    sortLatest: Boolean(settings?.ingestBackfill.sorts?.includes('latest')),
    ttlMs: String(settings?.cache.ttlMs ?? 15000),
    timeoutMs: String(settings?.cache.timeoutMs ?? 2000),
    retryMaxAttempts: String(settings?.cache.retryMaxAttempts ?? 2),
    retryBaseDelayMs: String(settings?.cache.retryBaseDelayMs ?? 300),
    circuitBreakerFailureThreshold: String(settings?.cache.circuitBreakerFailureThreshold ?? 5),
    circuitBreakerOpenMs: String(settings?.cache.circuitBreakerOpenMs ?? 30000),
    rateLimitPerSecond: String(settings?.cache.rateLimitPerSecond ?? 6),
    rateLimitBurst: String(settings?.cache.rateLimitBurst ?? 6),
  };
}

export default function SystemSettingsCard({ settings, saving, onSave }: SystemSettingsCardProps) {
  const [form, setForm] = useState<SystemSettingsFormState>(() => createFormState(settings));
  const dramaSourceRouting = settings?.sourceRouting?.effective?.drama?.join(' -> ') || '-';
  const novelSourceRouting = settings?.sourceRouting?.effective?.novel?.join(' -> ') || '-';
  const comicSourceRouting = settings?.sourceRouting?.effective?.comic?.join(' -> ') || '-';
  const animeSourceRouting = settings?.sourceRouting?.effective?.anime?.join(' -> ') || '-';
  const selectedSorts = [
    ...(form.sortHot ? ['hot'] : []),
    ...(form.sortLatest ? ['latest'] : []),
  ];

  useEffect(() => {
    setForm(createFormState(settings));
  }, [settings]);

  const save = () => {
    onSave({
      autoRefresh: {
        enabled: form.autoRefreshEnabled,
        hour: Number(form.hour),
        minute: Number(form.minute),
        runOnStartup: form.autoRefreshRunOnStartup,
      },
      ingestBackfill: {
        pages: Number(form.pages),
        pageSize: Number(form.pageSize),
        sorts: selectedSorts,
      },
      cache: {
        ttlMs: Number(form.ttlMs),
        timeoutMs: Number(form.timeoutMs),
        retryMaxAttempts: Number(form.retryMaxAttempts),
        retryBaseDelayMs: Number(form.retryBaseDelayMs),
        circuitBreakerFailureThreshold: Number(form.circuitBreakerFailureThreshold),
        circuitBreakerOpenMs: Number(form.circuitBreakerOpenMs),
        rateLimitPerSecond: Number(form.rateLimitPerSecond),
        rateLimitBurst: Number(form.rateLimitBurst),
      },
    });
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';
  const checkboxClass = 'h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-secondary)]';

  return (
    <div className="admin-card rounded-xl p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">系统设置</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">运行参数集中编辑；数据源模式保持 AI-only，不再暴露平台源配置。</p>
        </div>
        <button
          type="button"
          className="gold-surface rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
          onClick={save}
          disabled={saving || selectedSorts.length === 0}
        >
          {saving ? '保存中...' : '保存系统设置'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)]">
          <input type="checkbox" checked={form.autoRefreshEnabled} onChange={e => setForm(prev => ({ ...prev, autoRefreshEnabled: e.target.checked }))} className={checkboxClass} />
          自动刷新
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)]">
          <input type="checkbox" checked={form.autoRefreshRunOnStartup} onChange={e => setForm(prev => ({ ...prev, autoRefreshRunOnStartup: e.target.checked }))} className={checkboxClass} />
          启动即刷新
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          执行小时
          <input type="number" min={0} max={23} value={form.hour} onChange={e => setForm(prev => ({ ...prev, hour: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          执行分钟
          <input type="number" min={0} max={59} value={form.minute} onChange={e => setForm(prev => ({ ...prev, minute: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          补采页数
          <input type="number" min={1} max={10} value={form.pages} onChange={e => setForm(prev => ({ ...prev, pages: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          每页条数
          <input type="number" min={1} max={50} value={form.pageSize} onChange={e => setForm(prev => ({ ...prev, pageSize: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          缓存 TTL（毫秒）
          <input type="number" min={15000} value={form.ttlMs} onChange={e => setForm(prev => ({ ...prev, ttlMs: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          上游超时（毫秒）
          <input type="number" min={2000} value={form.timeoutMs} onChange={e => setForm(prev => ({ ...prev, timeoutMs: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          超时重试次数
          <input type="number" min={1} max={5} value={form.retryMaxAttempts} onChange={e => setForm(prev => ({ ...prev, retryMaxAttempts: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          重试基础退避（毫秒）
          <input type="number" min={0} max={5000} value={form.retryBaseDelayMs} onChange={e => setForm(prev => ({ ...prev, retryBaseDelayMs: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          熔断失败阈值
          <input type="number" min={1} max={50} value={form.circuitBreakerFailureThreshold} onChange={e => setForm(prev => ({ ...prev, circuitBreakerFailureThreshold: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          熔断开启时间（毫秒）
          <input type="number" min={1000} max={300000} value={form.circuitBreakerOpenMs} onChange={e => setForm(prev => ({ ...prev, circuitBreakerOpenMs: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          每秒限流
          <input type="number" min={1} max={100} value={form.rateLimitPerSecond} onChange={e => setForm(prev => ({ ...prev, rateLimitPerSecond: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          限流突发
          <input type="number" min={1} max={200} value={form.rateLimitBurst} onChange={e => setForm(prev => ({ ...prev, rateLimitBurst: e.target.value }))} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)]">
          <input type="checkbox" checked={form.sortHot} onChange={e => setForm(prev => ({ ...prev, sortHot: e.target.checked }))} className={checkboxClass} />
          排序：热度
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)]">
          <input type="checkbox" checked={form.sortLatest} onChange={e => setForm(prev => ({ ...prev, sortLatest: e.target.checked }))} className={checkboxClass} />
          排序：最新
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 border-t border-[var(--border)]/70 pt-4 text-sm text-[var(--text-secondary)] md:grid-cols-2">
        <p data-testid="admin-setting-source-mode" className="text-[var(--text-muted)]">数据获取模式：<span className="text-[var(--text-primary)]">仅 AI 模型</span></p>
        <p>短剧源链路：<span className="text-[var(--text-primary)]">{dramaSourceRouting}</span></p>
        <p>小说源链路：<span className="text-[var(--text-primary)]">{novelSourceRouting}</span></p>
        <p>漫画源链路：<span className="text-[var(--text-primary)]">{comicSourceRouting}</span></p>
        <p>动漫源链路：<span className="text-[var(--text-primary)]">{animeSourceRouting}</span></p>
      </div>
    </div>
  );
}
