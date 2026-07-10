import { useCallback, useEffect, useMemo, useState } from 'react';
import ApiState from '../components/ApiState';
import {
  getAdminSession,
  getAdminLogs,
  getAdminQuality,
  getAdminSummary,
  getAutoRefreshStatus,
  getRefreshJobQueueStatus,
  getJsonDataPreview,
  getJsonDataStatus,
  getSourceStatuses,
  loginAdmin,
  logoutAdmin,
  enqueueRefreshAllContentTypes,
  refreshContentType,
} from '../api';
import type {
  AdminLogs,
  AdminSummary,
  AutoRefreshRuntimeStatus,
  ContentQualityStats,
  JsonDataPreview,
  JsonDataStatus,
  RefreshJob,
  RefreshJobQueueStatus,
  SourceStatus,
} from '../types';
import AdminAccessGate from './admin/AdminAccessGate';
import AdminPageFrame from './admin/AdminPageFrame';
import AdminShell from './admin/AdminShell';
import { AdminMetricCard, AdminSection, EmptyHint, Pill } from './admin/AdminWidgets';
import IngestionSection from './admin/IngestionSection';
import {
  ADMIN_MODULES,
  classifyAdminError,
  createIngestStageState,
  createModuleTabState,
  getModuleById,
  INITIAL_REFRESHING_STATE,
  resolveModuleTab,
} from './admin/adminModel';
import type { ContentType } from './admin/types';
import { getTypeLabel, TYPE_LABEL, TYPE_OPTIONS } from './admin/types';
import { formatRealMetricDisplay } from '../utils/contentMetrics';

function formatYiValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return `${number.toFixed(number >= 10 ? 1 : 2).replace(/\.0$/, '')} 亿`;
}

function formatMetricValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return number >= 100 ? Math.round(number).toString() : number.toFixed(1).replace(/\.0$/, '');
}

function formatTopicValue(metrics: JsonDataPreview['items'][number]['metrics']) {
  const topicPlayYi = Number(metrics?.topicPlayYi);
  if (Number.isFinite(topicPlayYi) && topicPlayYi > 0) return formatYiValue(topicPlayYi);
  return formatMetricValue(metrics?.topicSignalScore ?? metrics?.topicScore);
}


function getPreviewHeatMetric(type: ContentType) {
  return type === 'novel' || type === 'comic' ? 'reading' : 'playback';
}

function formatPreviewRealMetric(item: JsonDataPreview['items'][number]) {
  const display = formatRealMetricDisplay({
    heatMetric: getPreviewHeatMetric(item.type),
    metrics: item.metrics,
  });
  return `${display.label} ${display.value}`;
}

function formatSignalSummary(signals: JsonDataPreview['items'][number]['hotSignals']) {
  const list = (signals || []).filter(item => item?.platformName || item?.platform);
  if (list.length === 0) return '-';
  return list
    .slice(0, 3)
    .map(item => `${item.platformName || item.platform} #${item.rank || '-'}`)
    .join(' / ');
}

function formatSignalRun(run: JsonDataPreview['latestLog']['runs'][number]) {
  const count = Number(run.supplementalSignals?.count) || 0;
  const errors = run.supplementalSignals?.errors?.length || 0;
  if (count <= 0 && errors <= 0) return '-';
  return `${count} 条${errors ? ` / 失败 ${errors}` : ''}`;
}


function isRefreshQueueBusy(status?: RefreshJobQueueStatus | null) {
  return Boolean(status?.activeJob || status?.queueLength);
}

function createQueueStageState(status?: RefreshJobQueueStatus | null) {
  const next = createIngestStageState('idle');
  const job = status?.activeJob || status?.queuedJobs?.[0] || status?.recentJobs?.[0];
  if (!job) return next;

  for (const type of job.types) {
    if (TYPE_OPTIONS.some(item => item.id === type)) next[type as ContentType] = 'queued';
  }
  for (const result of job.results || []) {
    if (TYPE_OPTIONS.some(item => item.id === result.type)) {
      next[result.type as ContentType] = result.status === 'success' ? 'done' : 'failed';
    }
  }
  if (job.currentType && TYPE_OPTIONS.some(item => item.id === job.currentType)) {
    next[job.currentType as ContentType] = 'collecting';
  }
  return next;
}

