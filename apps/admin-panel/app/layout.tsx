import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

import { Shell } from '../components/shell';

export const metadata: Metadata = {
  title: 'Agentic CI/CD Admin',
  description: 'Live multi-agent CI/CD debate control panel',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
