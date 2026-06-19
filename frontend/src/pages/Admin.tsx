import { useCallback, useEffect, useMemo, useState } from 'react';
import ApiState from '../components/ApiState';
import {
  createKeywordSubscription,
  createAdminContent,
  createSearchAliasGroup,
  deleteKeywordSubscription,
  deleteSearchAliasGroup,
  fillMissingAdminContent,
  getAdminSession,
  getAdminContents,
  getAdminLogs,
  getAdminQuality,
  getLeaderboardAnomalies,
  getLeaderboard,
  getLeaderboardAlerts,
  getLeaderboardDiff,
  getLeaderboardLayerConfig,
  getLeaderboardTrend,
  getReferenceSettings,
  getSearchAliasGroups,
  getAdminSummary,
  getAiConfig,
  getAutoRefreshStatus,
  getSourceHealth,
  getSourceStatuses,
  getSystemSettings,
  listAuditLogs,
  listContentRevisions,
  listKeywordSubscriptions,
  listSubscriptionHits,
  loginAdmin,
  logoutAdmin,
  refreshAllContentTypes,
  refreshContentType,
  triggerLeaderboardCapture,
  testAiConfig,
  updateAdminContent,
  updateAiConfig,
  updateKeywordSubscription,
  updateReferenceSettings,
  updateSearchAliasGroup,
  updateSystemSettings,
} from '../api';
import type {
  AdminLogs,
  AdminSummary,
  AuditLogRecord,
  AiConfig,
  AutoRefreshRuntimeStatus,
  Content,
  ContentRevisionRecord,
  ContentQualityStats,
  EditableSystemSettings,
  KeywordSubscription,
  KeywordSubscriptionHit,
  LeaderboardAlertsResponse,
  LeaderboardAnomaliesResponse,
  LeaderboardDiffResponse,
  LeaderboardLayerConfig,
  LeaderboardResponse,
  LeaderboardTrendResponse,
  ReferenceSettings,
  SearchAliasGroup,
  SourceHealth,
  SourceStatus,
  SystemSettings,
} from '../types';
import AdminAccessGate from './admin/AdminAccessGate';
import AdminPageFrame from './admin/AdminPageFrame';
import AiConfigCard from './admin/AiConfigCard';
import AdminShell from './admin/AdminShell';
import { ContentEditorDialog, ContentLibrarySection } from './admin/ContentWorkspace';
import { AdminMetricCard, AdminSection } from './admin/AdminWidgets';
import IngestionSection from './admin/IngestionSection';
import LeaderboardInsightsPanel from './admin/LeaderboardInsightsPanel';
import {
  ADMIN_MODULES,
  classifyAdminError,
  createModuleTabState,
  getModuleById,
  INITIAL_AI_FORM_STATE,
  INITIAL_REFRESHING_STATE,
  resolveModuleTab,
} from './admin/adminModel';
import { createManualDraft, type ManualContentDraft } from './admin/manualContent';
import { LogsPanel, QualityPanel } from './admin/ObservabilityPanels';
import { ReferencePanel } from './admin/ReferencePanels';
import SourceRoutingSection from './admin/SourceRoutingSection';
import SystemSettingsCard from './admin/SystemSettingsCard';
import type { AiFormState, ContentType, ReferenceSection } from './admin/types';
import { TYPE_LABEL, TYPE_OPTIONS } from './admin/types';

const INSIGHTS_AUTO_REFRESH_MS = 20_000;

