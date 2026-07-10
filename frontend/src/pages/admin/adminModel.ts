import type { AdminModule } from './AdminShell';
import type { ContentType } from './types';

export const INITIAL_REFRESHING_STATE: Record<ContentType, boolean> = {
  drama: false,
  novel: false,
  anime: false,
  comic: false,
};

export const ADMIN_MODULES: AdminModule[] = [
  {
    id: 'data',
    label: '数据面板',
    subtitle: '采集状态、运行日志、JSON 预览和异常提示',
    icon: '数',
    tabs: [
      { id: 'status', label: '状态' },
      { id: 'logs', label: '日志' },
      { id: 'json', label: 'JSON' },
      { id: 'anomalies', label: '异常' },
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

export function createIngestStageState(
  initialValue: string,
): Record<ContentType, string> {
  return {
    drama: initialValue,
    novel: initialValue,
    anime: initialValue,
    comic: initialValue,
  };
}

export function classifyAdminError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '';
  const text = error instanceof Error ? error.message : String(error || '未知错误');
  if (/timeout|cancel|超时/i.test(text)) return `网络超时：${text}`;
  if (/rate|429|限流/i.test(text)) return `平台限流：${text}`;
  if (/401|403|forbidden|unauthorized|鉴权|权限/i.test(text)) return `平台拒绝访问：${text}`;
  return text;
}
