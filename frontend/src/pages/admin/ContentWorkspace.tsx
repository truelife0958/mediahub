import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import type { Content } from '../../types';
import { AdminSection, EmptyHint, Pill } from './AdminWidgets';
import { cloneContentDraft, createContentEditorSignature, hasContentEditorChanges, parseEditorList } from './contentEditorState';
import type { ManualContentDraft } from './manualContent';
import type { ContentType } from './types';
import { TYPE_LABEL, TYPE_OPTIONS } from './types';
import { formatHotScoreShort } from '../../utils/hotScore';

interface ContentLibrarySectionProps {
  draft: ManualContentDraft;
  creating: boolean;
  onDraftChange: (draft: ManualContentDraft) => void;
  onCreate: () => void;
  contentTotal: number;
  contentType: ContentType;
  contentKeyword: string;
  onType: (type: ContentType) => void;
  onKeyword: (keyword: string) => void;
  onSearch: (keyword: string) => void;
  onClearSearch: () => void;
  contents: Content[];
  selectedContent: Content | null;
  loading: boolean;
  onEdit: (content: Content) => void;
}

interface ContentEditorDialogProps {
  content: Content | null;
  saving: boolean;
  filling: boolean;
  onClose: () => void;
  onSave: (content: Content) => void;
  onFillMissing: () => void;
}

function splitList(value: string) {
  return value.split(/[,\n，]/).map(item => item.trim()).filter(Boolean);
}

export function ContentLibrarySection({
  draft,
  creating,
  onDraftChange,
  onCreate,
  contentTotal,
  contentType,
  contentKeyword,
  onType,
  onKeyword,
  onSearch,
  onClearSearch,
  contents,
  selectedContent,
  loading,
  onEdit,
}: ContentLibrarySectionProps) {
  return (
    <div className="space-y-4">
      <ManualContentPanel draft={draft} creating={creating} onChange={onDraftChange} onCreate={onCreate} />
      <AdminSection
        title="内容库"
        description={`共 ${contentTotal} 条，点击卡片直接编辑。`}
        action={
          <ContentFilters
            type={contentType}
            keyword={contentKeyword}
            onType={onType}
            onKeyword={onKeyword}
            onSearch={onSearch}
            onClear={onClearSearch}
          />
        }
      >
        <ContentLibrary contents={contents} selectedContent={selectedContent} loading={loading} onEdit={onEdit} />
      </AdminSection>
    </div>
  );
}

