import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import ApiState from '../components/ApiState';
import {
  createAdminContent,
  fillMissingAdminContent,
  getAdminSession,
  getAdminContents,
  getAdminLogs,
  getAdminQuality,
  getAdminSummary,
  getAiConfig,
  getSourceHealth,
  getSourceStatuses,
  getSystemSettings,
  loginAdmin,
  logoutAdmin,
  refreshContentType,
  updateAdminContent,
  updateAiConfig,
} from '../api';
import type {
  AdminLogs,
  AdminSummary,
  AiConfig,
  Content,
  ContentQualityStats,
  SourceHealth,
  SourceStatus,
  SystemSettings,
} from '../types';
import AiConfigCard from './admin/AiConfigCard';
import AdminShell, { type AdminModule } from './admin/AdminShell';
import { AdminMetricCard, AdminSection, EmptyHint, Pill } from './admin/AdminWidgets';
import IngestionSection from './admin/IngestionSection';
import SourceRoutingSection from './admin/SourceRoutingSection';
import SystemSettingsCard from './admin/SystemSettingsCard';
import type { AiFormState, ContentType } from './admin/types';
import { TYPE_OPTIONS } from './admin/types';

const initialRefreshingState: Record<ContentType, boolean> = {
  drama: false,
  novel: false,
  comic: false,
  anime: false,
};

const initialAiFormState: AiFormState = {
  enabled: true,
  model: '',
  baseUrl: '',
  apiKey: '',
  persistTarget: 'runtime',
};

const MODULES: AdminModule[] = [
  { id: 'operate', label: '功能操作', subtitle: '内容编辑、AI 入库、模型配置', icon: '功', tabs: [
    { id: 'library', label: '内容编辑' },
    { id: 'ingest', label: 'AI 入库' },
    { id: 'ai', label: 'AI 设置' },
  ] },
  { id: 'monitor', label: '设置监控', subtitle: '总览、质量、源健康、系统日志', icon: '设', tabs: [
    { id: 'metrics', label: '数据总览' },
    { id: 'quality', label: '质量治理' },
    { id: 'routing', label: '源健康' },
    { id: 'system', label: '系统设置' },
    { id: 'logs', label: '运行日志' },
  ] },
  { id: 'reference', label: '规则参考', subtitle: 'Prompt、关键词、排序规则', icon: '参', tabs: [
    { id: 'prompt', label: 'Prompt 模板' },
    { id: 'keywords', label: '热门关键词' },
    { id: 'rules', label: '推荐规则' },
  ] },
];

const TYPE_LABEL: Record<ContentType, string> = {
  drama: '短剧',
  novel: '小说',
  comic: '漫画',
  anime: '动漫',
};

const promptTemplates = [
  { version: 'v3.2', name: '热门发现', status: '线上', prompt: '请输出真实世界热门内容清单，严格 JSON，字段含 title/summary/tags/hotScore/sourceUrl。' },
  { version: 'v2.8', name: '质量补全', status: '备用', prompt: '根据标题补齐简介、标签、IP 名和热度解释，避免虚构不存在来源。' },
  { version: 'v2.1', name: '去重说明', status: '归档', prompt: '解释重复候选之间的标题、IP、来源相似点，并给出主记录建议。' },
];

const keywordPresets = ['短剧爽文', '国漫热播', '赛博朋克', '悬疑反转', '女性成长', '校园恋爱', '修仙升级', '治愈日常'];

function splitList(value: string) {
  return value.split(/[,\n，]/).map(item => item.trim()).filter(Boolean);
}

function createManualDraft(type: ContentType): ManualContentDraft {
  return {
    type,
    title: '',
    summary: '',
    tags: '',
    actors: '',
    author: '',
    ipName: '',
    status: 'ongoing',
    hotScore: '0',
    sourceUrl: '',
  };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function classifyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error || '未知错误');
  if (/超时|timeout|cancel/i.test(text)) return `网络超时：${text}`;
  if (/api key|401|403|鉴权|密钥/i.test(text)) return `模型鉴权：${text}`;
  if (/rate|429|限流/i.test(text)) return `调用限流：${text}`;
  return text;
}

