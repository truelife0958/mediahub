import { Suspense, lazy, Component, type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ScrollToTopButton from './components/ScrollToTopButton';
import ApiState from './components/ApiState';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Detail = lazy(() => import('./pages/Detail'));
const Admin = lazy(() => import('./pages/Admin'));
const Search = lazy(() => import('./pages/Search'));

class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)]">
          <div className="api-state-icon">!</div>
          <h2 className="text-xl font-semibold">出了点问题</h2>
          <p className="text-sm text-[var(--text-muted)] mb-2">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="gold-surface px-6 py-2 rounded-xl font-semibold text-sm cursor-pointer border-0 transition-all duration-200 hover:shadow-[0_8px_24px_-8px_rgba(232,168,56,0.5)]"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-center">
        <div className="gold-surface w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center animate-float">
          <span className="text-sm font-black">MH</span>
        </div>
        <div className="w-32 h-1 rounded-full bg-[var(--border)] overflow-hidden mx-auto">
          <div className="h-full rounded-full bg-[var(--accent-primary)] animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RouteLoadingBar() {
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2px]">
      <div className="h-full bg-[var(--accent-primary)] animate-route-loading" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RouteLoadingBar />
        <ScrollToTop />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/detail/:id" element={<Detail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/:type" element={<Home />} />
            <Route
              path="*"
              element={(
                <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] px-4">
                  <div className="text-6xl mb-2 opacity-20">404</div>
                  <ApiState
                    title="页面不存在"
                    description="访问路径无效，请返回首页重新选择内容。"
                    actionLabel="返回首页"
                    onAction={() => { window.location.href = '/'; }}
                  />
                </div>
              )}
            />
          </Routes>
        </Suspense>
        <ScrollToTopButton />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