function ContentFilters({
  type,
  keyword,
  onType,
  onKeyword,
  onSearch,
  onClear,
}: {
  type: ContentType;
  keyword: string;
  onType: (type: ContentType) => void;
  onKeyword: (keyword: string) => void;
  onSearch: (keyword: string) => void;
  onClear: () => void;
}) {
  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSearch(event.currentTarget.value);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <select value={type} onChange={e => onType(e.target.value as ContentType)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs">
        {TYPE_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <input
        value={keyword}
        aria-label="内容库搜索"
        data-testid="admin-library-search-input"
        onChange={e => onKeyword(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        placeholder="搜索标题/IP"
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs outline-none"
      />
      <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={() => onSearch(keyword)}>检索</button>
      {keyword && <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={onClear}>清空</button>}
    </div>
  );
}

function ContentLibrary({
  contents,
  selectedContent,
  loading,
  onEdit,
}: {
  contents: Content[];
  selectedContent: Content | null;
  loading: boolean;
  onEdit: (content: Content) => void;
}) {
  if (loading) return <EmptyHint>内容库加载中...</EmptyHint>;
  if (contents.length === 0) return <EmptyHint>暂无入库内容，可先到“AI 数据获取 / 手动入库”执行刷新。</EmptyHint>;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {contents.map(item => (
        <article
          key={item.id}
          className={`rounded-xl border p-3 transition-colors ${selectedContent?.id === item.id ? 'border-[rgba(232,168,56,0.42)] bg-[rgba(232,168,56,0.08)]' : 'border-[var(--border)] bg-[rgba(255,255,255,0.02)]'}`}
        >
          <button type="button" onClick={() => onEdit(item)} className="block w-full min-w-0 text-left" aria-label={`编辑内容：${item.title}`}>
            <h4 className="truncate text-sm font-bold text-[var(--text-primary)]">{item.title}</h4>
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{item.summary || '暂无简介'}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              <Pill>{TYPE_LABEL[item.type]}</Pill>
              <Pill tone={item.status === 'ongoing' ? 'ok' : 'default'}>{item.status === 'ongoing' ? '连载中' : '已完结'}</Pill>
              <Pill tone="ok">{formatHotScoreShort(item.hotScore, item.heatMetric)}</Pill>
            </div>
          </button>
        </article>
      ))}
    </div>
  );
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
            <input type="number" value={draft.hotScore} onChange={e => onChange({ ...draft, hotScore: e.target.value })} placeholder="播放量/阅读量(万次)" className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm" />
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

export function ContentEditorDialog({
  content,
  saving,
  filling,
  onClose,
  onSave,
  onFillMissing,
}: ContentEditorDialogProps) {
  const sourceSignature = useMemo(() => createContentEditorSignature(content), [content]);
  const [draft, setDraft] = useState<Content | null>(() => cloneContentDraft(content));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = hasContentEditorChanges(content, draft);

  useEffect(() => {
    setDraft(cloneContentDraft(content));
    setConfirmDiscard(false);
  }, [sourceSignature, content]);

  const requestClose = useCallback(() => {
    if (dirty && !saving && !filling) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [dirty, filling, onClose, saving]);

  const restoreDraft = useCallback(() => {
    setConfirmDiscard(false);
    setDraft(cloneContentDraft(content));
  }, [content]);

  const requestSave = useCallback(() => {
    if (!draft || !dirty || saving || filling) return;
    onSave(draft);
  }, [dirty, draft, filling, onSave, saving]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        requestSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose, requestSave]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-editor-title"
      onClick={handleBackdropClick}
    >
      <div className="admin-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl p-4 md:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">Content</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 id="content-editor-title" className="text-2xl font-black tracking-[-0.03em]">编辑内容</h3>
              {dirty && <span className="rounded-full border border-[rgba(232,168,56,0.24)] bg-[rgba(232,168,56,0.12)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">未保存修改</span>}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">点击内容卡片后在弹窗内编辑，保存后立即回写内容库。</p>
          </div>
          <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={requestClose}>关闭编辑</button>
        </div>

        {confirmDiscard && dirty && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[rgba(232,168,56,0.22)] bg-[rgba(232,168,56,0.08)] p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[var(--accent-primary)]">有未保存修改，关闭后本次编辑内容会丢失。</p>
            <div className="flex flex-wrap gap-2">
              <button className="control-button rounded-lg px-3 py-2 text-xs font-bold" onClick={() => setConfirmDiscard(false)}>继续编辑</button>
              <button className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100" onClick={onClose}>放弃修改</button>
            </div>
          </div>
        )}

        {!draft ? (
          <EmptyHint>先在内容库选择一条内容。</EmptyHint>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[var(--text-muted)]">
              标题
              <input value={draft.title} onChange={e => {
                setConfirmDiscard(false);
                setDraft(prev => prev ? { ...prev, title: e.target.value } : prev);
              }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
            </label>
            <label className="block text-xs font-semibold text-[var(--text-muted)]">
              简介
              <textarea value={draft.summary} onChange={e => {
                setConfirmDiscard(false);
                setDraft(prev => prev ? { ...prev, summary: e.target.value } : prev);
              }} rows={5} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
            </label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                状态
                <select value={draft.status} onChange={e => {
                  setConfirmDiscard(false);
                  setDraft(prev => prev ? { ...prev, status: e.target.value as Content['status'] } : prev);
                }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="ongoing">连载中</option>
                  <option value="completed">已完结</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                作者
                <input value={draft.author} onChange={e => {
                  setConfirmDiscard(false);
                  setDraft(prev => prev ? { ...prev, author: e.target.value } : prev);
                }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-muted)]">
                播放量/阅读量(万次)
                <input type="number" value={draft.hotScore} onChange={e => {
                  setConfirmDiscard(false);
                  setDraft(prev => prev ? { ...prev, hotScore: Number(e.target.value) } : prev);
                }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
              </label>
            </div>
            <label className="block text-xs font-semibold text-[var(--text-muted)]">
              标签
              <input value={draft.tags.join(', ')} onChange={e => {
                setConfirmDiscard(false);
                setDraft(prev => prev ? { ...prev, tags: parseEditorList(e.target.value) } : prev);
              }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
            </label>
            <div className="flex min-h-8 flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-2">
              {draft.tags.length
                ? draft.tags.map(tag => <Pill key={tag}>{tag}</Pill>)
                : <span className="text-xs text-[var(--text-muted)]">暂无标签，输入后会在这里预览。</span>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button className="control-button rounded-lg px-4 py-2 text-sm font-bold" onClick={restoreDraft} disabled={!dirty || saving || filling}>
                恢复原值
              </button>
              <button className="control-button rounded-lg px-4 py-2 text-sm font-bold" onClick={onFillMissing} disabled={filling}>
                {filling ? 'AI 补录中...' : 'AI 补缺失信息'}
              </button>
              <button className="gold-surface rounded-lg px-4 py-2 text-sm font-bold" onClick={requestSave} disabled={saving || filling || !dirty}>
                {saving ? '保存中...' : '保存内容'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
