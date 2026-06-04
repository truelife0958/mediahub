import { useEffect, useMemo, useState } from 'react';
import type { ReferencePromptTemplate, ReferenceSettings, SearchAliasGroup } from '../../types';
import { AdminSection, EmptyHint } from './AdminWidgets';
import { clonePromptTemplates, cloneStringList, serializePromptTemplates, serializeStringList } from './referenceDrafts';
import type { ContentType, ReferenceSection } from './types';
import { TYPE_OPTIONS } from './types';

interface ReferencePanelProps {
  activeTab: string;
  referenceSettings: ReferenceSettings | null;
  aliasGroups: SearchAliasGroup[];
  savingReference: ReferenceSection | null;
  onSavePromptTemplates: (templates: ReferencePromptTemplate[]) => void;
  onSaveKeywordPresets: (keywords: string[]) => void;
  onSaveRecommendationRules: (rules: string[]) => void;
  onCreateAliasGroup: (payload: { canonicalKeyword: string; aliases: string[]; type: '' | ContentType; enabled: boolean; notes: string }) => void;
  onUpdateAliasGroup: (id: number, payload: Partial<{ canonicalKeyword: string; aliases: string[]; type: '' | ContentType; enabled: boolean; notes: string }>) => void;
  onDeleteAliasGroup: (id: number) => void;
}

export function ReferencePanel({
  activeTab,
  referenceSettings,
  aliasGroups,
  savingReference,
  onSavePromptTemplates,
  onSaveKeywordPresets,
  onSaveRecommendationRules,
  onCreateAliasGroup,
  onUpdateAliasGroup,
  onDeleteAliasGroup,
}: ReferencePanelProps) {
  if (activeTab === 'aliases') {
    return (
      <AliasLexiconManager
        groups={aliasGroups}
        saving={savingReference === 'aliases'}
        onCreate={onCreateAliasGroup}
        onUpdate={onUpdateAliasGroup}
        onDelete={onDeleteAliasGroup}
      />
    );
  }

  if (!referenceSettings) return <EmptyHint>规则参考加载中...</EmptyHint>;

  if (activeTab === 'prompt') {
    return (
      <PromptTemplates
        templates={referenceSettings.promptTemplates}
        saving={savingReference === 'prompt'}
        onSave={onSavePromptTemplates}
      />
    );
  }

  if (activeTab === 'keywords') {
    return (
      <KeywordManager
        keywords={referenceSettings.keywordPresets}
        saving={savingReference === 'keywords'}
        onSave={onSaveKeywordPresets}
      />
    );
  }

  return (
    <RuleCards
      title="推荐规则"
      items={referenceSettings.recommendationRules}
      saving={savingReference === 'rules'}
      onSave={onSaveRecommendationRules}
    />
  );
}

