import type { AdminModule } from './AdminShell';
import type { AiFormState, ContentType } from './types';

export const INITIAL_REFRESHING_STATE: Record<ContentType, boolean> = {
  drama: false,
  novel: false,
  comic: false,
  anime: false,
};

export const INITIAL_AI_FORM_STATE: AiFormState = {
  enabled: true,
  model: '',
  baseUrl: '',
  apiKey: '',
  persistTarget: 'runtime',
};

export const ADMIN_MODULES: AdminModule[] = [
  {
    id: 'operate',
    label: '功能操作',
    subtitle: '内容编辑、AI 入库、模型配置',
    icon: '功',
    tabs: [
      { id: 'library', label: '内容编辑' },
      { id: 'ingest', label: 'AI 入库' },
      { id: 'ai', label: 'AI 设置' },
    ],
  },
  {
    id: 'monitor',
    label: '设置监控',
    subtitle: '总览、质量、源健康、系统日志',
    icon: '设',
    tabs: [
      { id: 'metrics', label: '数据总览' },
      { id: 'insights', label: '榜单洞察' },
      { id: 'quality', label: '质量治理' },
      { id: 'routing', label: '源健康' },
      { id: 'system', label: '系统设置' },
      { id: 'logs', label: '运行日志' },
    ],
  },
  {
    id: 'reference',
    label: '规则参考',
    subtitle: 'Prompt、关键词、排序规则、别名词库',
    icon: '参',
    tabs: [
      { id: 'prompt', label: 'Prompt 模板' },
      { id: 'keywords', label: '热门关键词' },
      { id: 'rules', label: '推荐规则' },
      { id: 'aliases', label: '别名词库' },
    ],
  },
];

export function createModuleTabState(modules: AdminModule[]) {
  return Object.fromEntries(modules.map(module => [module.id, module.tabs[0]?.id || '']));
}

export function getModuleById(moduleId: string) {
  return ADMIN_MODULES.find(item => item.id === moduleId) || ADMIN_MODULES[0];
}

export function resolveModuleTab(module: AdminModule, candidate: string | undefined) {
  return module.tabs.some(tab => tab.id === candidate) ? candidate || module.tabs[0].id : module.tabs[0].id;
}

export function classifyAdminError(error: unknown): string {
  // Silently skip cancelled requests (component unmount / dep change)
  if (error instanceof DOMException && error.name === 'AbortError') return '';
  const text = error instanceof Error ? error.message : String(error || '未知错误');
  if (/超时|timeout|cancel/i.test(text)) return `网络超时：${text}`;
  if (/api key|401|403|鉴权|密钥/i.test(text)) return `模型鉴权：${text}`;
  if (/rate|429|限流/i.test(text)) return `调用限流：${text}`;
  return text;
}