export default function Admin() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [quality, setQuality] = useState<ContentQualityStats | null>(null);
  const [logs, setLogs] = useState<AdminLogs | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [contentTotal, setContentTotal] = useState(0);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [contentType, setContentType] = useState<ContentType>('anime');
  const [contentKeyword, setContentKeyword] = useState('');
  const [contentEditorOpen, setContentEditorOpen] = useState(false);
  const [activeModule, setActiveModule] = useState(MODULES[0].id);
  const [activeTab, setActiveTab] = useState(MODULES[0].tabs[0].id);
  const [ingestStage, setIngestStage] = useState<Record<ContentType, string>>({ drama: '', novel: '', comic: '', anime: '' });
  const [loading, setLoading] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingContents, setLoadingContents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<ContentType, boolean>>(initialRefreshingState);
  const [savingAi, setSavingAi] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [creatingContent, setCreatingContent] = useState(false);
  const [fillingContent, setFillingContent] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiForm, setAiForm] = useState<AiFormState>(initialAiFormState);
  const [manualDraft, setManualDraft] = useState<ManualContentDraft>(() => createManualDraft('anime'));
  const [message, setMessage] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);

  const refreshAdminSnapshots = useCallback(async () => {
    const [summaryData, qualityData, logsData] = await Promise.all([
      getAdminSummary(),
      getAdminQuality(),
      getAdminLogs(80),
    ]);
    setSummary(summaryData);
    setQuality(qualityData);
    setLogs(logsData);
  }, []);

  const loadContents = useCallback(async (type: ContentType, keyword = contentKeyword) => {
    setLoadingContents(true);
    try {
      const data = await getAdminContents({ type, keyword, page: 1, limit: 12, sort: 'latest' });
      setContents(data.list);
      setContentTotal(data.pagination.total);
      setSelectedContent(data.list[0] || null);
    } catch (err) {
      setMessage(classifyError(err));
      setContents([]);
      setContentTotal(0);
      setSelectedContent(null);
    } finally {
      setLoadingContents(false);
    }
  }, [contentKeyword]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsData, sourceData, aiData, healthData] = await Promise.all([
        getSystemSettings(),
        getSourceStatuses(),
        getAiConfig(),
        getSourceHealth(),
      ]);
      setSettings(settingsData);
      setSources(sourceData);
      setSourceHealth(healthData);
      setAiConfig(aiData);
      setAiForm({ enabled: aiData.enabled, model: aiData.model, baseUrl: aiData.baseUrl, apiKey: '', persistTarget: 'runtime' });
      await Promise.all([refreshAdminSnapshots(), loadContents('anime', '')]);
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setLoading(false);
    }
  }, [loadContents, refreshAdminSnapshots]);

  useEffect(() => {
    let active = true;
    setAdminLoading(true);
    setAdminLoginError(null);
    getAdminSession()
      .then((data) => {
        if (!active) return;
        setAdminAuthenticated(Boolean(data.authenticated));
      })
      .catch(() => {
        if (!active) return;
        setAdminAuthenticated(false);
      })
      .finally(() => {
        if (!active) return;
        setAdminLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!adminAuthenticated) return;
    loadAll();
  }, [adminAuthenticated, loadAll]);

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
      if (result.authenticated) {
        setAdminAuthenticated(true);
      } else {
        setAdminLoginError('管理员密码错误');
      }
    } catch (err) {
      setAdminLoginError(classifyError(err).includes('Admin password is incorrect') ? '管理员密码错误' : classifyError(err));
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
      setError(null);
      setMessage('已退出后台');
    }
  }, []);

  const sourceMap = useMemo(() => {
    const map = new Map<string, SourceStatus>();
    for (const item of sources) map.set(item.type, item);
    return map;
  }, [sources]);

  const changeModule = useCallback((moduleId: string) => {
    const module = MODULES.find(item => item.id === moduleId) || MODULES[0];
    setActiveModule(module.id);
    setActiveTab(module.tabs[0].id);
  }, []);

  const runRefresh = useCallback(async (type: ContentType) => {
    setRefreshing(prev => ({ ...prev, [type]: true }));
    setIngestStage(prev => ({ ...prev, [type]: '请求中' }));
    setMessage('');
    try {
      window.setTimeout(() => {
        setIngestStage(prev => (
          prev[type] === '请求中'
            ? { ...prev, [type]: '解析中' }
            : prev
        ));
      }, 250);
      const result = await refreshContentType(type);
      setIngestStage(prev => ({ ...prev, [type]: '入库中' }));
      const base = `${TYPE_LABEL[type]} AI 刷新完成，入库 ${result.count} 条`;
      const suffix = result.partial ? `（部分分页失败 ${result.failedPages ?? 0}/${result.attemptedPages ?? 0}，可稍后重试）` : '';
      setMessage(`${base}${suffix}`);
      const [sourceData, healthData] = await Promise.all([getSourceStatuses(), getSourceHealth()]);
      setSources(sourceData);
      setSourceHealth(healthData);
      await Promise.all([refreshAdminSnapshots(), loadContents(contentType)]);
      setIngestStage(prev => ({ ...prev, [type]: '完成' }));
    } catch (err) {
      setMessage(classifyError(err));
      setIngestStage(prev => ({ ...prev, [type]: '失败' }));
    } finally {
      setRefreshing(prev => ({ ...prev, [type]: false }));
    }
  }, [contentType, loadContents, refreshAdminSnapshots]);

  const saveAiConfig = useCallback(async () => {
    setSavingAi(true);
    setMessage('');
    try {
      const next = await updateAiConfig({
        enabled: aiForm.enabled,
        model: aiForm.model,
        baseUrl: aiForm.baseUrl,
        ...(aiForm.apiKey ? { apiKey: aiForm.apiKey } : {}),
        persistTarget: aiForm.persistTarget,
      });
      setAiConfig(next);
      setAiForm(prev => ({ ...prev, apiKey: '' }));
      await refreshAdminSnapshots();
      setMessage(next.persistedTo === 'env' ? `AI 模型配置已保存到环境变量${next.envFilePath ? `：${next.envFilePath}` : ''}` : 'AI 模型配置已保存到运行时数据库');
    } catch (err) {
      setMessage(classifyError(err));
    } finally {
      setSavingAi(false);
    }
  }, [aiForm, refreshAdminSnapshots]);

  const refreshSourceHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const data = await getSourceHealth();
      setSourceHealth(data);
      await refreshAdminSnapshots();
    } catch (err) {
      setMessage(classifyError(err));
    } finally {
      setLoadingHealth(false);
    }
  }, [refreshAdminSnapshots]);

  const saveSelectedContent = useCallback(async () => {
    if (!selectedContent) return;
    setSavingContent(true);
    try {
      const updated = await updateAdminContent(selectedContent.id, selectedContent);
      setSelectedContent(updated);
      setContents(prev => prev.map(item => item.id === updated.id ? updated : item));
      await refreshAdminSnapshots();
      setMessage(`内容《${updated.title}》已保存`);
    } catch (err) {
      setMessage(classifyError(err));
    } finally {
      setSavingContent(false);
    }
  }, [refreshAdminSnapshots, selectedContent]);

  const createManualContent = useCallback(async () => {
    const title = manualDraft.title.trim();
    if (!title) {
      setMessage('请先填写补录标题');
      return;
    }
    setCreatingContent(true);
    try {
      const created = await createAdminContent({
        type: manualDraft.type,
        title,
        summary: manualDraft.summary,
        tags: splitList(manualDraft.tags),
        actors: splitList(manualDraft.actors),
        author: manualDraft.author,
        ipName: manualDraft.ipName,
        status: manualDraft.status,
        hotScore: Number(manualDraft.hotScore) || 0,
        sourceUrl: manualDraft.sourceUrl,
      });
      setContentType(created.type);
      setContents(prev => [created, ...prev.filter(item => item.id !== created.id)]);
      setContentTotal(prev => prev + 1);
      setSelectedContent(created);
      setManualDraft(createManualDraft(created.type));
      await refreshAdminSnapshots();
      setMessage(`已补录内容《${created.title}》，可继续编辑或 AI 补缺失信息`);
    } catch (err) {
      setMessage(classifyError(err));
    } finally {
      setCreatingContent(false);
    }
  }, [manualDraft, refreshAdminSnapshots]);

  const fillSelectedContentMissing = useCallback(async () => {
    if (!selectedContent) return;
    setFillingContent(true);
    try {
      const updated = await fillMissingAdminContent(selectedContent.id);
      setSelectedContent(updated);
      setContents(prev => prev.map(item => item.id === updated.id ? updated : item));
      await refreshAdminSnapshots();
      setMessage(`AI 已补齐《${updated.title}》的缺失信息`);
    } catch (err) {
      setMessage(classifyError(err));
    } finally {
      setFillingContent(false);
    }
  }, [refreshAdminSnapshots, selectedContent]);

  const testAiConnection = useCallback(async () => {
    setTestingAi(true);
    try {
      const data = await getAiConfig();
      const missing = data.enabled && !data.hasApiKey;
      setMessage(missing ? 'AI 已启用，但缺少 API Key，连接测试未通过' : `AI 配置可读取：${data.model} · ${data.baseUrl}`);
    } catch (err) {
      setMessage(classifyError(err));
    } finally {
      setTestingAi(false);
    }
  }, []);

  const openContentEditor = useCallback((content: Content) => {
    setSelectedContent(content);
    setContentEditorOpen(true);
  }, []);

  const closeContentEditor = useCallback(() => {
    setContentEditorOpen(false);
  }, []);

  const renderMetrics = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <AdminMetricCard label="总内容" value={summary?.totalContents ?? 0} hint="AI 入库缓存" />
        {TYPE_OPTIONS.map(item => <AdminMetricCard key={item.id} label={item.label} value={summary?.countsByType?.[item.id] ?? 0} tone="cyan" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <AdminMetricCard label="质量评分" value={quality?.qualityScore ?? summary?.quality.qualityScore ?? 100} tone="green" />
        <AdminMetricCard label="AI 成功率" value={`${summary?.runStats.successRate ?? 100}%`} hint={`${summary?.runStats.successRuns ?? 0}/${summary?.runStats.totalRuns ?? 0} 次成功`} tone="green" />
        <AdminMetricCard label="估算 Token" value={summary?.cost.estimatedPromptTokens.toLocaleString() || 0} hint="按近期入库条数估算" tone="cyan" />
        <AdminMetricCard label="估算费用" value={`$${summary?.cost.estimatedCostUsd ?? 0}`} hint={summary?.cost.note} tone="gold" />
      </div>
    </div>
  );

  const renderAiSettings = () => (
    <div className="space-y-4">
      <AiConfigCard aiForm={aiForm} aiConfig={aiConfig} savingAi={savingAi} onChange={setAiForm} onSave={saveAiConfig} />
      <AdminSection title="AI 连接测试" description="验证当前 AI 配置是否完整可读取。" action={<button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={testAiConnection} disabled={testingAi}>{testingAi ? '测试中...' : '测试连接'}</button>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <AdminMetricCard label="启用状态" value={aiConfig?.enabled ? '启用' : '禁用'} tone={aiConfig?.enabled ? 'green' : 'red'} />
          <AdminMetricCard label="模型" value={aiConfig?.model || '-'} tone="cyan" />
          <AdminMetricCard label="密钥" value={aiConfig?.hasApiKey ? '已配置' : '未配置'} tone={aiConfig?.hasApiKey ? 'green' : 'red'} />
        </div>
      </AdminSection>
    </div>
  );

  const renderContentLibrary = () => (
    <div className="space-y-4">
      <ManualContentPanel draft={manualDraft} creating={creatingContent} onChange={setManualDraft} onCreate={createManualContent} />
      <AdminSection title="内容库" description={`共 ${contentTotal} 条，点击卡片直接编辑。`} action={<ContentFilters type={contentType} keyword={contentKeyword} onType={type => { setContentType(type); setManualDraft(prev => ({ ...prev, type })); loadContents(type); }} onKeyword={setContentKeyword} onSearch={() => loadContents(contentType)} />}>
        <ContentLibrary contents={contents} selectedContent={selectedContent} loading={loadingContents} onEdit={openContentEditor} />
      </AdminSection>
    </div>
  );

  const renderQualityPanel = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <AdminMetricCard label="缺封面" value={quality?.missingCover ?? 0} tone="red" />
        <AdminMetricCard label="缺简介" value={quality?.missingSummary ?? 0} tone="red" />
        <AdminMetricCard label="低热度" value={quality?.lowHotScore ?? 0} tone="warn" />
        <AdminMetricCard label="重复候选" value={quality?.duplicateCandidates.length ?? 0} tone="purple" />
      </div>
      <QualityTable quality={quality || summary?.quality || null} />
      <DuplicatePanel quality={quality || summary?.quality || null} />
    </div>
  );

  const renderSystemPanel = () => (
    <div className="space-y-4">
      <SystemSettingsCard settings={settings} />
      <CachePanel settings={settings} />
    </div>
  );

  const renderLogsPanel = () => (
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

  const renderReferencePanel = () => {
    if (activeTab === 'prompt') return <PromptTemplates />;
    if (activeTab === 'keywords') return <KeywordManager />;
    return <RuleCards title="推荐规则" items={['候选池先按 hotScore 初排', '同 IP 与同标签提高相似度', 'AI 可用时补充推荐理由', '失败时保留本地排序，不影响用户浏览']} />;
  };

  const renderActivePanel = () => {
    if (activeModule === 'operate') {
      if (activeTab === 'ingest') return <IngestionSection sourceMap={sourceMap} refreshing={refreshing} ingestStage={ingestStage} onRefresh={runRefresh} />;
      if (activeTab === 'ai') return renderAiSettings();
      return renderContentLibrary();
    }
    if (activeModule === 'monitor') {
      if (activeTab === 'quality') return renderQualityPanel();
      if (activeTab === 'routing') return <SourceRoutingSection routing={settings?.sourceRouting || null} sourceHealth={sourceHealth} loadingHealth={loadingHealth} onRefreshHealth={refreshSourceHealth} />;
      if (activeTab === 'system') return renderSystemPanel();
      if (activeTab === 'logs') return renderLogsPanel();
      return renderMetrics();
    }
    return renderReferencePanel();
  };

  const renderAdminGate = () => (
    <PageFrame>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="admin-panel rounded-2xl p-3 lg:self-start">
          <div className="mb-3 px-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Control Center</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">后台管理</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">仅管理员可进入，请先验证密码</p>
          </div>
          <a
            href="/"
            className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            返回前台
          </a>
        </aside>

        <section className="min-w-0">
          <div className="admin-panel rounded-2xl p-4 md:p-6">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Restricted</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">管理员登录</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">后台仅允许管理员访问，登录后可查看数据治理、AI 入库、系统设置与运行日志。</p>
            </div>

            <div className="mt-6 max-w-lg rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 md:p-5">
              <label className="block text-sm font-semibold text-[var(--text-primary)]">
                管理员密码
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAdminLogin();
                  }}
                  placeholder="请输入管理员密码"
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--accent-primary)]"
                />
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleAdminLogin}
                  disabled={adminLoggingIn || adminLoading}
                  className="gold-surface rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adminLoggingIn ? '登录中...' : '登录后台'}
                </button>
                <a href="/" className="text-sm font-semibold text-[var(--text-secondary)] underline decoration-dotted underline-offset-4 hover:text-[var(--text-primary)]">
                  返回前台
                </a>
              </div>
              {adminLoginError && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">{adminLoginError}</p>}
              <p className="mt-4 text-xs text-[var(--text-muted)]">默认密码：MediaHub@2026，可通过环境变量 MEDIAHUB_ADMIN_PASSWORD 覆盖。</p>
            </div>
          </div>
        </section>
      </div>
    </PageFrame>
  );

  if (adminLoading) {
    return <PageFrame><p className="text-sm text-[var(--text-muted)]">正在验证管理员身份...</p></PageFrame>;
  }

  if (!adminAuthenticated) {
    return renderAdminGate();
  }

  if (loading) {
    return <PageFrame><p className="text-sm text-[var(--text-muted)]">后台加载中...</p></PageFrame>;
  }

  if (error) {
    return <PageFrame><ApiState title="后台数据加载失败" description={error} onAction={loadAll} /></PageFrame>;
  }

  return (
    <PageFrame>
      <AdminShell
        modules={MODULES}
        activeModule={activeModule}
        activeTab={activeTab}
        message={message}
        onLogout={handleAdminLogout}
        onModuleChange={changeModule}
        onTabChange={setActiveTab}
      >
        {renderActivePanel()}
      </AdminShell>
      {contentEditorOpen && (
        <ContentEditorDialog
          content={selectedContent}
          saving={savingContent}
          filling={fillingContent}
          onChange={setSelectedContent}
          onClose={closeContentEditor}
          onSave={saveSelectedContent}
          onFillMissing={fillSelectedContentMissing}
        />
      )}
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-x-hidden">
      <div className="app-backdrop" />
      <Header />
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}

