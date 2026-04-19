import { notFound } from 'next/navigation';

import { ApprovalPanel } from '../../../components/approval-panel';
import { ExecutionPathStrip, getAdkCoverage } from '../../../components/execution-path-strip';
import { ExecutionStatusCard } from '../../../components/execution-status-card';
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
  const adkCoverage = getAdkCoverage(data.decision.executionMeta);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Debate Viewer</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{data.event?.repository}</h1>
            <p className="mt-3 text-sm text-mist/65">
              {data.event?.branch} / {data.event?.failureType} / {data.event?.commitSha}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ExecutionPathStrip meta={data.decision.executionMeta} />
              <span className="text-xs uppercase tracking-[0.2em] text-mist/55">
                {adkCoverage.adkRounds}/{adkCoverage.totalRounds} rounds on ADK
              </span>
              <span className="text-xs uppercase tracking-[0.2em] text-mist/55">
                {Math.round(data.decision.compositeScore * 100)} score
              </span>
            </div>
          </div>
          <RiskBadge tier={riskTier} />
        </div>
        <div className="mt-5">
          <ExecutionStatusCard meta={data.decision.executionMeta} />
        </div>
      </section>

      <LiveDebateView eventId={data.event?.eventId ?? id} initialData={data} />

      {needsApproval ? <ApprovalPanel decisionId={data.decision.decisionId} /> : null}
    </div>
  );
}
