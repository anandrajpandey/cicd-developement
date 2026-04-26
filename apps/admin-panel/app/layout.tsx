import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Rajdhani } from 'next/font/google';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-rajdhani',
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
    <html lang="en" className={rajdhani.variable}>
      <body className="font-sans tracking-wide bg-[#08080A] text-white overflow-hidden">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