function PromptTemplates({
  templates,
  saving,
  onSave,
}: {
  templates: ReferencePromptTemplate[];
  saving: boolean;
  onSave: (templates: ReferencePromptTemplate[]) => void;
}) {
  const savedSignature = useMemo(() => serializePromptTemplates(templates), [templates]);
  const [draft, setDraft] = useState<ReferencePromptTemplate[]>(() => clonePromptTemplates(templates));
  const dirty = serializePromptTemplates(draft) !== savedSignature;

  useEffect(() => {
    setDraft(clonePromptTemplates(templates));
  }, [savedSignature, templates]);

  const updateTemplate = (index: number, patch: Partial<ReferencePromptTemplate>) => {
    setDraft(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const reset = () => {
    setDraft(clonePromptTemplates(templates));
  };

  const action = (
    <div className="flex flex-wrap items-center gap-2">
      {dirty && <span className="rounded-full border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">有未保存改动</span>}
      <button className="control-button rounded-lg px-4 py-2 text-sm font-bold" onClick={reset} disabled={saving || !dirty}>重置改动</button>
      <button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={() => onSave(draft)} disabled={saving || !dirty}>{saving ? '保存中...' : '保存 Prompt 模板'}</button>
    </div>
  );

  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';

  return (
    <AdminSection
      title="Prompt 模板"
      description="每个模板均可直接编辑并保存到后台运行配置。"
      action={action}
    >
      <datalist id="prompt-status-options">
        <option value="线上" />
        <option value="备用" />
        <option value="归档" />
        <option value="测试" />
      </datalist>
      <div className="space-y-3">
        {draft.map((item, index) => (
          <div key={`prompt-template-${index}`} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                {`Prompt 版本 ${index + 1}`}
                <input value={item.version} onChange={e => updateTemplate(index, { version: e.target.value })} className={inputClass} />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                {`Prompt 名称 ${index + 1}`}
                <input value={item.name} onChange={e => updateTemplate(index, { name: e.target.value })} className={inputClass} />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                {`Prompt 状态 ${index + 1}`}
                <input list="prompt-status-options" value={item.status} onChange={e => updateTemplate(index, { status: e.target.value })} className={inputClass} />
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold text-[var(--text-muted)]">
              {`Prompt 内容 ${index + 1}`}
              <textarea value={item.prompt} onChange={e => updateTemplate(index, { prompt: e.target.value })} rows={3} className={inputClass} />
            </label>
          </div>
        ))}
      </div>
    </AdminSection>
  );
}

function KeywordManager({
  keywords,
  saving,
  onSave,
}: {
  keywords: string[];
  saving: boolean;
  onSave: (keywords: string[]) => void;
}) {
  const savedSignature = useMemo(() => serializeStringList(keywords), [keywords]);
  const [draft, setDraft] = useState<string[]>(() => cloneStringList(keywords));
  const dirty = serializeStringList(draft) !== savedSignature;
  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';

  useEffect(() => {
    setDraft(cloneStringList(keywords));
  }, [savedSignature, keywords]);

  const reset = () => {
    setDraft(cloneStringList(keywords));
  };

  return (
    <AdminSection
      title="热门关键词"
      description="用于指导 AI 热门检索和运营选题；每个词条可直接编辑。"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="rounded-full border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">有未保存改动</span>}
          <button className="control-button rounded-lg px-4 py-2 text-sm font-bold" onClick={reset} disabled={saving || !dirty}>重置改动</button>
          <button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={() => onSave(draft)} disabled={saving || !dirty}>{saving ? '保存中...' : '保存热门关键词'}</button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {draft.map((item, index) => (
          <label key={`keyword-preset-${index}`} className="block text-xs font-semibold text-[var(--text-muted)]">
            {`热门关键词 ${index + 1}`}
            <input value={item} onChange={e => setDraft(prev => prev.map((keyword, itemIndex) => itemIndex === index ? e.target.value : keyword))} className={inputClass} />
          </label>
        ))}
      </div>
    </AdminSection>
  );
}

function RuleCards({
  title,
  items,
  saving,
  onSave,
}: {
  title: string;
  items: string[];
  saving: boolean;
  onSave: (items: string[]) => void;
}) {
  const savedSignature = useMemo(() => serializeStringList(items), [items]);
  const [draft, setDraft] = useState<string[]>(() => cloneStringList(items));
  const dirty = serializeStringList(draft) !== savedSignature;
  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';

  useEffect(() => {
    setDraft(cloneStringList(items));
  }, [savedSignature, items]);

  const reset = () => {
    setDraft(cloneStringList(items));
  };

  return (
    <AdminSection
      title={title}
      description="推荐排序规则集中维护；每条规则都可编辑保存。"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="rounded-full border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">有未保存改动</span>}
          <button className="control-button rounded-lg px-4 py-2 text-sm font-bold" onClick={reset} disabled={saving || !dirty}>重置改动</button>
          <button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={() => onSave(draft)} disabled={saving || !dirty}>{saving ? '保存中...' : '保存推荐规则'}</button>
        </div>
      }
    >
      <div className="space-y-3">
        {draft.map((item, index) => (
          <label key={`recommendation-rule-${index}`} className="block text-xs font-semibold text-[var(--text-muted)]">
            {`推荐规则 ${index + 1}`}
            <textarea value={item} onChange={e => setDraft(prev => prev.map((rule, itemIndex) => itemIndex === index ? e.target.value : rule))} rows={2} className={inputClass} />
          </label>
        ))}
      </div>
    </AdminSection>
  );
}

