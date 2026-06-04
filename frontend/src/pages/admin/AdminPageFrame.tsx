import type { ReactNode } from 'react';
import Header from '../../components/Header';

export default function AdminPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--bg-primary)]">
      <div className="app-backdrop" />
      <Header />
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
