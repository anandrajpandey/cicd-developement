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
  { href: '/debate', label: 'Debate', icon: Binary },
  { href: '/mitigations', label: 'Auto Mitigations', icon: Zap },
  { href: '/events/new', label: 'Submit Event', icon: Waves },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: typeof Activity }>;

export function Shell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="glass-grid h-screen min-h-screen overflow-hidden">
      <div className="grid h-screen grid-cols-[296px_minmax(0,1fr)]">
        <aside className="border-r border-white/5 bg-[linear-gradient(180deg,rgba(5,14,24,0.98),rgba(6,17,28,0.98))] px-5 py-6">
          <div className="panel flex h-full flex-col justify-between p-5">
            <div className="space-y-8">
              <div>
                <p className="eyebrow">Agentic CI/CD</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                  Release Intelligence
                </h1>
                <p className="mt-3 text-sm leading-6 text-mist/70">
                  Debate-first control plane for failure triage, rebuttal review, and high-signal
                  operator decisions.
                </p>
                <div className="mt-5 rounded-2xl border border-[rgba(93,255,178,0.12)] bg-[rgba(8,24,32,0.82)] p-4 soft-glow-ring">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <Sparkles className="h-4 w-4 text-mint" />
                    ADK debate path armed
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-mist/55">
                    Four-stage orchestration
                  </p>
                </div>
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

            <div className="rounded-3xl border border-[rgba(98,129,156,0.18)] bg-[rgba(7,18,30,0.82)] p-4 text-sm text-mist/75">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                  <ClipboardList className="h-4 w-4 text-mint" />
                  <span className="font-medium">Operator Session</span>
                </div>
                <SignOutButton />
              </div>
              <p className="mb-3">admin@local.dev</p>
              <p>
                Desktop-first monitoring surface with full-viewport debate playback and approval
                controls.
              </p>
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
