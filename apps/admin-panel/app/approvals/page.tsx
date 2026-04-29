import Link from 'next/link';

import { ApprovalQueueActions } from '../../components/approval-queue-actions';
import { ExecutionPathStrip } from '../../components/execution-path-strip';
import { RiskBadge } from '../../components/risk-badge';
import { SlaBadge } from '../../components/sla-badge';
import { getTrpcCaller } from '../../lib/trpc/server';

export default async function ApprovalQueuePage() {
  const caller = await getTrpcCaller();
  const items = await caller.approvals();
  const pendingCount = items.length;
  const mediumCount = items.filter((item) => item.riskTier === 'MEDIUM').length;
  const highCount = items.filter((item) => item.riskTier === 'HIGH').length;

  return (
    <div className="space-y-6">
      <section className="panel animated-panel p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow">Queue</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Pending approvals</h1>
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-100">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.65)]" />
            Slack connected
          </div>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-7 text-mist/70">
          Medium and high risk outcomes that still need a human decision before remediation.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-mist/55">
          <span className="rounded-full border border-white/10 bg-black/15 px-3 py-2 text-white/80">
            {pendingCount} pending
          </span>
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-amber-100">
            {mediumCount} medium
          </span>
          <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-rose-100">
            {highCount} high
          </span>
        </div>
      </section>

      <section className="panel p-6">
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line p-8 text-sm text-mist/60">
              No pending approvals right now.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.decisionId}
                className="group grid gap-5 rounded-[28px] border border-line bg-black/15 p-5 transition hover:border-mint/35 hover:bg-black/25 xl:grid-cols-[1fr_auto] xl:items-start"
              >
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="truncate text-lg font-semibold text-white">{item.repository}</p>
                    <RiskBadge tier={item.riskTier} />
                    <SlaBadge createdAt={item.createdAt} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-mist/55">
                    <span>{item.branch}</span>
                    <span className="h-1 w-1 rounded-full bg-white/30" />
                    <span>{(item.compositeScore * 100).toFixed(0)} score</span>
                    <span className="h-1 w-1 rounded-full bg-white/30" />
                    <span>{item.failureType}</span>
                  </div>

                  <div className="rounded-3xl border border-white/8 bg-black/15 p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-mist/50">Reasoning</p>
                    <p className="mt-2 text-sm leading-6 text-mist/80">{item.reasoning}</p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/8 bg-black/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-mist/50">
                        Recommended action
                      </p>
                      <p className="mt-2 text-sm leading-6 text-white">{item.recommendedAction}</p>
                    </div>
                    <div className="rounded-3xl border border-white/8 bg-black/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-mist/50">Review link</p>
                      <p className="mt-2 text-sm leading-6 text-mist/75">
                        Open the event detail to approve or reject the decision and trigger the Slack notification.
                      </p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <ExecutionPathStrip meta={item.executionMeta} compact />
                  </div>

                  <div className="pt-2">
                    <ApprovalQueueActions decisionId={item.decisionId} approvedLabel={item.repository} />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 xl:flex-col xl:items-end xl:justify-start">
                  <div className="rounded-3xl border border-white/8 bg-black/15 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-mist/50">Score</p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {(item.compositeScore * 100).toFixed(0)}
                    </p>
                  </div>
                  <Link
                    href={`/events/${item.eventId}`}
                    className="text-xs uppercase tracking-[0.2em] text-mint/80 transition group-hover:text-mint"
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
