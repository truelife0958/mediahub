export function IconBack({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function IconMedia({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 15.5l3-3 2.5 2.5 4-4" />
      <circle cx="16.5" cy="8.5" r="1.2" />
    </svg>
  );
}

export function IconGear({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.99l.04.04a2.1 2.1 0 1 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.99-.36 1.8 1.8 0 0 0-1.08 1.64V21.4a2.1 2.1 0 1 1-4.2 0v-.16a1.8 1.8 0 0 0-1.08-1.64 1.8 1.8 0 0 0-1.99.36l-.04.04a2.1 2.1 0 1 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2.8a2.1 2.1 0 1 1 0-4.2h.16A1.8 1.8 0 0 0 4.6 8.64a1.8 1.8 0 0 0-.36-1.99l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.99.36h.01A1.8 1.8 0 0 0 10.3 2.4V2.2a2.1 2.1 0 1 1 4.2 0v.2a1.8 1.8 0 0 0 1.08 1.64h.01a1.8 1.8 0 0 0 1.99-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.99v.01a1.8 1.8 0 0 0 1.64 1.08h.2a2.1 2.1 0 1 1 0 4.2h-.2A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

export function IconHeart({ size = 18, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M19.5 5.5a5 5 0 0 0-7.07 0L12 5.93l-.43-.43a5 5 0 0 0-7.07 7.07l.43.43L12 20l7.07-6.93.43-.43a5 5 0 0 0 0-7.07Z" />
    </svg>
  );
}

export function IconHistory({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.71" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconUser({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}
