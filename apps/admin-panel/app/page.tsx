import Link from 'next/link';

import { ArrowRight, Flame, ShieldAlert, Waves } from 'lucide-react';

import { ExecutionPathStrip, getAdkCoverage } from '../components/execution-path-strip';
import { ExecutionStatusCard } from '../components/execution-status-card';
import { RiskBadge } from '../components/risk-badge';
import { getTrpcCaller } from '../lib/trpc/server';

export default async function DashboardPage() {
  const caller = await getTrpcCaller();
  const [summary, decisions] = await Promise.all([
    caller.dashboardSummary(),
    caller.recentDecisions(),
  ]);

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden p-6">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="eyebrow">Operations Surface</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-white">
              Live debate-driven release triage with a sharp, operator-first control plane.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-mist/72">
              Monitor event intake, compare agent positions, inspect risk synthesis, and step in
              only when MEDIUM or HIGH decisions need a human gate.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/events/new"
                className="rounded-2xl bg-mint px-5 py-3 text-sm font-semibold text-ink"
              >
                Submit Event
              </Link>
              <Link
                href="/approvals"
                className="rounded-2xl border border-line px-5 py-3 text-sm font-semibold text-white"
              >
                Open Approval Queue
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="metric-card">
              <div className="flex items-center gap-3">
                <Waves className="h-5 w-5 text-mint" />
                <span className="text-sm text-mist/70">Total Events</span>
              </div>
              <div className="mt-4 text-4xl font-semibold text-white">{summary.totalEvents}</div>
            </div>
            <div className="metric-card">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-mint" />
                <span className="text-sm text-mist/70">Pending Approvals</span>
              </div>
              <div className="mt-4 text-4xl font-semibold text-white">
                {summary.pendingApprovals}
              </div>
            </div>
            <div className="metric-card">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-mint" />
                <span className="text-sm text-mist/70">ADK-backed Decisions</span>
              </div>
              <div className="mt-4 text-4xl font-semibold text-white">{summary.adkDominant}</div>
              <div className="mt-3 text-xs text-mist/60">
                {summary.fallbackTouched} decisions touched fallback logic
              </div>
            </div>
            <div className="metric-card">
              <div className="flex items-center gap-3">
                <Flame className="h-5 w-5 text-mint" />
                <span className="text-sm text-mist/70">Average Composite Score</span>
              </div>
              <div className="mt-4 text-4xl font-semibold text-white">
                {(summary.avgCompositeScore * 100).toFixed(0)}
              </div>
              <div className="mt-5 flex gap-2 text-xs">
                <span className="badge badge-low">{summary.low} low</span>
                <span className="badge badge-medium">{summary.medium} medium</span>
                <span className="badge badge-high">{summary.high} high</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <div>
          <p className="eyebrow">Recent Decisions</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Latest pipeline outcomes</h2>
        </div>

        {decisions[0]?.executionMeta ? (
          <div className="mt-6">
            <ExecutionStatusCard meta={decisions[0].executionMeta} />
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {decisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line p-8 text-sm text-mist/60">
              No decisions yet. Submit a pipeline event to start the debate flow.
            </div>
          ) : (
            decisions.slice(0, 8).map((item) => (
              <Link
                key={item.decisionId}
                href={`/events/${item.eventId}`}
                className="flex items-center justify-between rounded-3xl border border-line bg-black/15 px-5 py-4 transition hover:border-mint/35 hover:bg-black/25"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-sm font-medium text-white">{item.repository}</p>
                    <RiskBadge tier={item.riskTier} />
                  </div>
                  <p className="mt-2 truncate text-sm text-mist/65">
                    {item.branch} / {item.failureType}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <ExecutionPathStrip meta={item.executionMeta} compact />
                    <span className="text-xs uppercase tracking-[0.16em] text-mist/50">
                      {Math.round(getAdkCoverage(item.executionMeta).ratio * 100)}% ADK
                    </span>
                    <span className="text-xs uppercase tracking-[0.16em] text-mist/50">
                      {Math.round(item.compositeScore * 100)} score
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-mint" />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