interface AliasDraft {
  canonicalKeyword: string;
  aliasesText: string;
  type: '' | ContentType;
  enabled: boolean;
  notes: string;
}

function createAliasDraft(group?: SearchAliasGroup): AliasDraft {
  return {
    canonicalKeyword: group?.canonicalKeyword || '',
    aliasesText: Array.isArray(group?.aliases) ? group.aliases.join('，') : '',
    type: (group?.type || '') as '' | ContentType,
    enabled: group?.enabled ?? true,
    notes: group?.notes || '',
  };
}

function parseAliasText(value: string) {
  const seen = new Set<string>();
  const items: string[] = [];
  value
    .split(/[\n,，、]/)
    .map(item => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });
  return items;
}

function serializeAliasDraft(draft: AliasDraft) {
  return JSON.stringify({
    canonicalKeyword: draft.canonicalKeyword.trim(),
    aliases: parseAliasText(draft.aliasesText),
    type: draft.type,
    enabled: draft.enabled,
    notes: draft.notes.trim(),
  });
}

function AliasLexiconManager({
  groups,
  saving,
  onCreate,
  onUpdate,
  onDelete,
}: {
  groups: SearchAliasGroup[];
  saving: boolean;
  onCreate: (payload: { canonicalKeyword: string; aliases: string[]; type: '' | ContentType; enabled: boolean; notes: string }) => void;
  onUpdate: (id: number, payload: Partial<{ canonicalKeyword: string; aliases: string[]; type: '' | ContentType; enabled: boolean; notes: string }>) => void;
  onDelete: (id: number) => void;
}) {
  const [createDraft, setCreateDraft] = useState<AliasDraft>(() => createAliasDraft());
  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';

  return (
    <div className="space-y-4">
      <AdminSection
        title="别名词库"
        description="维护短剧、小说、动漫、漫画的主词和别名，用于本地搜索召回和 AI 搜索提示增强。"
        action={
          <button
            className="gold-surface rounded-lg px-4 py-2 text-sm font-bold"
            onClick={() => {
              if (!createDraft.canonicalKeyword.trim()) return;
              onCreate({
                canonicalKeyword: createDraft.canonicalKeyword.trim(),
                aliases: parseAliasText(createDraft.aliasesText),
                type: createDraft.type,
                enabled: createDraft.enabled,
                notes: createDraft.notes.trim(),
              });
              setCreateDraft(createAliasDraft());
            }}
            disabled={saving || !createDraft.canonicalKeyword.trim()}
          >
            {saving ? '提交中...' : '新增词组'}
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-xs font-semibold text-[var(--text-muted)]">
            主词
            <input value={createDraft.canonicalKeyword} onChange={e => setCreateDraft(prev => ({ ...prev, canonicalKeyword: e.target.value }))} className={inputClass} placeholder="如：家里家外" />
          </label>
          <label className="block text-xs font-semibold text-[var(--text-muted)]">
            分类范围
            <select value={createDraft.type} onChange={e => setCreateDraft(prev => ({ ...prev, type: e.target.value as '' | ContentType }))} className={inputClass}>
              <option value="">全部分类</option>
              {TYPE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[var(--text-muted)] md:col-span-2">
            别名列表
            <textarea value={createDraft.aliasesText} onChange={e => setCreateDraft(prev => ({ ...prev, aliasesText: e.target.value }))} rows={3} className={inputClass} placeholder="多个别名使用逗号或换行分隔，如：盛夏芬德拉，无双" />
          </label>
          <label className="block text-xs font-semibold text-[var(--text-muted)] md:col-span-2">
            备注
            <textarea value={createDraft.notes} onChange={e => setCreateDraft(prev => ({ ...prev, notes: e.target.value }))} rows={2} className={inputClass} placeholder="可记录来源、运营备注、歧义说明" />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
            <input type="checkbox" checked={createDraft.enabled} onChange={e => setCreateDraft(prev => ({ ...prev, enabled: e.target.checked }))} />
            启用该词组
          </label>
        </div>
      </AdminSection>

      <AdminSection title="已生效词组" description="编辑后立即作用于本地搜索和 AI 搜索提示。">
        <div className="space-y-3">
          {groups.length === 0 ? <EmptyHint>暂无别名词组。</EmptyHint> : groups.map(group => (
            <AliasGroupCard key={group.id} group={group} saving={saving} onSave={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      </AdminSection>
    </div>
  );
}

function AliasGroupCard({
  group,
  saving,
  onSave,
  onDelete,
}: {
  group: SearchAliasGroup;
  saving: boolean;
  onSave: (id: number, payload: Partial<{ canonicalKeyword: string; aliases: string[]; type: '' | ContentType; enabled: boolean; notes: string }>) => void;
  onDelete: (id: number) => void;
}) {
  const [draft, setDraft] = useState<AliasDraft>(() => createAliasDraft(group));
  const savedSignature = useMemo(() => serializeAliasDraft(createAliasDraft(group)), [group]);
  const dirty = serializeAliasDraft(draft) !== savedSignature;
  const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]';

  useEffect(() => {
    setDraft(createAliasDraft(group));
  }, [group, savedSignature]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">{group.canonicalKeyword}</p>
          <p className="text-xs text-[var(--text-muted)]">更新于 {new Date(group.updatedAt).toLocaleString('zh-CN')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{group.type ? TYPE_OPTIONS.find(item => item.id === group.type)?.label || group.type : '全部分类'}</span>
          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${group.enabled ? 'border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] text-emerald-200' : 'border border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]'}`}>{group.enabled ? '启用' : '停用'}</span>
          {dirty && <span className="rounded-full border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">待保存</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          主词
          <input value={draft.canonicalKeyword} onChange={e => setDraft(prev => ({ ...prev, canonicalKeyword: e.target.value }))} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)]">
          分类范围
          <select value={draft.type} onChange={e => setDraft(prev => ({ ...prev, type: e.target.value as '' | ContentType }))} className={inputClass}>
            <option value="">全部分类</option>
            {TYPE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)] md:col-span-2">
          别名列表
          <textarea value={draft.aliasesText} onChange={e => setDraft(prev => ({ ...prev, aliasesText: e.target.value }))} rows={3} className={inputClass} />
        </label>
        <label className="block text-xs font-semibold text-[var(--text-muted)] md:col-span-2">
          备注
          <textarea value={draft.notes} onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))} rows={2} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
          <input type="checkbox" checked={draft.enabled} onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))} />
          启用该词组
        </label>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={() => setDraft(createAliasDraft(group))} disabled={saving || !dirty}>重置</button>
        <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={() => onDelete(group.id)} disabled={saving}>删除</button>
        <button
          className="gold-surface rounded-lg px-3 py-2 text-xs font-bold"
          onClick={() => onSave(group.id, {
            canonicalKeyword: draft.canonicalKeyword.trim(),
            aliases: parseAliasText(draft.aliasesText),
            type: draft.type,
            enabled: draft.enabled,
            notes: draft.notes.trim(),
          })}
          disabled={saving || !dirty || !draft.canonicalKeyword.trim()}
        >
          {saving ? '保存中...' : '保存词组'}
        </button>
      </div>
    </div>
  );
}
