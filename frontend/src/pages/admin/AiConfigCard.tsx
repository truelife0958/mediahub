import type { AiConfig } from '../../types';
import type { AiFormState } from './types';

interface AiConfigCardProps {
  aiForm: AiFormState;
  aiConfig: AiConfig | null;
  savingAi: boolean;
  onChange: (updater: (prev: AiFormState) => AiFormState) => void;
  onSave: () => void;
}

export default function AiConfigCard({
  aiForm,
  aiConfig,
  savingAi,
  onChange,
  onSave,
}: AiConfigCardProps) {
  return (
    <div className="admin-card rounded-xl p-4">
      <h3 className="text-lg font-semibold mb-3 tracking-[-0.01em]">AI 模型设置</h3>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={aiForm.enabled}
            onChange={e => onChange(prev => ({ ...prev, enabled: e.target.checked }))}
          />
          启用 AI 数据获取与排序
        </label>
        <input
          value={aiForm.model}
          onChange={e => onChange(prev => ({ ...prev, model: e.target.value }))}
          placeholder="模型名，如 gpt-5-mini"
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(232,168,56,0.08)]"
        />
        <input
          value={aiForm.baseUrl}
          onChange={e => onChange(prev => ({ ...prev, baseUrl: e.target.value }))}
          placeholder="Base URL"
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(232,168,56,0.08)]"
        />
        <input
          value={aiForm.apiKey}
          onChange={e => onChange(prev => ({ ...prev, apiKey: e.target.value }))}
          placeholder={aiConfig?.hasApiKey ? '留空则保留现有 API Key' : '输入 API Key'}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_3px_rgba(232,168,56,0.08)]"
        />
        <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">保存位置</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3 text-xs text-[var(--text-secondary)]">
              <input
                type="radio"
                name="ai-persist-target"
                value="runtime"
                checked={aiForm.persistTarget === 'runtime'}
                onChange={() => onChange(prev => ({ ...prev, persistTarget: 'runtime' }))}
                className="mt-0.5"
              />
              <span><strong className="block text-[var(--text-primary)]">运行时数据库</strong>立即生效，适合临时调试。</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.06)] p-3 text-xs text-[var(--text-secondary)]">
              <input
                type="radio"
                name="ai-persist-target"
                value="env"
                checked={aiForm.persistTarget === 'env'}
                onChange={() => onChange(prev => ({ ...prev, persistTarget: 'env' }))}
                className="mt-0.5"
              />
              <span><strong className="block text-[var(--text-primary)]">环境变量 .env</strong>写入后端读取的环境文件，重启后仍可使用。</span>
            </label>
          </div>
          {aiConfig?.envFilePath && <p className="mt-2 break-all text-[11px] text-[var(--text-muted)]">最近 env 文件：{aiConfig.envFilePath}</p>}
        </div>
        <button
          onClick={onSave}
          disabled={savingAi}
          className="gold-surface px-4 py-2 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {savingAi ? '保存中...' : '保存 AI 配置'}
        </button>
      </div>
    </div>
  );
}
