import { notFound } from 'next/navigation';

import { ApprovalPanel } from '../../../components/approval-panel';
import { LiveDebateView } from '../../../components/live-debate-view';
import { RiskBadge } from '../../../components/risk-badge';
import { getTrpcCaller } from '../../../lib/trpc/server';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caller = await getTrpcCaller();
  const data = await caller.decisionByEventId(id);

  if (!data) {
    notFound();
  }

  const riskTier = data.decision.riskTier;
  const needsApproval = riskTier === 'MEDIUM' || riskTier === 'HIGH';

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Debate Viewer</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{data.event?.repository}</h1>
            <p className="mt-3 text-sm text-mist/65">
              {data.event?.branch} • {data.event?.failureType} • {data.event?.commitSha}
            </p>
          </div>
          <RiskBadge tier={riskTier} />
        </div>
      </section>

      <LiveDebateView eventId={data.event?.eventId ?? id} initialData={data} />

      {needsApproval ? <ApprovalPanel decisionId={data.decision.decisionId} /> : null}
    </div>
  );
}
