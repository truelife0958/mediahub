import type { AdminLogs, AdminSummary, ContentQualityStats, SourceRunLog } from '../../types';
import { AdminMetricCard, AdminSection, EmptyHint, Pill } from './AdminWidgets';
import { TYPE_LABEL } from './types';
import { formatHotScoreShort } from '../../utils/hotScore';

interface LogsPanelProps {
  summary: AdminSummary | null;
  logs: AdminLogs | null;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

export function QualityPanel({ quality }: { quality: ContentQualityStats | null }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <AdminMetricCard label="缺封面" value={quality?.missingCover ?? 0} tone="red" />
        <AdminMetricCard label="缺简介" value={quality?.missingSummary ?? 0} tone="red" />
        <AdminMetricCard label="低量级" value={quality?.lowHotScore ?? 0} tone="warn" />
        <AdminMetricCard label="重复候选" value={quality?.duplicateCandidates.length ?? 0} tone="purple" />
      </div>
      <QualityTable quality={quality} />
      <BoundaryRiskPanel quality={quality} />
      <ReviewQueuePanel quality={quality} />
      <DuplicatePanel quality={quality} />
    </div>
  );
}

export function LogsPanel({ summary, logs }: LogsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AdminMetricCard label="调用次数" value={summary?.runStats.totalRuns ?? 0} tone="cyan" />
        <AdminMetricCard label="成功率" value={`${summary?.runStats.successRate ?? 100}%`} tone="green" />
        <AdminMetricCard label="失败次数" value={summary?.runStats.failedRuns ?? 0} tone="red" />
      </div>
      <ErrorSummary logs={logs} />
      <RunLogTable runs={logs?.runs || summary?.recentRuns || []} />
    </div>
  );
}

function QualityTable({ quality }: { quality: ContentQualityStats | null }) {
  if (!quality) return <EmptyHint>暂无质量数据。</EmptyHint>;
  return (
    <AdminSection title="质量缺失项" description="按分类统计封面、简介、标签与低量级问题。">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[var(--text-muted)]">
            <tr>
              <th className="py-2">分类</th>
              <th>总数</th>
              <th>缺封面</th>
              <th>缺简介</th>
              <th>缺标签</th>
              <th>低量级</th>
            </tr>
          </thead>
          <tbody>
            {quality.byType.map(row => (
              <tr key={row.type} className="border-t border-[var(--border)]">
                <td className="py-2">{TYPE_LABEL[row.type]}</td>
                <td>{row.total}</td>
                <td>{row.missingCover}</td>
                <td>{row.missingSummary}</td>
                <td>{row.missingTags}</td>
                <td>{row.lowHotScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}

function DuplicatePanel({ quality }: { quality: ContentQualityStats | null }) {
  const groups = quality?.duplicateCandidates || [];
  if (groups.length === 0) return <EmptyHint>暂无重复候选。去重依据：分类 + 规范化标题 + IP 名。</EmptyHint>;

  return (
    <AdminSection title="重复合并候选" description="展示重复解释和建议保留项，合并动作保持安全预览。">
      <div className="space-y-3">
        {groups.map((group, index) => (
          <div key={index} className="rounded-xl border border-[var(--border)] p-3">
            <p className="text-sm font-bold">候选组 {index + 1} · 建议保留量级最高项</p>
            <div className="mt-2 space-y-1">
              {group.map(item => (
                <p key={item.id} className="text-xs text-[var(--text-muted)]">{item.title} · {item.ipName} · {formatHotScoreShort(item.hotScore, item.type === 'novel' || item.type === 'comic' ? 'reading' : 'playback')}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminSection>
  );
}

function BoundaryRiskPanel({ quality }: { quality: ContentQualityStats | null }) {
  const risks = quality?.boundaryRisks || [];
  return (
    <AdminSection title="模块边界校验" description="自动检查短剧/小说/漫画/动漫的分类边界和热度口径。">
      {risks.length ? (
        <div className="space-y-2">
          {risks.map(item => (
            <div key={`${item.id}-${item.reason}`} className="rounded-xl border border-[var(--border)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="warn">{TYPE_LABEL[item.type]}</Pill>
                <span className="font-semibold">{item.title}</span>
                <span className="text-[var(--text-muted)]">{item.reason}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>未发现模块边界风险。</EmptyHint>
      )}
    </AdminSection>
  );
}

function ReviewQueuePanel({ quality }: { quality: ContentQualityStats | null }) {
  const queue = quality?.reviewQueue || [];
  return (
    <AdminSection title="入库审核建议" description="对缺简介、缺标签、低热度等内容生成审核建议，适合配合 AI 补缺失信息。">
      {queue.length ? (
        <div className="space-y-2">
          {queue.map(item => (
            <div key={item.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pill>{TYPE_LABEL[item.type]}</Pill>
                <span className="font-semibold">{item.title}</span>
                <span className="text-[var(--text-muted)]">{item.issues.join(' / ')}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--accent-primary)]">{item.suggestion}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyHint>暂无需要审核的内容。</EmptyHint>
      )}
    </AdminSection>
  );
}

function RunLogTable({ runs }: { runs: SourceRunLog[] }) {
  if (runs.length === 0) return <EmptyHint>暂无运行记录。</EmptyHint>;

  return (
    <AdminSection title="任务记录 / 请求追踪" description="展示 AI 入库任务的状态、错误分类和时间线。">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[var(--text-muted)]">
            <tr>
              <th className="py-2">分类</th>
              <th>来源</th>
              <th>状态</th>
              <th>条数</th>
              <th>错误分类</th>
              <th>完成时间</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, index) => (
              <tr key={`${run.type}-${run.finishedAt}-${index}`} className="border-t border-[var(--border)]">
                <td className="py-2">{TYPE_LABEL[run.type]}</td>
                <td>{run.source}</td>
                <td><Pill tone={run.status === 'success' ? 'ok' : 'error'}>{run.status}</Pill></td>
                <td>{run.count}</td>
                <td>{run.category || '-'}</td>
                <td>{formatDate(run.finishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}

function ErrorSummary({ logs }: { logs: AdminLogs | null }) {
  const entries = Object.entries(logs?.errorSummary || {});

  return (
    <AdminSection title="错误日志分类" description="将后台错误按超时、限流、鉴权和通用失败归类，便于快速定位。">
      {entries.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {entries.map(([key, value]) => (
            <AdminMetricCard key={key} label={key} value={value} tone={key === '成功' ? 'green' : 'red'} />
          ))}
        </div>
      ) : (
        <EmptyHint>暂无错误日志。</EmptyHint>
      )}
    </AdminSection>
  );
}
