import type { ReactNode } from 'react';

export type IconName = 'arrow' | 'camera' | 'voice' | 'pause' | 'settings' | 'check' | 'lock' | 'plus' | 'refresh';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    camera: <><rect x="3" y="6" width="14" height="12" rx="3" /><path d="m17 10 4-2v8l-4-2" /></>,
    voice: <><path d="m4 9 4 0 5-4v14l-5-4H4Z" /><path d="M17 8a7 7 0 0 1 0 8m3-11a11 11 0 0 1 0 14" /></>,
    pause: <path d="M8 5v14M16 5v14" />,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
    check: <path d="m5 12 4 4 10-10" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: <path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none"><path d="M8 28V18a6 6 0 0 1 12 0v10-10a6 6 0 0 1 12 0v10" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg>
    </span>
  );
}
