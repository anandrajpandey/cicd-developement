'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { Activity, Binary, LogOut, Search, ShieldCheck, Sparkles, Waves, Zap } from 'lucide-react';

import { cn } from '../lib/utils';
import { SignOutButton } from './sign-out-button';

const navItems = [
  { href: '/', label: 'Dashboard', icon: Activity },
  { href: '/debate', label: 'Debate', icon: Binary },
  { href: '/mitigations', label: 'Mitigations', icon: Zap },
  { href: '/events/new', label: 'Submit Event', icon: Waves },
  { href: '/testcases', label: 'Simulation Hub', icon: Sparkles },
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
] as const satisfies ReadonlyArray<{ href: Route; label: string; icon: typeof Activity }>;

function getPageLabel(pathname: string): string {
  const direct = navItems.find((item) => item.href === pathname);
  if (direct) {
    return direct.label;
  }

  if (pathname.startsWith('/events/')) {
    return 'Event Detail';
  }

  return 'Dashboard';
}

export function Shell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const pageLabel = useMemo(() => getPageLabel(pathname), [pathname]);
  const expanded = hoverExpanded;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
  }, [pathname]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = query.trim();
    const params =
      typeof window === 'undefined'
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);

    if (trimmed) {
      params.set('q', trimmed);
    } else {
      params.delete('q');
    }

    const target = pathname === '/' ? '/' : '/';
    const qs = params.toString();
    router.push(qs ? `${target}?${qs}` : target);
  }

  return (
    <div className="dashboard-stage h-screen overflow-hidden">
      <div className="dashboard-backdrop" />
      <div className="dashboard-backdrop-secondary" />

      <div className="dashboard-frame">
        <aside
          onMouseEnter={() => setHoverExpanded(true)}
          onMouseLeave={() => setHoverExpanded(false)}
          className={cn(
            'dashboard-sidebar transition-all duration-300',
            expanded ? 'w-[288px]' : 'w-[92px]',
          )}
        >
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="dashboard-sidebar-header px-5 pt-5">
                <div className="min-w-0">
                  <div
                    className={cn(
                      'dashboard-brand transition-opacity duration-200',
                      !expanded && 'opacity-0',
                    )}
                  >
                    <span className="dashboard-brand-text">Agentic CICD</span>
                    <span className="dashboard-brand-dots" aria-hidden="true">
                      ...
                    </span>
                  </div>
                </div>
              </div>

              <div className="dashboard-sidebar-divider mt-6 mx-4" />

              <div className="mt-6 space-y-2 px-4">
                {navItems.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;

                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        'dashboard-nav-item',
                        active && 'dashboard-nav-item-active',
                        !expanded && 'justify-center px-0',
                      )}
                    >
                      <span className={cn('dashboard-nav-icon', active && 'text-white')}>
                        <Icon className="h-4 w-4" />
                      </span>
                      {expanded ? (
                        <span className="truncate text-sm font-medium text-white/88">{label}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="px-4 pb-5">
              <div
                className={cn(
                  'dashboard-signout-row',
                  expanded ? 'w-full' : 'justify-center',
                )}
              >
                {expanded ? (
                  <SignOutButton />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const form = document.querySelector('form[action="/api/auth/signout"]');
                      if (form instanceof HTMLFormElement) {
                        form.requestSubmit();
                      }
                    }}
                    className="dashboard-signout-icon"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="dashboard-topbar">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                Pages / {pageLabel}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-white">{pageLabel}</h1>
            </div>

            <div className="flex items-center gap-4">
              <form onSubmit={handleSearchSubmit} className="dashboard-search">
                <Search className="h-4 w-4 text-white/38" />
                <input
                  value={query}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setQuery(nextValue);

                    if (typeof window !== 'undefined' && nextValue.trim() === '') {
                      const currentParams = new URLSearchParams(window.location.search);
                      if (currentParams.has('q')) {
                        currentParams.delete('q');
                        const qs = currentParams.toString();
                        router.push(qs ? `/?${qs}` : '/');
                      }
                    }
                  }}
                  placeholder="Search event, repo, or id..."
                  className="w-[220px] bg-transparent text-xs text-white outline-none placeholder:text-white/28"
                />
              </form>
              <span className="text-xs text-white/48">admin@local.dev</span>
            </div>
          </header>

          <section className="dashboard-content scroll-panel">{children}</section>
        </main>
      </div>
    </div>
  );
}
