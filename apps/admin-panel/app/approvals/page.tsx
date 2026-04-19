import Link from 'next/link';

import { RiskBadge } from '../../components/risk-badge';
import { listApprovalQueue } from '../../lib/orchestrator';

export default async function ApprovalQueuePage() {
  const items = await listApprovalQueue();

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <p className="eyebrow">Queue</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Pending approvals</h1>
        <p className="mt-3 text-sm leading-7 text-mist/70">
          Medium and high risk outcomes that still need a human decision before remediation.
        </p>
      </section>

      <section className="panel p-6">
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line p-8 text-sm text-mist/60">
              No pending approvals right now.
            </div>
          ) : (
            items.map((item) => (
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
                    {item.branch} • {(item.compositeScore * 100).toFixed(0)} score
                  </p>
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-mint/80">Review</div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
