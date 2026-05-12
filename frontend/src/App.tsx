import { Suspense, lazy, Component, type ReactNode, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { UserProvider } from './api';
import ScrollToTopButton from './components/ScrollToTopButton';

const Home = lazy(() => import('./pages/Home'));
const Detail = lazy(() => import('./pages/Detail'));
const Profile = lazy(() => import('./pages/Profile'));

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
      <div className="w-10 h-10 border-2 border-[var(--border)] border-t-[var(--accent-primary)] rounded-full animate-spin" />
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

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <UserProvider>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/detail/:id" element={<Detail />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </Suspense>
          <ScrollToTopButton />
        </UserProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