function ContentFilters({ type, keyword, onType, onKeyword, onSearch }: { type: ContentType; keyword: string; onType: (type: ContentType) => void; onKeyword: (keyword: string) => void; onSearch: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <select value={type} onChange={e => onType(e.target.value as ContentType)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs">
        {TYPE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <input value={keyword} onChange={e => onKeyword(e.target.value)} placeholder="搜索标题/IP" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs outline-none" />
      <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={onSearch}>检索</button>
    </div>
  );
}

function ContentLibrary({ contents, selectedContent, loading, onEdit }: { contents: Content[]; selectedContent: Content | null; loading: boolean; onEdit: (content: Content) => void }) {
  if (loading) return <EmptyHint>内容库加载中...</EmptyHint>;
  if (contents.length === 0) return <EmptyHint>暂无入库内容，可先到“AI 数据获取 / 手动入库”执行刷新。</EmptyHint>;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {contents.map(item => (
        <article key={item.id} className={`rounded-xl border p-3 transition-colors ${selectedContent?.id === item.id ? 'border-[rgba(232,168,56,0.42)] bg-[rgba(232,168,56,0.08)]' : 'border-[var(--border)] bg-[rgba(255,255,255,0.02)]'}`}>
          <button type="button" onClick={() => onEdit(item)} className="block w-full min-w-0 text-left" aria-label={`编辑内容：${item.title}`}>
            <h4 className="truncate text-sm font-bold text-[var(--text-primary)]">{item.title}</h4>
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.summary || '暂无简介'}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <Pill>{TYPE_LABEL[item.type]}</Pill>
              <Pill tone={item.status === 'ongoing' ? 'ok' : 'default'}>{item.status === 'ongoing' ? '连载中' : '已完结'}</Pill>
              <Pill tone="ok">热度 {item.hotScore}</Pill>
            </div>
          </button>
        </article>
      ))}
    </div>
  );
}

