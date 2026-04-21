'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';

import { Activity, Binary, ClipboardList, ShieldCheck, Sparkles, Waves, Zap } from 'lucide-react';

import { cn } from '../lib/utils';
import { SignOutButton } from './sign-out-button';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Activity },
  { href: '/debate', label: 'AI Insights', icon: Binary },
  { href: '/mitigations', label: 'Auto Mitigations', icon: Zap },
  { href: '/events/new', label: 'Submit Event', icon: Waves },
  { href: '/testcases', label: 'Simulation Hub', icon: Sparkles },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: typeof Activity }>;

export function Shell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="glass-grid h-screen min-h-screen overflow-hidden">
      <div className="grid h-screen grid-cols-[296px_minmax(0,1fr)]">
<aside className="border-r border-white/10 bg-black/60 shadow-[inset_-1px_0_0_rgba(255,255,255,0.05),0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex h-full flex-col justify-between py-8 px-6">
          <div className="space-y-10">
            <div className="px-2">
              <h1 className="text-2xl font-light tracking-[0.25em] text-white/90 uppercase font-mono">
                Agentic CI/CD
              </h1>
            </div>

            <nav className="space-y-2">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm transition',
                    pathname === href
                      ? 'border-[rgba(93,255,178,0.22)] bg-[rgba(10,35,30,0.78)] text-white soft-glow-ring'
                      : 'border-transparent text-mist/72 hover:border-[rgba(93,255,178,0.12)] hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      pathname === href
                        ? 'text-mint'
                        : 'text-[rgba(125,189,232,0.76)] group-hover:text-mint',
                    )}
                  />
                  <span className="font-medium">{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="rounded-3xl border border-[rgba(98,129,156,0.18)] bg-[rgba(0,0,0,0.4)] p-4 text-sm text-mist/75">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-2 text-white min-w-0">
                <ClipboardList className="h-4 w-4 shrink-0 text-mint" />
                <span className="font-medium truncate">Operator</span>
              </div>
              <SignOutButton />
            </div>
          </div>
        </aside>

        <main className="scroll-panel h-screen overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
