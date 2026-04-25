import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
});

import './globals.css';
import '@xyflow/react/dist/style.css';

import { AppFrame } from '../components/app-frame';

export const metadata: Metadata = {
  title: 'Agentic CI/CD Admin',
  description: 'Live multi-agent CI/CD debate control panel',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={orbitron.variable}>
      <body className="font-sans bg-[#08080A] text-white overflow-hidden">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
