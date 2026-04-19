'use client';

import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { Shell } from './shell';

export function AppFrame({ children }: PropsWithChildren) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return <Shell>{children}</Shell>;
}