export default function Admin() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [referenceSettings, setReferenceSettings] = useState<ReferenceSettings | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [autoRefreshStatus, setAutoRefreshStatus] = useState<AutoRefreshRuntimeStatus | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [quality, setQuality] = useState<ContentQualityStats | null>(null);
  const [logs, setLogs] = useState<AdminLogs | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [contentTotal, setContentTotal] = useState(0);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [contentType, setContentType] = useState<ContentType>('anime');
  const [insightType, setInsightType] = useState<ContentType>('drama');
  const [insightLayer, setInsightLayer] = useState<'overall' | 'new' | 'rising' | 'completed'>('overall');
  const [leaderboardLayerConfig, setLeaderboardLayerConfig] = useState<LeaderboardLayerConfig | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardTrend, setLeaderboardTrend] = useState<LeaderboardTrendResponse | null>(null);
  const [leaderboardDiff, setLeaderboardDiff] = useState<LeaderboardDiffResponse | null>(null);
  const [leaderboardAlerts, setLeaderboardAlerts] = useState<LeaderboardAlertsResponse | null>(null);
  const [leaderboardAnomalies, setLeaderboardAnomalies] = useState<LeaderboardAnomaliesResponse | null>(null);
  const [keywordSubscriptions, setKeywordSubscriptions] = useState<KeywordSubscription[]>([]);
  const [subscriptionHits, setSubscriptionHits] = useState<KeywordSubscriptionHit[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [contentRevisions, setContentRevisions] = useState<ContentRevisionRecord[]>([]);
  const [aliasGroups, setAliasGroups] = useState<SearchAliasGroup[]>([]);
  const [contentKeyword, setContentKeyword] = useState('');
  const [contentEditorOpen, setContentEditorOpen] = useState(false);
  const [activeModule, setActiveModule] = useState(ADMIN_MODULES[0].id);
  const [activeTab, setActiveTab] = useState(ADMIN_MODULES[0].tabs[0].id);
  const [moduleTabs, setModuleTabs] = useState<Record<string, string>>(() => createModuleTabState(ADMIN_MODULES));
  const [ingestStage, setIngestStage] = useState<Record<ContentType, string>>({ drama: '', novel: '', comic: '', anime: '' });
  const [loading, setLoading] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingContents, setLoadingContents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<ContentType, boolean>>(INITIAL_REFRESHING_STATE);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);
  const [savingReference, setSavingReference] = useState<ReferenceSection | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const [creatingContent, setCreatingContent] = useState(false);
  const [fillingContent, setFillingContent] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [savingInsights, setSavingInsights] = useState(false);
  const [aiForm, setAiForm] = useState<AiFormState>(INITIAL_AI_FORM_STATE);
  const [manualDraft, setManualDraft] = useState<ManualContentDraft>(() => createManualDraft('anime'));
  const [message, setMessage] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const selectedContentId = selectedContent?.id || '';

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
      setMessage(classifyAdminError(err));
      setContents([]);
      setContentTotal(0);
      setSelectedContent(null);
    } finally {
      setLoadingContents(false);
    }
  }, [contentKeyword]);

  const loadAll = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const init = signal ? { signal } : undefined;
      const [settingsData, sourceData, aiData, healthData, referenceData, aliasData, autoRefreshData] = await Promise.all([
        getSystemSettings(init),
        getSourceStatuses(init),
        getAiConfig(init),
        getSourceHealth(undefined, init),
        getReferenceSettings(init),
        getSearchAliasGroups(undefined, init),
        getAutoRefreshStatus(init),
      ]);
      if (signal?.aborted) return;
      setSettings(settingsData);
      setSources(sourceData);
      setSourceHealth(healthData);
      setAiConfig(aiData);
      setAutoRefreshStatus(autoRefreshData);
      setReferenceSettings(referenceData);
      setAliasGroups(aliasData);
      setAiForm({ enabled: aiData.enabled, model: aiData.model, baseUrl: aiData.baseUrl, apiKey: '', persistTarget: 'runtime' });
      await Promise.all([refreshAdminSnapshots(), loadContents('anime', '')]);
    } catch (err) {
      if (signal?.aborted) return;
      setError(classifyAdminError(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadContents, refreshAdminSnapshots]);

  const loadInsights = useCallback(async (
    { type = insightType, layer = insightLayer, contentId = selectedContentId }: {
      type?: ContentType;
      layer?: 'overall' | 'new' | 'rising' | 'completed';
      contentId?: string;
    } = {},
    signal?: AbortSignal,
  ) => {
    setLoadingInsights(true);
    try {
      const init = signal ? { signal } : undefined;
      const [
        layerConfigData,
        leaderboardData,
        trendData,
        diffData,
        alertsData,
        anomaliesData,
        subscriptionsData,
        hitsData,
        auditData,
        revisionsData,
      ] = await Promise.all([
        getLeaderboardLayerConfig(init),
        getLeaderboard({ type, layer }, init),
        getLeaderboardTrend({ type, layer, limit: 30 }, init),
        getLeaderboardDiff({ type, layer }, init),
        getLeaderboardAlerts({ type, layer, limit: 80 }, init),
        getLeaderboardAnomalies({ type, layer }, init),
        listKeywordSubscriptions(undefined, init),
        listSubscriptionHits({ type, limit: 80 }, init),
        listAuditLogs({ limit: 80 }, init),
        contentId ? listContentRevisions(contentId, 50, init) : Promise.resolve({ list: [] }),
      ]);

      if (signal?.aborted) return;
      setLeaderboardLayerConfig(layerConfigData);
      setLeaderboard(leaderboardData);
      setLeaderboardTrend(trendData);
      setLeaderboardDiff(diffData);
      setLeaderboardAlerts(alertsData);
      setLeaderboardAnomalies(anomaliesData);
      setKeywordSubscriptions(subscriptionsData.list);
      setSubscriptionHits(hitsData.list);
      setAuditLogs(auditData.list);
      setContentRevisions(revisionsData.list);
    } catch (err) {
      if (signal?.aborted) return;
      setMessage(classifyAdminError(err));
    } finally {
      if (!signal?.aborted) setLoadingInsights(false);
    }
  }, [insightLayer, insightType, selectedContentId]);

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
    const controller = new AbortController();
    loadAll(controller.signal);
    return () => { controller.abort(); };
  }, [adminAuthenticated, loadAll]);

  useEffect(() => {
    if (!adminAuthenticated) return;
    if (activeModule !== 'monitor' || activeTab !== 'insights') return;
    const controller = new AbortController();
    loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId }, controller.signal);
    return () => { controller.abort(); };
  }, [activeModule, activeTab, adminAuthenticated, insightLayer, insightType, loadInsights, selectedContentId]);

  useEffect(() => {
    if (!adminAuthenticated) return;
    if (activeModule !== 'monitor' || activeTab !== 'insights') return;

    const timerId = window.setInterval(() => {
      loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId });
    }, INSIGHTS_AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [activeModule, activeTab, adminAuthenticated, insightLayer, insightType, loadInsights, selectedContentId]);

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
      const loginErr = classifyAdminError(err);
      setAdminLoginError(!loginErr ? '请求已取消' : loginErr.includes('Admin password is incorrect') ? '管理员密码错误' : loginErr);
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
    const module = getModuleById(moduleId);
    setActiveModule(module.id);
    setActiveTab(resolveModuleTab(module, moduleTabs[module.id]));
  }, [moduleTabs]);

  const handleActiveTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setModuleTabs(prev => ({ ...prev, [activeModule]: tabId }));
  }, [activeModule]);

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
      const [sourceData, healthData, autoRefreshData] = await Promise.all([getSourceStatuses(), getSourceHealth(), getAutoRefreshStatus()]);
      setSources(sourceData);
      setSourceHealth(healthData);
      setAutoRefreshStatus(autoRefreshData);
      await Promise.all([refreshAdminSnapshots(), loadContents(contentType)]);
      setIngestStage(prev => ({ ...prev, [type]: '完成' }));
      const base = `${TYPE_LABEL[type]} AI 刷新完成，入库 ${result.count} 条`;
      const suffix = result.partial ? `（部分分页失败 ${result.failedPages ?? 0}/${result.attemptedPages ?? 0}，可稍后重试）` : '';
      setMessage(`${base}${suffix}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
      setIngestStage(prev => ({ ...prev, [type]: '失败' }));
    } finally {
      setRefreshing(prev => ({ ...prev, [type]: false }));
    }
  }, [contentType, loadContents, refreshAdminSnapshots]);

  const runRefreshAll = useCallback(async () => {
    setRefreshingAll(true);
    setRefreshing({ drama: true, novel: true, comic: true, anime: true });
    setIngestStage({ drama: '请求中', novel: '请求中', comic: '请求中', anime: '请求中' });
    setMessage('');
    window.setTimeout(() => {
      setIngestStage(prev => ({
        drama: prev.drama === '请求中' ? '解析中' : prev.drama,
        novel: prev.novel === '请求中' ? '解析中' : prev.novel,
        comic: prev.comic === '请求中' ? '解析中' : prev.comic,
        anime: prev.anime === '请求中' ? '解析中' : prev.anime,
      }));
    }, 250);

    try {
      const data = await refreshAllContentTypes();
      setAutoRefreshStatus(data.status);
      const nextStage = { drama: '完成', novel: '完成', comic: '完成', anime: '完成' };
      for (const item of data.results) {
        nextStage[item.type] = item.status === 'success' ? '完成' : '失败';
      }
      setIngestStage(nextStage);

      const successCount = data.results.filter(item => item.status === 'success').length;
      const totalCount = data.results.reduce((sum, item) => sum + (item.status === 'success' ? Number(item.count) || 0 : 0), 0);
      const failed = data.results.filter(item => item.status === 'failed');
      setMessage(failed.length > 0
        ? `四类 AI 更新完成 ${successCount}/4，入库 ${totalCount} 条；${failed.map(item => TYPE_LABEL[item.type]).join('、')} 失败，请检查 AI Key 或稍后重试`
        : `四类 AI 更新完成，入库 ${totalCount} 条`);

      const [sourceData, healthData, latestRuntime] = await Promise.all([getSourceStatuses(), getSourceHealth(), getAutoRefreshStatus()]);
      setSources(sourceData);
      setSourceHealth(healthData);
      setAutoRefreshStatus(latestRuntime);
      await Promise.all([refreshAdminSnapshots(), loadContents(contentType)]);
    } catch (err) {
      setMessage(classifyAdminError(err));
      setIngestStage({ drama: '失败', novel: '失败', comic: '失败', anime: '失败' });
    } finally {
      setRefreshing(INITIAL_REFRESHING_STATE);
      setRefreshingAll(false);
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
      setMessage(classifyAdminError(err));
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
      setMessage(classifyAdminError(err));
    } finally {
      setLoadingHealth(false);
    }
  }, [refreshAdminSnapshots]);

  const saveSelectedContent = useCallback(async (draft: Content) => {
    setSavingContent(true);
    try {
      const updated = await updateAdminContent(draft.id, draft);
      setSelectedContent(updated);
      setContents(prev => prev.map(item => item.id === updated.id ? updated : item));
      await refreshAdminSnapshots();
      setMessage(`内容《${updated.title}》已保存`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingContent(false);
    }
  }, [refreshAdminSnapshots]);

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
        tags: manualDraft.tags.split(/[,\n，]/).map(item => item.trim()).filter(Boolean),
        actors: manualDraft.actors.split(/[,\n，]/).map(item => item.trim()).filter(Boolean),
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
      setMessage(classifyAdminError(err));
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
      setMessage(classifyAdminError(err));
    } finally {
      setFillingContent(false);
    }
  }, [refreshAdminSnapshots, selectedContent]);

  const testAiConnection = useCallback(async () => {
    setTestingAi(true);
    try {
      const data = await testAiConfig({
        enabled: aiForm.enabled,
        model: aiForm.model,
        baseUrl: aiForm.baseUrl,
        ...(aiForm.apiKey ? { apiKey: aiForm.apiKey } : {}),
      });
      setMessage(data.ok
        ? `${data.message} 延迟 ${data.latencyMs}ms`
        : `AI 连接测试未通过：${data.message}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setTestingAi(false);
    }
  }, [aiForm]);

  const saveSystemSettings = useCallback(async (payload: EditableSystemSettings) => {
    setSavingSystemSettings(true);
    setMessage('');
    try {
      const next = await updateSystemSettings(payload);
      setSettings(next);
      const runtime = await getAutoRefreshStatus();
      setAutoRefreshStatus(runtime);
      setMessage(runtime.enabled ? '系统设置已保存，自动 AI 更新已接管' : '系统设置已保存，自动 AI 更新已关闭');
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingSystemSettings(false);
    }
  }, []);

  const enableAutoRefresh = useCallback(async () => {
    if (!settings) {
      setMessage('系统设置尚未加载完成');
      return;
    }
    await saveSystemSettings({
      autoRefresh: {
        ...settings.autoRefresh,
        enabled: true,
        mode: settings.autoRefresh.mode || 'interval',
        intervalMinutes: Math.max(1, settings.autoRefresh.intervalMinutes || 10),
      },
      ingestBackfill: settings.ingestBackfill,
      cache: settings.cache,
      ...(settings.notifications ? { notifications: settings.notifications } : {}),
    });
  }, [saveSystemSettings, settings]);

  const persistReferenceSettings = useCallback(async (
    section: ReferenceSection,
    patch: Partial<ReferenceSettings>,
    successMessage: string,
  ) => {
    if (!referenceSettings) return;
    setSavingReference(section);
    setMessage('');
    try {
      const next = await updateReferenceSettings({ ...referenceSettings, ...patch });
      setReferenceSettings(next);
      setMessage(successMessage);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingReference(null);
    }
  }, [referenceSettings]);

  const savePromptTemplates = useCallback((promptTemplates: ReferenceSettings['promptTemplates']) => (
    persistReferenceSettings('prompt', { promptTemplates }, 'Prompt 模板已保存')
  ), [persistReferenceSettings]);

  const saveKeywordPresets = useCallback((keywordPresets: ReferenceSettings['keywordPresets']) => (
    persistReferenceSettings('keywords', { keywordPresets }, '热门关键词已保存')
  ), [persistReferenceSettings]);

  const saveRecommendationRules = useCallback((recommendationRules: ReferenceSettings['recommendationRules']) => (
    persistReferenceSettings('rules', { recommendationRules }, '推荐规则已保存')
  ), [persistReferenceSettings]);

  const createAliasLexiconGroup = useCallback(async (payload: {
    canonicalKeyword: string;
    aliases: string[];
    type: '' | ContentType;
    enabled: boolean;
    notes: string;
  }) => {
    setSavingReference('aliases');
    setMessage('');
    try {
      const created = await createSearchAliasGroup(payload);
      setAliasGroups(prev => [created, ...prev.filter(item => item.id !== created.id)]);
      setMessage(`已新增别名词组：${created.canonicalKeyword}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingReference(null);
    }
  }, []);

  const updateAliasLexiconGroup = useCallback(async (id: number, payload: Partial<{
    canonicalKeyword: string;
    aliases: string[];
    type: '' | ContentType;
    enabled: boolean;
    notes: string;
  }>) => {
    setSavingReference('aliases');
    setMessage('');
    try {
      const updated = await updateSearchAliasGroup(id, payload);
      setAliasGroups(prev => prev.map(item => item.id === updated.id ? updated : item));
      setMessage(`别名词组已保存：${updated.canonicalKeyword}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingReference(null);
    }
  }, []);

  const deleteAliasLexiconGroup = useCallback(async (id: number) => {
    setSavingReference('aliases');
    setMessage('');
    try {
      await deleteSearchAliasGroup(id);
      setAliasGroups(prev => prev.filter(item => item.id !== id));
      setMessage(`别名词组已删除 #${id}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingReference(null);
    }
  }, []);

  const openContentEditor = useCallback((content: Content) => {
    setSelectedContent(content);
    setContentEditorOpen(true);
  }, []);

  const closeContentEditor = useCallback(() => {
    setContentEditorOpen(false);
  }, []);

  const handleContentTypeChange = useCallback((type: ContentType) => {
    setContentType(type);
    setManualDraft(prev => ({ ...prev, type }));
    loadContents(type);
  }, [loadContents]);

  const clearContentSearch = useCallback(() => {
    setContentKeyword('');
    loadContents(contentType, '');
  }, [contentType, loadContents]);

  const triggerInsightsCapture = useCallback(async () => {
    setSavingInsights(true);
    try {
      await triggerLeaderboardCapture();
      await loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId });
      setMessage('已抓取全部分类榜单快照');
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingInsights(false);
    }
  }, [insightLayer, insightType, loadInsights, selectedContentId]);

  const createInsightsSubscription = useCallback(async (payload: {
    keyword: string;
    type?: '' | ContentType;
    channel?: string;
    target?: string;
  }) => {
    setSavingInsights(true);
    try {
      await createKeywordSubscription(payload);
      await loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId });
      setMessage(`关键词订阅已创建：${payload.keyword}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingInsights(false);
    }
  }, [insightLayer, insightType, loadInsights, selectedContentId]);

  const toggleInsightsSubscription = useCallback(async (item: KeywordSubscription) => {
    setSavingInsights(true);
    try {
      await updateKeywordSubscription(item.id, { enabled: !item.enabled });
      await loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId });
      setMessage(`订阅已${item.enabled ? '停用' : '启用'}：${item.keyword}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingInsights(false);
    }
  }, [insightLayer, insightType, loadInsights, selectedContentId]);

  const removeInsightsSubscription = useCallback(async (item: KeywordSubscription) => {
    setSavingInsights(true);
    try {
      await deleteKeywordSubscription(item.id);
      await loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId });
      setMessage(`订阅已删除：${item.keyword}`);
    } catch (err) {
      setMessage(classifyAdminError(err));
    } finally {
      setSavingInsights(false);
    }
  }, [insightLayer, insightType, loadInsights, selectedContentId]);

  const exportInsightsCsv = useCallback(() => {
    const query = new URLSearchParams({
      type: insightType,
      layer: insightLayer,
      format: 'csv',
    });
    window.open(`/api/leaderboards/export?${query.toString()}`, '_blank');
  }, [insightLayer, insightType]);

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
    <ContentLibrarySection
      draft={manualDraft}
      creating={creatingContent}
      onDraftChange={setManualDraft}
      onCreate={createManualContent}
      contentTotal={contentTotal}
      contentType={contentType}
      contentKeyword={contentKeyword}
      onType={handleContentTypeChange}
      onKeyword={setContentKeyword}
      onSearch={(keyword) => loadContents(contentType, keyword)}
      onClearSearch={clearContentSearch}
      contents={contents}
      selectedContent={selectedContent}
      loading={loadingContents}
      onEdit={openContentEditor}
    />
  );

  const renderQualityPanel = () => <QualityPanel quality={quality || summary?.quality || null} />;

  const renderInsightsPanel = () => (
    <LeaderboardInsightsPanel
      layerConfig={leaderboardLayerConfig}
      selectedType={insightType}
      selectedLayer={insightLayer}
      leaderboard={leaderboard}
      trend={leaderboardTrend}
      diff={leaderboardDiff}
      alerts={leaderboardAlerts}
      anomalies={leaderboardAnomalies}
      subscriptions={keywordSubscriptions}
      subscriptionHits={subscriptionHits}
      auditLogs={auditLogs}
      revisions={contentRevisions}
      loading={loadingInsights}
      saving={savingInsights}
      onTypeChange={setInsightType}
      onLayerChange={setInsightLayer}
      onRefresh={() => loadInsights({ type: insightType, layer: insightLayer, contentId: selectedContentId })}
      onCapture={triggerInsightsCapture}
      onExport={exportInsightsCsv}
      onCreateSubscription={createInsightsSubscription}
      onToggleSubscription={toggleInsightsSubscription}
      onDeleteSubscription={removeInsightsSubscription}
    />
  );

  const renderSystemPanel = () => (
    <div className="space-y-4">
      <SystemSettingsCard settings={settings} saving={savingSystemSettings} onSave={saveSystemSettings} />
    </div>
  );

  const renderLogsPanel = () => <LogsPanel summary={summary} logs={logs} />;

  const renderReferencePanel = () => {
    return (
      <ReferencePanel
        activeTab={activeTab}
        referenceSettings={referenceSettings}
        aliasGroups={aliasGroups}
        savingReference={savingReference}
        onSavePromptTemplates={savePromptTemplates}
        onSaveKeywordPresets={saveKeywordPresets}
        onSaveRecommendationRules={saveRecommendationRules}
        onCreateAliasGroup={createAliasLexiconGroup}
        onUpdateAliasGroup={updateAliasLexiconGroup}
        onDeleteAliasGroup={deleteAliasLexiconGroup}
      />
    );
  };

  const renderActivePanel = () => {
    if (activeModule === 'operate') {
      if (activeTab === 'ingest') {
        return (
          <IngestionSection
            sourceMap={sourceMap}
            refreshing={refreshing}
            refreshingAll={refreshingAll}
            savingAutoRefresh={savingSystemSettings}
            ingestStage={ingestStage}
            autoRefreshStatus={autoRefreshStatus}
            onRefresh={runRefresh}
            onRefreshAll={runRefreshAll}
            onEnableAutoRefresh={enableAutoRefresh}
          />
        );
      }
      if (activeTab === 'ai') return renderAiSettings();
      return renderContentLibrary();
    }
    if (activeModule === 'monitor') {
      if (activeTab === 'insights') return renderInsightsPanel();
      if (activeTab === 'quality') return renderQualityPanel();
      if (activeTab === 'routing') return <SourceRoutingSection routing={settings?.sourceRouting || null} sourceHealth={sourceHealth} loadingHealth={loadingHealth} onRefreshHealth={refreshSourceHealth} />;
      if (activeTab === 'system') return renderSystemPanel();
      if (activeTab === 'logs') return renderLogsPanel();
      return renderMetrics();
    }
    return renderReferencePanel();
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
      {contentEditorOpen && (
        <ContentEditorDialog
          content={selectedContent}
          saving={savingContent}
          filling={fillingContent}
          onClose={closeContentEditor}
          onSave={saveSelectedContent}
          onFillMissing={fillSelectedContentMissing}
        />
      )}
    </AdminPageFrame>
  );
}
