import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContentDetail } from '../api';
import RelatedCard from '../components/RelatedCard';
import ApiState from '../components/ApiState';
import { CATEGORY_COLORS, CATEGORY_TEXT, CATEGORY_ICONS } from '../constants';
import { IconBack } from '../components/Icons';

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [retryKey, setRetryKey] = useState(0);
  const contentId = id || '';
  const invalidContentId = !/^[a-z]+:[a-z0-9-]+:[\w-]+$/i.test(contentId);
  const { content, loading, error } = useContentDetail(contentId, retryKey);

  const handleGoBack = useCallback(() => navigate(-1), [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="gold-surface w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center animate-float">
            <span className="text-sm font-black">MH</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] px-4">
        <ApiState
          title="详情源暂不可用"
          description={error || '内容不存在'}
          actionLabel={invalidContentId ? '返回首页' : '重新加载'}
          onAction={() => {
            if (invalidContentId) {
              navigate('/');
              return;
            }
            setRetryKey(key => key + 1);
          }}
        />
        <button
          onClick={handleGoBack}
          className="gold-surface inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border-0 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_-8px_rgba(232,168,56,0.5)]"
        >
          返回上一页
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoBack}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <IconBack size={16} />
            </button>
            <h1 className="font-semibold text-base truncate flex-1">{content.title}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 relative">
        <div className="rounded-2xl p-4 md:p-6 mb-6 animate-fade-in bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-card)]">
          <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md tracking-[0.02em] text-white" style={{ background: CATEGORY_COLORS[content.type] }}>
                  {CATEGORY_ICONS[content.type]} {CATEGORY_TEXT[content.type]}
                </span>
                <span className={`px-3 py-1 rounded-lg text-xs font-medium font-[tabular-nums] ${content.status === 'ongoing' ? 'bg-[rgba(34,197,94,0.12)] text-[#4ade80] border border-[rgba(34,197,94,0.2)]' : 'bg-[rgba(161,161,170,0.12)] text-[var(--text-muted)] border border-[rgba(161,161,170,0.15)]'}`}>
                  {content.status === 'ongoing' ? '连载中' : '已完结'}
                </span>
              </div>

              <h2 className="text-[28px] font-bold -tracking-[0.02em] leading-tight mb-4">{content.title}</h2>

              <div className="flex flex-col gap-3 mb-4 text-sm">
                {content.actors && content.actors.length > 0 && (
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-[var(--text-muted)] text-[13px] font-medium min-w-[40px] shrink-0">演员</span>
                    <span className="text-[var(--text-secondary)] text-sm min-w-0 break-words">{content.actors.join(' / ')}</span>
                  </div>
                )}
                {content.author && (
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-[var(--text-muted)] text-[13px] font-medium min-w-[40px] shrink-0">作者</span>
                    <span className="text-[var(--text-secondary)] text-sm min-w-0 break-words">{content.author}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {content.tags?.map((tag) => (
                  <span key={tag} className="inline-flex items-center px-3 py-1 rounded-[20px] text-xs font-medium bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)] border border-[rgba(255,255,255,0.06)] transition-colors duration-200 hover:bg-[rgba(255,255,255,0.1)] hover:text-[var(--text-primary)]">#{tag}</span>
                ))}
              </div>

              <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed mb-6 break-words">{content.summary}</p>

              <div className="detail-actions">
                <div className="detail-hot-score">
                  热度 {content.hotScore.toLocaleString()}
                </div>
                <span className="rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)]">
                  仅浏览展示
                </span>
              </div>

              {content.source && (
                <div className="mt-4 text-xs text-[var(--text-muted)]">
                  数据来源：{content.source.url ? (
                    <a href={content.source.url} target="_blank" rel="noreferrer" className="text-[var(--accent-primary)] hover:underline">
                      {content.source.label}
                    </a>
                  ) : content.source.label}
                  <span className="mx-2">·</span>
                  更新于 {new Date(content.updatedAt).toLocaleDateString('zh-CN')}
                </div>
              )}
          </div>
        </div>

        {content.relatedContents && content.relatedContents.length > 0 && (
          <section className="mb-6 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold">同IP其他形式</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
            </div>
            <div className="rounded-3xl p-4 grid grid-cols-2 max-md:grid-cols-1 gap-2 bg-[var(--bg-card)] border border-[var(--border)]">
              {content.relatedContents.map((item) => (
                <RelatedCard key={item.id} content={item} />
              ))}
            </div>
          </section>
        )}

        {content.similarContents && content.similarContents.length > 0 && (
          <section className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold">相似推荐</h3>
              <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
            </div>
            <div className="rounded-3xl p-4 grid grid-cols-2 max-md:grid-cols-1 gap-2 bg-[var(--bg-card)] border border-[var(--border)]">
              {content.similarContents.map((item) => (
                <RelatedCard key={item.id} content={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
