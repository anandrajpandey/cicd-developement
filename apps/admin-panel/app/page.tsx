import Link from 'next/link';

import { ArrowUpRight, Github, Sparkles, Waves } from 'lucide-react';

import { LiveConfidenceGraph } from '../components/dashboard/live-confidence-graph';
import { RotatingHeroTitle } from '../components/dashboard/rotating-hero-title';
import { ExecutionPathStrip } from '../components/execution-path-strip';
import { LiveCommitBanner } from '../components/live-commit-banner';
import { RiskBadge } from '../components/risk-badge';
import { listWorkflows } from '../lib/orchestrator';
import { getTrpcCaller } from '../lib/trpc/server';

function scoreToPercent(value: number) {
  return Math.round(value * 100);
}

function matchesSearch(value: string | null | undefined, query: string) {
  return typeof value === 'string' && value.toLowerCase().includes(query);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const caller = await getTrpcCaller();
  const [summary, decisions, workflows] = await Promise.all([
    caller.dashboardSummary(),
    caller.recentDecisions(),
    listWorkflows(),
  ]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = resolvedSearchParams?.q?.trim().toLowerCase() ?? '';

  const filteredDecisions = query
    ? decisions.filter(
        (item) =>
          matchesSearch(item.repository, query) ||
          matchesSearch(item.branch, query) ||
          matchesSearch(item.failureType, query) ||
          matchesSearch(item.eventId, query) ||
          matchesSearch(item.decisionId, query),
      )
    : decisions;

  const filteredWorkflows = query
    ? workflows.filter(
        (item) =>
          matchesSearch(item.repository, query) ||
          matchesSearch(item.branch, query) ||
          matchesSearch(item.failureType, query) ||
          matchesSearch(item.eventId, query) ||
          matchesSearch(item.decision?.decisionId, query),
      )
    : workflows;

  const activeDecisions = filteredDecisions.length;
  const low = filteredDecisions.filter((item) => item.riskTier === 'LOW').length;
  const medium = filteredDecisions.filter((item) => item.riskTier === 'MEDIUM').length;
  const high = filteredDecisions.filter((item) => item.riskTier === 'HIGH').length;
  const avgCompositeScore =
    filteredDecisions.length === 0
      ? 0
      : filteredDecisions.reduce((sum, item) => sum + item.compositeScore, 0) /
        filteredDecisions.length;
  const adkBackedRounds = filteredDecisions.reduce(
    (sum, item) =>
      sum + Object.values(item.executionMeta).filter((source) => source === 'ADK').length,
    0,
  );
  const nativeFallbackRounds = filteredDecisions.length * 4 - adkBackedRounds;
  const latestDecision = filteredDecisions[0] ?? null;
  const latestCompositeScore = latestDecision?.compositeScore ?? 0;
  const latestCoverage = latestDecision
    ? scoreToPercent(
        Object.values(latestDecision.executionMeta).filter((source) => source === 'ADK').length / 4,
      )
    : 0;

  return (
    <div className="space-y-5">
      <LiveCommitBanner />

      <section className="dashboard-hero-grid">
        <div className="dashboard-hero-surface">
          <div className="dashboard-orb" />
          <div className="dashboard-lines" />

          <div className="relative z-10 max-w-[620px]">
            <p className="dashboard-kicker">Welcome back</p>
            <RotatingHeroTitle />
            <p className="mt-5 text-sm leading-7 text-white/58">
              Watch failures move through analysis, contradiction, rebuttal, and final synthesis in
              one live operator surface.
            </p>

            <div className="mt-7 flex gap-3">
              <Link href="/events/new" className="dashboard-primary-button">
                Submit Event
              </Link>
              <Link href="/debate" className="dashboard-secondary-button">
                Open Debate
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-4 text-xs uppercase tracking-[0.22em] text-white/48">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.45)]" />
                Live orchestration
              </span>
              <span>{summary.pendingApprovals} approvals pending</span>
              {query ? <span>filtered by “{resolvedSearchParams?.q}”</span> : null}
            </div>
          </div>
        </div>

        <div className="dashboard-side-stack">
          <div className="dashboard-metric-strip">
            <div>
              <p className="dashboard-mini-label">Active decisions</p>
              <p className="mt-2 text-3xl font-semibold text-white">{activeDecisions}</p>
              <p className="mt-2 text-xs text-white/72">
                {low} low / {medium} medium / {high} high
              </p>
            </div>
            <div className="dashboard-icon-pill">
              <Waves className="h-4 w-4" />
            </div>
          </div>

          <div className="dashboard-metric-strip">
            <div>
              <p className="dashboard-mini-label">AI-backed rounds</p>
              <p className="mt-2 text-3xl font-semibold text-white">{adkBackedRounds}</p>
              <p className="mt-2 text-xs text-white/72">
                {nativeFallbackRounds} native fallback rounds
              </p>
            </div>
            <div className="dashboard-icon-pill">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>

          <div className="dashboard-mini-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-mini-label">Connected repository</p>
                <p className="mt-2 text-sm font-medium text-white">
                  anandrajpandey/cicd-developement
                </p>
              </div>
              <Github className="h-4 w-4 text-white/72" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-white/45">
              branch feed online
            </p>
          </div>
        </div>
      </section>

      <section className="dashboard-analytics-grid">
        <div className="dashboard-embedded-surface">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="dashboard-mini-label">Composite health</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {scoreToPercent(avgCompositeScore)} average confidence
              </h3>
            </div>
            <div className="text-right">
              <p className="dashboard-mini-label">Latest ADK coverage</p>
              <p className="mt-2 text-2xl font-semibold text-white">{latestCoverage}%</p>
            </div>
          </div>

          <div className="mt-8">
            <LiveConfidenceGraph initialWorkflows={filteredWorkflows} />
          </div>
        </div>

        <div className="dashboard-embedded-surface dashboard-score-surface">
          <p className="dashboard-mini-label">Latest composite score</p>
          {latestDecision ? (
            <>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{latestDecision.repository}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/45">
                    {latestDecision.branch}
                  </p>
                </div>
                <RiskBadge tier={latestDecision.riskTier} />
              </div>

              <div className="mt-8">
                <div className="dashboard-ring">
                  <div className="dashboard-ring-core">
                    <span className="text-5xl font-semibold text-white">
                      {scoreToPercent(latestCompositeScore)}
                    </span>
                    <span className="mt-1 text-xs uppercase tracking-[0.24em] text-white/45">
                      score
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <ExecutionPathStrip meta={latestDecision.executionMeta} />
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-white/52">No completed debates yet.</p>
          )}
        </div>
      </section>

      <section className="dashboard-embedded-surface">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="dashboard-mini-label">Recent decisions</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Live operator stream</h3>
          </div>
          <Link href="/debate" className="dashboard-inline-link">
            Open full debate console
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-7 space-y-3">
          {filteredDecisions.length === 0 ? (
            <div className="py-10 text-sm text-white/52">
              No matching debates found. Try repository name, branch, event id, or decision id.
            </div>
          ) : (
            filteredDecisions.slice(0, 6).map((item) => (
              <Link
                key={item.decisionId}
                href={`/events/${item.eventId}`}
                className="dashboard-stream-row"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-sm font-medium text-white">{item.repository}</p>
                    <RiskBadge tier={item.riskTier} />
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/45">
                    {item.branch} / {item.failureType}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <ExecutionPathStrip meta={item.executionMeta} compact />
                  <span className="text-sm font-semibold text-white">
                    {scoreToPercent(item.compositeScore)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