function summarizeRefreshJob(job?: RefreshJob | null) {
  if (!job) return '';
  const successCount = job.results.filter(item => item.status === 'success').length;
  const failedSources = job.results
    .filter(item => item.status !== 'success' || item.warning)
    .map(item => `${TYPE_LABEL[item.type as ContentType] || item.type}${item.warning ? `: ${item.warning}` : item.error ? `: ${item.error}` : ''}`);
  const fallbackCount = job.results.filter(item => Boolean(item.jsonDataset?.fallbackUsed || item.fallbackUsed)).length;
  const totalCount = job.results.reduce((sum, item) => sum + (item.status === 'success' ? Number(item.count) || 0 : 0), 0);
  const updatedAt = job.finishedAt ? new Date(job.finishedAt).toLocaleString('zh-CN', { hour12: false }) : new Date().toLocaleString('zh-CN', { hour12: false });
  return `Queue refresh finished ${successCount}/${job.progress.total}, stored ${totalCount} items at ${updatedAt}${fallbackCount ? `, ${fallbackCount} modules used fallback data` : ''}${failedSources.length ? `; issues: ${failedSources.join('; ')}` : ''}`;
}

export default function Admin() {
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const [activeModule, setActiveModule] = useState(ADMIN_MODULES[0].id);
  const [activeTab, setActiveTab] = useState(ADMIN_MODULES[0].tabs[0].id);
  const [moduleTabs, setModuleTabs] = useState<Record<string, string>>(() => createModuleTabState(ADMIN_MODULES));
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [quality, setQuality] = useState<ContentQualityStats | null>(null);
  const [logs, setLogs] = useState<AdminLogs | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [autoRefreshStatus, setAutoRefreshStatus] = useState<AutoRefreshRuntimeStatus | null>(null);
  const [jsonDataStatus, setJsonDataStatus] = useState<JsonDataStatus | null>(null);
  const [refreshQueueStatus, setRefreshQueueStatus] = useState<RefreshJobQueueStatus | null>(null);
  const [jsonPreview, setJsonPreview] = useState<JsonDataPreview | null>(null);
  const [contentType, setContentType] = useState<ContentType>('drama');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<ContentType, boolean>>(INITIAL_REFRESHING_STATE);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [ingestStage, setIngestStage] = useState<Record<ContentType, string>>(() => createIngestStageState(''));

  const loadSnapshots = useCallback(async (previewType: ContentType = contentType) => {
    const [summaryData, qualityData, logsData, sourceData, autoData, queueData, jsonData, previewData] = await Promise.all([
      getAdminSummary(),
      getAdminQuality(),
      getAdminLogs(60),
      getSourceStatuses(),
      getAutoRefreshStatus(),
      getRefreshJobQueueStatus(),
      getJsonDataStatus(),
      getJsonDataPreview({ type: previewType, limit: 12 }),
    ]);
    setSummary(summaryData);
    setQuality(qualityData);
    setLogs(logsData);
    setSources(sourceData);
    setAutoRefreshStatus(autoData);
    setRefreshQueueStatus(queueData);
    setJsonDataStatus(jsonData);
    setJsonPreview(previewData);
  }, [contentType]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadSnapshots(contentType);
    } catch (err) {
      setError(classifyAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [contentType, loadSnapshots]);

  useEffect(() => {
    let active = true;
    setAdminLoading(true);
    getAdminSession()
      .then(data => {
        if (active) setAdminAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => {
        if (active) setAdminAuthenticated(false);
      })
      .finally(() => {
        if (active) setAdminLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (adminAuthenticated) loadAll();
  }, [adminAuthenticated, loadAll]);

  const sourceMap = useMemo(() => {
    const map = new Map<string, SourceStatus>();
    for (const item of sources) map.set(item.type, item);
    return map;
  }, [sources]);

  const handleAdminLogin = useCallback(async () => {
    const password = adminPassword.trim();
    if (!password) {
      setAdminLoginError('请输入管理员密码');
      return;
    }
    setAdminLoggingIn(true);
    setAdminLoginError(null);
    try {
      const result = await loginAdmin(password);
      setAdminAuthenticated(Boolean(result.authenticated));
      if (!result.authenticated) setAdminLoginError('管理员密码错误');
    } catch (err) {
      const text = classifyAdminError(err);
      setAdminLoginError(text.includes('incorrect') ? '管理员密码错误' : text);
    } finally {
      setAdminLoggingIn(false);
    }
  }, [adminPassword]);

  const handleAdminLogout = useCallback(async () => {
    try {
      await logoutAdmin();
    } finally {
      setAdminAuthenticated(false);
      setAdminPassword('');
      setAdminLoginError(null);
      setMessage('已退出后台');
    }
  }, []);

  const changeModule = useCallback((moduleId: string) => {
    const module = getModuleById(moduleId);
    setActiveModule(module.id);
    setActiveTab(resolveModuleTab(module, moduleTabs[module.id]));
  }, [moduleTabs]);

  const handleActiveTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setModuleTabs(prev => ({ ...prev, [activeModule]: tabId }));
  }, [activeModule]);

  const runRefresh = useCallback(async (type: ContentType) => {
    if (refreshing[type] || refreshingAll) return;
    setRefreshing(prev => ({ ...prev, [type]: true }));
    setIngestStage(prev => ({ ...prev, [type]: '请求平台中' }));
    setMessage('');
    try {
      window.setTimeout(() => {
        setIngestStage(prev => prev[type] === '请求平台中' ? { ...prev, [type]: '解析榜单中' } : prev);
      }, 250);
      const result = await refreshContentType(type);
      setIngestStage(prev => ({ ...prev, [type]: '入库中' }));
      setContentType(type);
      await loadSnapshots(type);
      setIngestStage(prev => ({ ...prev, [type]: '完成' }));
      setMessage(`${TYPE_LABEL[type]}平台采集完成，入库 ${result.count} 条${result.partial ? '，部分平台采集失败，已保留可用数据' : ''}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
      setIngestStage(prev => ({ ...prev, [type]: '失败' }));
    } finally {
      setRefreshing(prev => ({ ...prev, [type]: false }));
    }
  }, [loadSnapshots, refreshing, refreshingAll]);

  const refreshQueueBusy = isRefreshQueueBusy(refreshQueueStatus);

  const runRefreshAll = useCallback(async () => {
    if (refreshingAll || refreshQueueBusy) return;
    setRefreshingAll(true);
    setRefreshing({ ...INITIAL_REFRESHING_STATE, ...Object.fromEntries(TYPE_OPTIONS.map(item => [item.id, true])) });
    setIngestStage(createIngestStageState('queued'));
    setMessage('');
    try {
      const response = await enqueueRefreshAllContentTypes();
      setRefreshQueueStatus(response.queue);
      setIngestStage(createQueueStageState(response.queue));
      setMessage(`Four-module refresh job queued: ${response.job.id}. Progress will update on this page.`);
    } catch (err) {
      setMessage(classifyAdminError(err));
      setIngestStage(createIngestStageState('failed'));
      setRefreshing(INITIAL_REFRESHING_STATE);
      setRefreshingAll(false);
    }
  }, [refreshQueueBusy, refreshingAll]);


  useEffect(() => {
    if (!adminAuthenticated || !refreshQueueBusy) return undefined;

    let active = true;
    let didRefreshSnapshots = false;
    const pollQueue = async () => {
      try {
        const status = await getRefreshJobQueueStatus();
        if (!active) return;
        setRefreshQueueStatus(status);
        setIngestStage(createQueueStageState(status));
        if (!isRefreshQueueBusy(status)) {
          setRefreshing(INITIAL_REFRESHING_STATE);
          setRefreshingAll(false);
          const latest = status.recentJobs[0];
          const summaryText = summarizeRefreshJob(latest);
          if (summaryText) setMessage(summaryText);
          if (!didRefreshSnapshots) {
            didRefreshSnapshots = true;
            await loadSnapshots(contentType).catch(err => setMessage(classifyAdminError(err)));
          }
        }
      } catch (err) {
        if (!active) return;
        setMessage(classifyAdminError(err));
      }
    };

    pollQueue();
    const timer = window.setInterval(pollQueue, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [adminAuthenticated, contentType, loadSnapshots, refreshQueueBusy]);


  const handleContentTypeChange = useCallback((type: ContentType) => {
    setContentType(type);
    loadSnapshots(type).catch(err => setMessage(classifyAdminError(err)));
  }, [loadSnapshots]);

  const renderMetrics = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <AdminMetricCard label="总内容" value={summary?.totalContents ?? 0} hint="已入库内容" />
        {TYPE_OPTIONS.map(item => <AdminMetricCard key={item.id} label={item.label} value={summary?.countsByType?.[item.id] ?? 0} tone="cyan" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AdminMetricCard label="质量评分" value={quality?.qualityScore ?? summary?.quality.qualityScore ?? 100} tone="green" />
        <AdminMetricCard label="采集成功率" value={`${summary?.runStats.successRate ?? 100}%`} hint={`${summary?.runStats.successRuns ?? 0}/${summary?.runStats.totalRuns ?? 0} 轮成功`} tone="green" />
        <AdminMetricCard label="最近失败" value={summary?.runStats.failedRuns ?? 0} tone="red" />
      </div>
    </div>
  );

  const renderJsonPreview = () => (
    <AdminSection
      title="JSON 文件预览"
      description={jsonPreview?.file ? `当前文件：${jsonPreview.file}` : '查看当前榜单 JSON 和最近采集日志。'}
      action={(
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleContentTypeChange(item.id)}
              className={`control-button rounded-lg px-3 py-1.5 text-xs font-bold ${contentType === item.id ? 'is-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    >
      {jsonPreview ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-2 text-xs text-[var(--text-muted)] md:grid-cols-4">
            <p>文件：<span className="text-[var(--text-primary)]">{jsonPreview.file}</span></p>
            <p>条数：<span className="text-[var(--text-primary)]">{jsonPreview.count}</span></p>
            <p>榜单日期：<span className="text-[var(--text-primary)]">{jsonPreview.date || '-'}</span></p>
            <p>更新时间：<span className="text-[var(--text-primary)]">{jsonPreview.capturedAt ? new Date(jsonPreview.capturedAt).toLocaleString('zh-CN') : '-'}</span></p>
          </div>

          {jsonPreview.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2">排名</th>
                    <th>标题</th>
                    <th>分类</th>
                    <th>演员/作者</th>
                    <th>内容指数</th>
                    <th>平台热度</th>
                    <th>热搜</th>
                    <th>话题</th>
                    <th>补充信号</th>
                    <th>综合分</th>
                  </tr>
                </thead>
                <tbody>
                  {jsonPreview.items.map(item => (
                    <tr key={item.id} className="border-t border-[var(--border)]">
                      <td className="py-2 font-semibold text-[var(--text-primary)]">{item.rank || '-'}</td>
                      <td className="max-w-[260px] truncate font-semibold text-[var(--text-primary)]">{item.title}</td>
                      <td className="max-w-[220px] truncate">{item.categories.join(' / ') || '-'}</td>
                      <td className="max-w-[220px] truncate">{item.actors.join(' / ') || item.author || '-'}</td>
                      <td>{formatPreviewRealMetric(item)}</td>
                      <td>{formatMetricValue(item.metrics?.platformHeatWan ?? item.metrics?.platformHotRank)}</td>
                      <td>{formatMetricValue(item.metrics?.searchIndex)}</td>
                      <td>{formatTopicValue(item.metrics)}</td>
                      <td className="max-w-[220px] truncate">{formatSignalSummary(item.hotSignals)}</td>
                      <td className="font-semibold text-[var(--accent-primary)]">{formatMetricValue(item.metrics?.totalScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyHint>当前 JSON 文件暂无内容</EmptyHint>
          )}

          <div>
            <p className="mb-2 text-xs text-[var(--text-muted)]">最近日志：{jsonPreview.latestLog.file || '-'}</p>
            {jsonPreview.latestLog.runs.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-[var(--text-muted)]">
                    <tr><th className="py-2">分类</th><th>来源</th><th>状态</th><th>条数</th><th>热榜信号</th><th>开始</th><th>结束</th></tr>
                  </thead>
                  <tbody>
                    {jsonPreview.latestLog.runs.map(run => (
                      <tr key={run.id} className="border-t border-[var(--border)]">
                        <td className="py-2">{getTypeLabel(run.type)}</td>
                        <td>{run.source}</td>
                        <td><Pill tone={run.status === 'success' ? 'ok' : 'error'}>{run.status}</Pill></td>
                        <td>{run.count}</td>
                        <td>{formatSignalRun(run)}</td>
                        <td>{run.startedAt ? new Date(run.startedAt).toLocaleString('zh-CN') : '-'}</td>
                        <td>{run.finishedAt ? new Date(run.finishedAt).toLocaleString('zh-CN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyHint>暂无采集日志</EmptyHint>
            )}
          </div>
        </div>
      ) : (
        <EmptyHint>JSON 预览加载中...</EmptyHint>
      )}
    </AdminSection>
  );

  const renderQuality = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <AdminMetricCard label="缺封面" value={quality?.missingCover ?? 0} tone="red" />
        <AdminMetricCard label="缺简介" value={quality?.missingSummary ?? 0} tone="red" />
        <AdminMetricCard label="低热度" value={quality?.lowHotScore ?? 0} tone="warn" />
        <AdminMetricCard label="重复候选" value={quality?.duplicateCandidates.length ?? 0} tone="purple" />
      </div>
      <AdminSection title="异常数据提示" description="用于发现缺字段、低热度、重复候选等问题；明显乱码数据不会进入前台榜单。">
        {quality ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--text-muted)]">
                <tr><th className="py-2">分类</th><th>总数</th><th>缺封面</th><th>缺简介</th><th>缺标签</th><th>低热度</th></tr>
              </thead>
              <tbody>
                {quality.byType.filter(row => TYPE_OPTIONS.some(item => item.id === row.type)).map(row => (
                  <tr key={row.type} className="border-t border-[var(--border)]">
                    <td className="py-2">{getTypeLabel(row.type)}</td><td>{row.total}</td><td>{row.missingCover}</td><td>{row.missingSummary}</td><td>{row.missingTags}</td><td>{row.lowHotScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyHint>暂无质量数据</EmptyHint>}
      </AdminSection>
    </div>
  );

  const renderLogs = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AdminMetricCard label="采集次数" value={summary?.runStats.totalRuns ?? 0} tone="cyan" />
        <AdminMetricCard label="成功率" value={`${summary?.runStats.successRate ?? 100}%`} tone="green" />
        <AdminMetricCard label="失败次数" value={summary?.runStats.failedRuns ?? 0} tone="red" />
      </div>
      <AdminSection title="运行记录" description="平台采集任务的状态、来源、条数和错误。">
        {(logs?.runs || summary?.recentRuns || []).length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--text-muted)]">
                <tr><th className="py-2">分类</th><th>来源</th><th>状态</th><th>条数</th><th>错误</th><th>完成时间</th></tr>
              </thead>
              <tbody>
                {(logs?.runs || summary?.recentRuns || []).map((run, index) => (
                  <tr key={`${run.type}-${run.finishedAt}-${index}`} className="border-t border-[var(--border)]">
                    <td className="py-2">{getTypeLabel(run.type)}</td>
                    <td>{run.source}</td>
                    <td><Pill tone={run.status === 'success' ? 'ok' : 'error'}>{run.status}</Pill></td>
                    <td>{run.count}</td>
                    <td>{run.error || '-'}</td>
                    <td>{run.finishedAt ? new Date(run.finishedAt).toLocaleString('zh-CN') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyHint>暂无运行记录</EmptyHint>}
      </AdminSection>
    </div>
  );

  const renderActivePanel = () => {
    if (activeTab === 'logs') return renderLogs();
    if (activeTab === 'json') return renderJsonPreview();
    if (activeTab === 'anomalies') return renderQuality();
    return (
      <div className="space-y-4">
        {renderMetrics()}
        <IngestionSection
          sourceMap={sourceMap}
          refreshing={refreshing}
          refreshingAll={refreshingAll}
          ingestStage={ingestStage}
          autoRefreshStatus={autoRefreshStatus}
          jsonDataStatus={jsonDataStatus}
          refreshQueueStatus={refreshQueueStatus}
          onRefresh={runRefresh}
          onRefreshAll={runRefreshAll}
        />
      </div>
    );
  };

  if (adminLoading) {
    return <AdminPageFrame><p className="text-sm text-[var(--text-muted)]">正在验证管理员身份...</p></AdminPageFrame>;
  }

  if (!adminAuthenticated) {
    return (
      <AdminPageFrame>
        <AdminAccessGate
          password={adminPassword}
          loading={adminLoading}
          loggingIn={adminLoggingIn}
          error={adminLoginError}
          onPasswordChange={setAdminPassword}
          onLogin={handleAdminLogin}
        />
      </AdminPageFrame>
    );
  }

  if (loading) {
    return <AdminPageFrame><p className="text-sm text-[var(--text-muted)]">后台加载中...</p></AdminPageFrame>;
  }

  if (error) {
    return <AdminPageFrame><ApiState title="后台数据加载失败" description={error} onAction={loadAll} /></AdminPageFrame>;
  }

  return (
    <AdminPageFrame>
      <AdminShell
        modules={ADMIN_MODULES}
        activeModule={activeModule}
        activeTab={activeTab}
        message={message}
        onLogout={handleAdminLogout}
        onModuleChange={changeModule}
        onTabChange={handleActiveTabChange}
      >
        {renderActivePanel()}
      </AdminShell>
    </AdminPageFrame>
  );
}
