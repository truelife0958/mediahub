import { useEffect, useMemo, useState } from 'react';
import type { EditableSystemSettings, SystemSettings } from '../../types';
import {
  createSystemSettingsFormState,
  serializeSystemSettingsFormState,
  type SystemSettingsFormState,
} from './systemSettingsState';

interface SystemSettingsCardProps {
  settings: SystemSettings | null;
  saving: boolean;
  onSave: (payload: EditableSystemSettings) => void;
}

export default function SystemSettingsCard({ settings, saving, onSave }: SystemSettingsCardProps) {
  const [form, setForm] = useState<SystemSettingsFormState>(() => createSystemSettingsFormState(settings));
  const dramaSourceRouting = settings?.sourceRouting?.effective?.drama?.join(' -> ') || '-';
  const novelSourceRouting = settings?.sourceRouting?.effective?.novel?.join(' -> ') || '-';
  const comicSourceRouting = settings?.sourceRouting?.effective?.comic?.join(' -> ') || '-';
  const animeSourceRouting = settings?.sourceRouting?.effective?.anime?.join(' -> ') || '-';
  const savedState = useMemo(() => createSystemSettingsFormState(settings), [settings]);
  const savedSignature = useMemo(() => serializeSystemSettingsFormState(savedState), [savedState]);
  const dirty = serializeSystemSettingsFormState(form) !== savedSignature;
  const selectedSorts = [
    ...(form.sortHot ? ['hot'] : []),
    ...(form.sortLatest ? ['latest'] : []),
  ];
  const isIntervalMode = form.autoRefreshMode === 'interval';
  const autoRefreshSummary = isIntervalMode
    ? `实时间隔 ${form.intervalMinutes || '-'} 分钟${form.failureBackoffEnabled ? `，失败退避上限 ${form.failureBackoffMaxMinutes || '-'} 分钟` : ''}`
    : `每日 ${form.hour.padStart(2, '0')}:${form.minute.padStart(2, '0')}`;

  useEffect(() => {
    setForm(savedState);
  }, [savedState]);

  const save = () => {
    onSave({
      autoRefresh: {
        enabled: form.autoRefreshEnabled,
        mode: form.autoRefreshMode,
        intervalMinutes: Number(form.intervalMinutes),
        failureBackoffEnabled: form.failureBackoffEnabled,
        failureBackoffMultiplier: Number(form.failureBackoffMultiplier),
        failureBackoffMaxMinutes: Number(form.failureBackoffMaxMinutes),
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
      notifications: {
        webhookEnabled: form.webhookEnabled,
        webhookTimeoutMs: Number(form.webhookTimeoutMs),
        webhookRetryMaxAttempts: Number(form.webhookRetryMaxAttempts),
        webhookRetryBaseDelayMs: Number(form.webhookRetryBaseDelayMs),
      },
    });
  };

  const reset = () => {
    setForm(savedState);
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';
  const checkboxClass = 'h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-secondary)]';

  return (
    <div className="admin-card rounded-xl p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">系统设置</h3>
            {dirty && <span className="rounded-full border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">有未保存改动</span>}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">运行参数集中编辑；数据源模式保持 AI-only，不再暴露平台源配置。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="control-button rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
            onClick={reset}
            disabled={saving || !dirty}
          >
            重置改动
          </button>
          <button
            type="button"
            className="gold-surface rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
            onClick={save}
            disabled={saving || selectedSorts.length === 0 || !dirty}
          >
            {saving ? '保存中...' : '保存系统设置'}
          </button>
        </div>
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
          刷新模式
          <select
            value={form.autoRefreshMode}
            onChange={e => setForm(prev => ({ ...prev, autoRefreshMode: e.target.value === 'interval' ? 'interval' : 'daily' }))}
            className={inputClass}
          >
            <option value="daily">每日定时</option>
            <option value="interval">实时间隔</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          实时间隔（分钟）
          <input type="number" min={1} max={1440} value={form.intervalMinutes} onChange={e => setForm(prev => ({ ...prev, intervalMinutes: e.target.value }))} className={inputClass} disabled={!isIntervalMode} />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm font-semibold text-[var(--text-primary)]">
          <input type="checkbox" checked={form.failureBackoffEnabled} onChange={e => setForm(prev => ({ ...prev, failureBackoffEnabled: e.target.checked }))} className={checkboxClass} disabled={!isIntervalMode} />
          失败自动退避
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          退避倍率
          <input type="number" min={2} max={8} value={form.failureBackoffMultiplier} onChange={e => setForm(prev => ({ ...prev, failureBackoffMultiplier: e.target.value }))} className={inputClass} disabled={!isIntervalMode || !form.failureBackoffEnabled} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          退避上限（分钟）
          <input type="number" min={1} max={1440} value={form.failureBackoffMaxMinutes} onChange={e => setForm(prev => ({ ...prev, failureBackoffMaxMinutes: e.target.value }))} className={inputClass} disabled={!isIntervalMode || !form.failureBackoffEnabled} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          执行小时
          <input type="number" min={0} max={23} value={form.hour} onChange={e => setForm(prev => ({ ...prev, hour: e.target.value }))} className={inputClass} disabled={isIntervalMode} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          执行分钟
          <input type="number" min={0} max={59} value={form.minute} onChange={e => setForm(prev => ({ ...prev, minute: e.target.value }))} className={inputClass} disabled={isIntervalMode} />
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
          <input type="checkbox" checked={form.webhookEnabled} onChange={e => setForm(prev => ({ ...prev, webhookEnabled: e.target.checked }))} className={checkboxClass} />
          启用 Webhook 通知
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          Webhook 超时（毫秒）
          <input type="number" min={1000} max={30000} value={form.webhookTimeoutMs} onChange={e => setForm(prev => ({ ...prev, webhookTimeoutMs: e.target.value }))} className={inputClass} disabled={!form.webhookEnabled} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          Webhook 重试次数
          <input type="number" min={1} max={6} value={form.webhookRetryMaxAttempts} onChange={e => setForm(prev => ({ ...prev, webhookRetryMaxAttempts: e.target.value }))} className={inputClass} disabled={!form.webhookEnabled} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          Webhook 重试基础退避（毫秒）
          <input type="number" min={0} max={10000} value={form.webhookRetryBaseDelayMs} onChange={e => setForm(prev => ({ ...prev, webhookRetryBaseDelayMs: e.target.value }))} className={inputClass} disabled={!form.webhookEnabled} />
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
        <p>刷新策略：<span className="text-[var(--text-primary)]">{autoRefreshSummary}</span></p>
        <p>短剧源链路：<span className="text-[var(--text-primary)]">{dramaSourceRouting}</span></p>
        <p>小说源链路：<span className="text-[var(--text-primary)]">{novelSourceRouting}</span></p>
        <p>漫画源链路：<span className="text-[var(--text-primary)]">{comicSourceRouting}</span></p>
        <p>动漫源链路：<span className="text-[var(--text-primary)]">{animeSourceRouting}</span></p>
      </div>
    </div>
  );
}
