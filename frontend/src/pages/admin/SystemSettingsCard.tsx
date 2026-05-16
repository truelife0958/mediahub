import type { SystemSettings } from '../../types';

interface SystemSettingsCardProps {
  settings: SystemSettings | null;
}

export default function SystemSettingsCard({ settings }: SystemSettingsCardProps) {
  const autoRefreshText = settings?.autoRefresh.enabled ? '启用' : '禁用';
  const runOnStartupText = settings?.autoRefresh.runOnStartup ? '是' : '否';
  const dramaSourceRouting = settings?.sourceRouting?.effective?.drama?.join(' -> ') || '-';
  const novelSourceRouting = settings?.sourceRouting?.effective?.novel?.join(' -> ') || '-';
  const comicSourceRouting = settings?.sourceRouting?.effective?.comic?.join(' -> ') || '-';
  const animeSourceRouting = settings?.sourceRouting?.effective?.anime?.join(' -> ') || '-';

  return (
    <div className="admin-card rounded-xl p-4">
      <h3 className="text-lg font-semibold mb-3 tracking-[-0.01em]">系统设置</h3>
      <div className="space-y-2 text-sm text-[var(--text-secondary)]">
        <p data-testid="admin-setting-auto-refresh">自动刷新：<span className="text-[var(--text-primary)]">{autoRefreshText}</span></p>
        <p>
          执行时间：
          {String(settings?.autoRefresh.hour ?? 0).padStart(2, '0')}:
          {String(settings?.autoRefresh.minute ?? 0).padStart(2, '0')}
        </p>
        <p data-testid="admin-setting-run-on-startup">启动即刷新：<span className="text-[var(--text-primary)]">{runOnStartupText}</span></p>
        <div className="pt-2 mt-2 border-t border-[var(--border)]/70 space-y-2">
          <p>补采页数：<span className="text-[var(--text-primary)]">{settings?.ingestBackfill.pages}</span></p>
          <p>每页条数：<span className="text-[var(--text-primary)]">{settings?.ingestBackfill.pageSize}</span></p>
          <p>补采排序：<span className="text-[var(--text-primary)]">{(settings?.ingestBackfill.sorts || []).join(', ')}</span></p>
          <p>缓存 TTL：<span className="text-[var(--text-primary)]">{settings?.cache.ttlMs} ms</span></p>
          <p>上游超时：<span className="text-[var(--text-primary)]">{settings?.cache.timeoutMs} ms</span></p>
          <p>超时重试次数：<span className="text-[var(--text-primary)]">{settings?.cache.retryMaxAttempts ?? 2}</span></p>
          <p>重试基础退避：<span className="text-[var(--text-primary)]">{settings?.cache.retryBaseDelayMs ?? 300} ms</span></p>
          <p className="text-[var(--text-muted)]">数据获取模式：<span className="text-[var(--text-primary)]">仅 AI 模型</span></p>
          <p>短剧源链路：<span className="text-[var(--text-primary)]">{dramaSourceRouting}</span></p>
          <p>小说源链路：<span className="text-[var(--text-primary)]">{novelSourceRouting}</span></p>
          <p>漫画源链路：<span className="text-[var(--text-primary)]">{comicSourceRouting}</span></p>
          <p>动漫源链路：<span className="text-[var(--text-primary)]">{animeSourceRouting}</span></p>
        </div>
      </div>
    </div>
  );
}