interface ManualContentDraft {
  type: ContentType;
  title: string;
  summary: string;
  tags: string;
  actors: string;
  author: string;
  ipName: string;
  status: 'ongoing' | 'completed';
  hotScore: string;
  sourceUrl: string;
}

function ManualContentPanel({
  draft,
  creating,
  onChange,
  onCreate,
}: {
  draft: ManualContentDraft;
  creating: boolean;
  onChange: (draft: ManualContentDraft) => void;
  onCreate: () => void;
}) {
  return (
    <AdminSection
      title="补录内容"
      description="补录手工数据，不依赖平台 API；可先保存为空字段，再用 AI 补缺失。"
      action={<button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={onCreate} disabled={creating}>{creating ? '创建中...' : '创建补录'}</button>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select value={draft.type} onChange={e => onChange({ ...draft, type: e.target.value as ContentType })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
              {TYPE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select value={draft.status} onChange={e => onChange({ ...draft, status: e.target.value as ManualContentDraft['status'] })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
              <option value="ongoing">连载中</option>
              <option value="completed">已完结</option>
            </select>
          </div>
          <input value={draft.title} onChange={e => onChange({ ...draft, title: e.target.value })} placeholder="标题" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          <textarea value={draft.summary} onChange={e => onChange({ ...draft, summary: e.target.value })} rows={4} placeholder="简介，可留空后交给 AI 补齐" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          <input value={draft.tags} onChange={e => onChange({ ...draft, tags: e.target.value })} placeholder="标签，逗号或换行分隔" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          <input value={draft.actors} onChange={e => onChange({ ...draft, actors: e.target.value })} placeholder="演员，逗号或换行分隔" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={draft.author} onChange={e => onChange({ ...draft, author: e.target.value })} placeholder="作者" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
            <input value={draft.ipName} onChange={e => onChange({ ...draft, ipName: e.target.value })} placeholder="IP 名" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={draft.hotScore} onChange={e => onChange({ ...draft, hotScore: e.target.value })} placeholder="热度" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
            <input value={draft.sourceUrl} onChange={e => onChange({ ...draft, sourceUrl: e.target.value })} placeholder="来源 URL" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-xs text-[var(--text-muted)]">补录预览</p>
          <h3 className="mt-2 text-xl font-black">{draft.title || '未命名内容'}</h3>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{draft.summary || '简介留空后可点击 AI 补缺失信息。'}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {splitList(draft.tags).map(tag => <Pill key={tag}>{tag}</Pill>)}
          </div>
        </div>
      </div>
    </AdminSection>
  );
}

function ContentEditorDialog({ content, saving, filling, onChange, onClose, onSave, onFillMissing }: { content: Content | null; saving: boolean; filling: boolean; onChange: (content: Content) => void; onClose: () => void; onSave: () => void; onFillMissing: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-editor-title"
    >
      <div className="admin-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl p-4 md:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Content</p>
            <h3 id="content-editor-title" className="mt-1 text-2xl font-black tracking-[-0.03em]">编辑内容</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">点击内容卡片后在弹窗内编辑，保存后立即回写内容库。</p>
          </div>
          <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={onClose}>关闭编辑</button>
        </div>

        {!content ? (
          <EmptyHint>先在内容库选择一条内容。</EmptyHint>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[var(--text-muted)]">
              标题
              <input value={content.title} onChange={e => onChange({ ...content, title: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
            </label>
            <label className="block text-xs font-semibold text-[var(--text-muted)]">
              简介
              <textarea value={content.summary} onChange={e => onChange({ ...content, summary: e.target.value })} rows={5} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
            </label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                状态
                <select value={content.status} onChange={e => onChange({ ...content, status: e.target.value as Content['status'] })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="ongoing">连载中</option>
                  <option value="completed">已完结</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                作者
                <input value={content.author} onChange={e => onChange({ ...content, author: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                热度
                <input type="number" value={content.hotScore} onChange={e => onChange({ ...content, hotScore: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
              </label>
            </div>
            <label className="block text-xs font-semibold text-[var(--text-muted)]">
              标签
              <input value={content.tags.join(', ')} onChange={e => onChange({ ...content, tags: e.target.value.split(',').map(item => item.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
            </label>
            <div className="flex min-h-8 flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-2">
              {content.tags.length
                ? content.tags.map(tag => <Pill key={tag}>{tag}</Pill>)
                : <span className="text-xs text-[var(--text-muted)]">暂无标签，输入后会在这里预览。</span>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button className="control-button rounded-lg px-4 py-2 text-sm font-bold" onClick={onFillMissing} disabled={filling}>
                {filling ? 'AI 补录中...' : 'AI 补缺失信息'}
              </button>
              <button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={onSave} disabled={saving}>
                {saving ? '保存中...' : '保存内容'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QualityTable({ quality }: { quality: ContentQualityStats | null }) {
  if (!quality) return <EmptyHint>暂无质量数据。</EmptyHint>;
  return (
    <AdminSection title="质量缺失项" description="按分类统计封面、简介、标签与低热度问题。">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[var(--text-muted)]"><tr><th className="py-2">分类</th><th>总数</th><th>缺封面</th><th>缺简介</th><th>缺标签</th><th>低热度</th></tr></thead>
          <tbody>{quality.byType.map(row => <tr key={row.type} className="border-t border-[var(--border)]"><td className="py-2">{TYPE_LABEL[row.type]}</td><td>{row.total}</td><td>{row.missingCover}</td><td>{row.missingSummary}</td><td>{row.missingTags}</td><td>{row.lowHotScore}</td></tr>)}</tbody>
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
      <div className="space-y-3">{groups.map((group, index) => <div key={index} className="rounded-xl border border-[var(--border)] p-3"><p className="text-sm font-bold">候选组 {index + 1} · 建议保留热度最高项</p><div className="mt-2 space-y-1">{group.map(item => <p key={item.id} className="text-xs text-[var(--text-muted)]">{item.title} · {item.ipName} · 热度 {item.hotScore}</p>)}</div></div>)}</div>
    </AdminSection>
  );
}

function PromptTemplates() {
  return (
    <AdminSection title="Prompt 模板版本" description="内置版本管理，后续可接入数据库持久化。">
      <div className="space-y-3">{promptTemplates.map(item => <div key={item.version} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3"><div className="flex items-center justify-between"><strong>{item.name}</strong><Pill tone={item.status === '线上' ? 'ok' : 'default'}>{item.version} · {item.status}</Pill></div><p className="mt-2 text-xs text-[var(--text-muted)]">{item.prompt}</p></div>)}</div>
    </AdminSection>
  );
}

function KeywordManager() {
  return (
    <AdminSection title="热门关键词管理" description="用于指导 AI 热门检索和运营选题。">
      <div className="flex flex-wrap gap-2">{keywordPresets.map(item => <Pill key={item} tone="ok">{item}</Pill>)}</div>
    </AdminSection>
  );
}

function RuleCards({ title, items }: { title: string; items: string[] }) {
  return <AdminSection title={title}>{items.map(item => <div key={item} className="mb-2 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-sm text-[var(--text-secondary)]">{item}</div>)}</AdminSection>;
}

function CachePanel({ settings }: { settings: SystemSettings | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <AdminMetricCard label="缓存 TTL" value={`${settings?.cache.ttlMs ?? 0}ms`} />
      <AdminMetricCard label="上游超时" value={`${settings?.cache.timeoutMs ?? 0}ms`} tone="cyan" />
      <AdminMetricCard label="重试次数" value={settings?.cache.retryMaxAttempts ?? 2} tone="purple" />
      <AdminMetricCard label="退避基线" value={`${settings?.cache.retryBaseDelayMs ?? 300}ms`} tone="gold" />
    </div>
  );
}

function RunLogTable({ runs }: { runs: Array<SourceStatus & { id?: number; category?: string }> }) {
  if (runs.length === 0) return <EmptyHint>暂无运行记录。</EmptyHint>;
  return (
    <AdminSection title="任务记录 / 请求追踪" description="展示 AI 入库任务的状态、错误分类和时间线。">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-[var(--text-muted)]"><tr><th className="py-2">分类</th><th>来源</th><th>状态</th><th>条数</th><th>错误分类</th><th>完成时间</th></tr></thead><tbody>{runs.map((run, index) => <tr key={`${run.type}-${run.finishedAt}-${index}`} className="border-t border-[var(--border)]"><td className="py-2">{TYPE_LABEL[run.type]}</td><td>{run.source}</td><td><Pill tone={run.status === 'success' ? 'ok' : 'error'}>{run.status}</Pill></td><td>{run.count}</td><td>{run.category || '-'}</td><td>{formatDate(run.finishedAt)}</td></tr>)}</tbody></table></div>
    </AdminSection>
  );
}

function ErrorSummary({ logs }: { logs: AdminLogs | null }) {
  const entries = Object.entries(logs?.errorSummary || {});
  return (
    <AdminSection title="错误日志分类" description="将后台错误按超时、限流、鉴权和通用失败归类，便于快速定位。">
      {entries.length ? <div className="grid grid-cols-1 gap-3 md:grid-cols-4">{entries.map(([key, value]) => <AdminMetricCard key={key} label={key} value={value} tone={key === '成功' ? 'green' : 'red'} />)}</div> : <EmptyHint>暂无错误日志。</EmptyHint>}
    </AdminSection>
  );
}
