import Link from 'next/link';

import { ArrowRight, Flame, ShieldAlert, Waves, Github, GitBranch } from 'lucide-react';

import { ExecutionPathStrip, getAdkCoverage } from '../components/execution-path-strip';
import { LiveCommitBanner } from '../components/live-commit-banner';
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
      <LiveCommitBanner />
      <section className="panel animated-panel overflow-hidden p-8">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="eyebrow">System Overview</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight text-white">
              AI-Powered Release Intelligence
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-mist/72">
              Accelerate incident resolution, automate pipeline triage, and maintain release velocity without leaving the control plane.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/events/new"
                className="glow-button rounded-2xl px-5 py-3 text-sm font-semibold"
              >
                Ingest New Flow
              </Link>
              <Link
                href="/debate"
                className="ghost-button rounded-2xl border px-5 py-3 text-sm font-semibold"
              >
                Investigate Insights
              </Link>
              <Link
                href="/approvals"
                className="ghost-button rounded-2xl border px-5 py-3 text-sm font-semibold"
              >
                Pending Approvals
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-between rounded-2xl border border-[rgba(98,129,156,0.18)] bg-black/40 p-4 w-fit min-w-[340px]">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                  <Github className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/90">Connected Repository</p>
                  <p className="text-xs font-mono text-mist/70 tracking-wider">agentic-cicd/dash</p>
                </div>
              </div>
              <div className="ml-8 flex items-center gap-2 rounded-full bg-mint/10 px-3 py-1 text-xs font-semibold text-mint">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-mint"></span>
                </span>
                Active
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                <GitBranch className="h-5 w-5 text-mint" />
                <span className="text-sm text-mist/70">Contested Debates</span>
              </div>
              <div className="mt-4 text-4xl font-semibold text-white">{summary.contestedDebates}</div>
              <div className="mt-3 text-xs text-mist/60">
                {summary.activeWorkflows} workflows still live
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

      <section className="panel animated-panel p-6">
        <div>
          <p className="eyebrow">Recent Activity</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Latest pipeline decisions</h2>
        </div>

        <div className="mt-6 space-y-3">
          {decisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line p-8 text-sm text-mist/60">
              No resolutions computed yet. Ingest an event to enable autonomous insights.
            </div>
          ) : (
            decisions.slice(0, 8).map((item) => (
              <Link
                key={item.decisionId}
                href={`/events/${item.eventId}`}
                className="stage-card flex items-center justify-between rounded-3xl border border-line bg-[rgba(5,13,22,0.64)] px-5 py-4 transition hover:border-mint/25 hover:bg-[rgba(6,18,30,0.82)]"
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
                      {Math.round(getAdkCoverage(item.executionMeta).ratio * 100)}% AI CONFIDENCE
                    </span>
                    <span className="text-xs uppercase tracking-[0.16em] text-mist/50">
                      {Math.round(item.compositeScore * 100)} RELIABILITY INDEX
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
