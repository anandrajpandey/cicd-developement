import type { Route } from 'next';
import Link from 'next/link';
import type { PropsWithChildren } from 'react';

import { Activity, ClipboardList, ShieldCheck, Waves } from 'lucide-react';

import { cn } from '../lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Activity },
  { href: '/events/new', label: 'Submit Event', icon: Waves },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: typeof Activity }>;

export function Shell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-grid bg-[size:44px_44px]">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8">
        <aside className="panel hidden w-72 shrink-0 flex-col justify-between p-5 lg:flex">
          <div className="space-y-8">
            <div>
              <p className="eyebrow">Agentic CI/CD</p>
              <h1 className="mt-3 text-2xl font-semibold text-white">Debate Control</h1>
              <p className="mt-3 text-sm leading-6 text-mist/70">
                Netlify-inspired operations console for live pipeline triage, debate review, and
                manual approvals.
              </p>
            </div>

            <nav className="space-y-2">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-sm text-mist/72 transition',
                    'hover:border-line hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4 text-mint" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="rounded-2xl border border-mint/15 bg-mint/8 p-4 text-sm text-mist/75">
            <div className="mb-2 flex items-center gap-2 text-white">
              <ClipboardList className="h-4 w-4 text-mint" />
              <span className="font-medium">Single-admin MVP</span>
            </div>
            <p>Credential flow and route protection can layer in next without reshaping the UI.</p>
          </div>
        </aside>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
