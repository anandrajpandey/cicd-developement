import { notFound } from 'next/navigation';

import { ApprovalPanel } from '../../../components/approval-panel';
import { DebateViewer } from '../../../components/debate/DebateViewer';
import { ExecutionPathStrip, getAdkCoverage } from '../../../components/execution-path-strip';
import { ExecutionStatusCard } from '../../../components/execution-status-card';
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
  const adkCoverage = getAdkCoverage(data.decision.executionMeta);

  return (
    <div className="space-y-6">
      <section className="panel animated-panel p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Debate Viewer</p>
            <h1 className="mt-2 text-4xl font-semibold text-white">{data.event?.repository}</h1>
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
        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_320px]">
          <ExecutionStatusCard meta={data.decision.executionMeta} />
          <div className="rounded-3xl border border-line bg-[rgba(7,15,26,0.65)] p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">Failure Log</p>
            <pre className="mt-3 max-h-40 scroll-panel overflow-auto whitespace-pre-wrap text-xs leading-6 text-mist/72">
              {data.event?.errorLog}
            </pre>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border border-white/5 bg-[rgba(14,25,41,0.8)] rounded-[30px]">
        <DebateViewer key={data.event?.eventId ?? id} eventId={data.event?.eventId ?? id} />
      </div>

      <ApprovalPanel decisionId={data.decision.decisionId} isAutoMitigated={riskTier === 'LOW'} />
    </div>
  );
}
