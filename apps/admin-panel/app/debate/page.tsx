import Link from 'next/link';

import { notFound } from 'next/navigation';

import { DebateViewer } from '../../components/debate/DebateViewer';
import { RiskBadge } from '../../components/risk-badge';
import { getTrpcCaller } from '../../lib/trpc/server';

export default async function DebateConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId } = await searchParams;
  const caller = await getTrpcCaller();
  const decisions = await caller.recentDecisions();
  const selectedEventId = eventId ?? decisions[0]?.eventId;

  if (!selectedEventId) {
    return (
      <div className="panel p-8">
        <p className="eyebrow">Debate Console</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">No debates yet</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-mist/72">
          Submit a pipeline event to see the full debate stream, rebuttal exchange, and judge output
          here.
        </p>
      </div>
    );
  }

  const selected = await caller.decisionByEventId(selectedEventId);

  if (!selected) {
    notFound();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="panel scroll-panel h-[calc(100vh-3rem)] overflow-y-auto p-5">
        <div>
          <p className="eyebrow">Debate Tab</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Debate Console</h1>
          <p className="mt-3 text-sm leading-6 text-mist/70">
            Switch between recent failures and inspect the full finding, challenge, rebuttal, and
            judge path in one place.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {decisions.map((decision) => {
            const active = decision.eventId === selectedEventId;

            return (
              <Link
                key={decision.decisionId}
                href={`/debate?eventId=${decision.eventId}`}
                className={`block rounded-3xl border p-4 transition ${
                  active
                    ? 'border-[rgba(93,255,178,0.24)] bg-[rgba(7,27,24,0.7)] soft-glow-ring'
                    : 'border-line bg-[rgba(7,16,28,0.64)] hover:border-[rgba(93,255,178,0.16)] hover:bg-[rgba(8,20,32,0.82)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-white">{decision.repository}</p>
                  <RiskBadge tier={decision.riskTier} />
                </div>
                <p className="mt-2 truncate text-xs uppercase tracking-[0.18em] text-mist/55">
                  {decision.branch}
                </p>
                <p className="mt-2 text-sm text-mist/70">{decision.failureType}</p>
                <div className="mt-3 text-xs uppercase tracking-[0.18em] text-mint/70">
                  score {Math.round(decision.compositeScore * 100)}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="h-[calc(100vh-3rem)] overflow-y-auto border border-white/5 bg-[rgba(5,11,20,0.62)]">
        <DebateViewer
          key={selected.event?.eventId ?? selectedEventId}
          eventId={selected.event?.eventId ?? selectedEventId}
          initialData={selected}
        />
      </div>
    </div>
  );
}
