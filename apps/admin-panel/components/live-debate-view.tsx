'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  Activity,
  ArrowRight,
  Bot,
  Gavel,
  Radar,
  ShieldAlert,
  Sparkles,
  Swords,
} from 'lucide-react';
import { io, type Socket } from 'socket.io-client';

import type { DecisionDetail } from '../lib/orchestrator';
import { cn } from '../lib/utils';
import { ExecutionPathStrip } from './execution-path-strip';
import { ExecutionStatusCard } from './execution-status-card';
import { RiskBadge } from './risk-badge';

type LiveState = {
  findings: DecisionDetail['findings'];
  challenges: DecisionDetail['challenges'];
  rebuttals: DecisionDetail['rebuttals'];
  decision: DecisionDetail['decision'] | null;
};

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  tone: 'info' | 'success' | 'warning';
  timestamp: string;
};

const agentColors: Record<string, string> = {
  build_analyzer: 'from-cyan-400 to-sky-500',
  code_reviewer: 'from-emerald-400 to-green-500',
  test_analyzer: 'from-blue-400 to-indigo-500',
  dependency_checker: 'from-teal-300 to-emerald-500',
};

function createActivityItem(
  label: string,
  detail: string,
  tone: ActivityItem['tone'] = 'info',
): ActivityItem {
  return {
    id: `${label}-${detail}-${Date.now()}-${Math.random()}`,
    label,
    detail,
    tone,
    timestamp: new Date().toLocaleTimeString(),
  };
}

function buildInitialActivity(initialData: DecisionDetail | null): ActivityItem[] {
  if (!initialData) {
    return [];
  }

  const items = [createActivityItem('Debate Loaded', 'Stored debate state loaded into the console.')];

  if (initialData.findings.length > 0) {
    items.unshift(
      createActivityItem(
        'Round 0 Complete',
        `${initialData.findings.length} specialist findings landed.`,
        'success',
      ),
    );
  }

  if (initialData.challenges.length > 0) {
    items.unshift(
      createActivityItem(
        'Round 1 Complete',
        `${initialData.challenges.length} contradiction${initialData.challenges.length === 1 ? '' : 's'} entered the debate.`,
        'warning',
      ),
    );
  }

  if (initialData.rebuttals.length > 0) {
    items.unshift(
      createActivityItem(
        'Round 2 Complete',
        `${initialData.rebuttals.length} rebuttal${initialData.rebuttals.length === 1 ? '' : 's'} recorded.`,
        'warning',
      ),
    );
  }

  if (initialData.decision) {
    items.unshift(
      createActivityItem(
        'Judge Ready',
        `${initialData.decision.riskTier} risk at ${(initialData.decision.compositeScore * 100).toFixed(0)} score.`,
        'success',
      ),
    );
  }

  return items;
}

function getAgentLabel(agentId: string) {
  return agentId.replaceAll('_', ' ');
}

function getActivityToneClasses(tone: ActivityItem['tone']) {
  if (tone === 'success') {
    return 'border-mint/20 bg-[rgba(8,36,29,0.72)]';
  }

  if (tone === 'warning') {
    return 'border-amber-400/20 bg-[rgba(44,30,12,0.45)]';
  }

  return 'border-line bg-[rgba(7,16,28,0.72)]';
}

function getConfidenceWidth(value: number) {
  return `${Math.max(6, Math.round(value * 100))}%`;
}

function findChallengeForAgent(
  challenges: DecisionDetail['challenges'],
  agentId: string,
) {
  return challenges.find((challenge) => challenge.targetAgentId === agentId) ?? null;
}

function findRebuttalForChallenge(
  rebuttals: DecisionDetail['rebuttals'],
  challengeId: string | null,
) {
  if (!challengeId) {
    return null;
  }

  return rebuttals.find((rebuttal) => rebuttal.challengeId === challengeId) ?? null;
}

export function LiveDebateView({
  eventId,
  initialData,
}: {
  eventId: string;
  initialData: DecisionDetail | null;
}) {
  const [state, setState] = useState<LiveState>({
    findings: initialData?.findings ?? [],
    challenges: initialData?.challenges ?? [],
    rebuttals: initialData?.rebuttals ?? [],
    decision: initialData?.decision ?? null,
  });
  const [activity, setActivity] = useState<ActivityItem[]>(() => buildInitialActivity(initialData));

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://localhost:4000';
    const socket: Socket = io(baseUrl, { transports: ['websocket'] });

    socket.emit('debate:subscribe', eventId);
    socket.on(
      'debate:started',
      (payload: { eventId: string; repository: string; branch: string; failureType: string }) => {
        if (payload.eventId === eventId) {
          setActivity((previous) => [
            createActivityItem(
              'Debate Started',
              `${payload.repository} / ${payload.branch} / ${payload.failureType}`,
              'info',
            ),
            ...previous,
          ]);
        }
      },
    );
    socket.on(
      'round:0:complete',
      (payload: { eventId: string; findings: LiveState['findings'] }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, findings: payload.findings }));
          setActivity((previous) => [
            createActivityItem(
              'Round 0 Complete',
              `${payload.findings.length} findings landed from the specialists.`,
              'success',
            ),
            ...previous,
          ]);
        }
      },
    );
    socket.on(
      'round:1:complete',
      (payload: { eventId: string; challenges: LiveState['challenges'] }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, challenges: payload.challenges }));
          setActivity((previous) => [
            createActivityItem(
              'Round 1 Complete',
              payload.challenges.length === 0
                ? 'No contradiction cleared the challenge threshold.'
                : `${payload.challenges.length} formal challenge${payload.challenges.length === 1 ? '' : 's'} registered.`,
              payload.challenges.length === 0 ? 'info' : 'warning',
            ),
            ...previous,
          ]);
        }
      },
    );
    socket.on(
      'round:2:complete',
      (payload: { eventId: string; rebuttals: LiveState['rebuttals'] }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, rebuttals: payload.rebuttals }));
          setActivity((previous) => [
            createActivityItem(
              'Round 2 Complete',
              payload.rebuttals.length === 0
                ? 'No rebuttals were needed.'
                : `${payload.rebuttals.length} rebuttal${payload.rebuttals.length === 1 ? '' : 's'} preserved or conceded findings.`,
              payload.rebuttals.length === 0 ? 'info' : 'warning',
            ),
            ...previous,
          ]);
        }
      },
    );
    socket.on(
      'decision:ready',
      (payload: { eventId: string; decision: NonNullable<LiveState['decision']> }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, decision: payload.decision }));
          setActivity((previous) => [
            createActivityItem(
              'Judge Ready',
              `${payload.decision.riskTier} risk at ${(payload.decision.compositeScore * 100).toFixed(0)} score.`,
              'success',
            ),
            ...previous,
          ]);
        }
      },
    );

    return () => {
      socket.emit('debate:unsubscribe', eventId);
      socket.close();
    };
  }, [eventId]);

  const timeline = useMemo(
    () => [
      {
        label: 'Round 0',
        detail: `${state.findings.length}/4 findings`,
        complete: state.findings.length > 0,
      },
      {
        label: 'Round 1',
        detail: `${state.challenges.length} challenge${state.challenges.length === 1 ? '' : 's'}`,
        complete: activity.some((item) => item.label === 'Round 1 Complete'),
      },
      {
        label: 'Round 2',
        detail: `${state.rebuttals.length} rebuttal${state.rebuttals.length === 1 ? '' : 's'}`,
        complete: activity.some((item) => item.label === 'Round 2 Complete'),
      },
      {
        label: 'Round 3',
        detail: state.decision ? state.decision.riskTier : 'Pending judge',
        complete: Boolean(state.decision),
      },
    ],
    [activity, state.challenges.length, state.decision, state.findings.length, state.rebuttals.length],
  );

  return (
    <div className="grid h-full gap-6 xl:grid-cols-[1.18fr_0.82fr]">
      <div className="scroll-panel h-full space-y-6 overflow-y-auto pr-1">
        <section className="panel animated-panel p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="eyebrow">Debate Playback</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Agent findings, contradictions, and rebuttal motion
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-mist/70">
                This surface shows the live debate rail, confidence spread, and each agent&apos;s
                proposed code change so you can move from diagnosis to patch direction quickly.
              </p>
            </div>

            {state.decision ? (
              <div className="rounded-3xl border border-[rgba(93,255,178,0.18)] bg-[rgba(7,24,22,0.74)] px-5 py-4 soft-glow-ring">
                <div className="text-[11px] uppercase tracking-[0.24em] text-mist/55">Judge</div>
                <div className="mt-2 flex items-center gap-3">
                  <RiskBadge tier={state.decision.riskTier} />
                  <span className="text-3xl font-semibold text-white">
                    {Math.round(state.decision.compositeScore * 100)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {state.decision?.executionMeta ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="rounded-3xl border border-line bg-[rgba(6,15,27,0.72)] p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">Execution Path</p>
                <div className="mt-3">
                  <ExecutionPathStrip meta={state.decision.executionMeta} />
                </div>
              </div>
              <ExecutionStatusCard meta={state.decision.executionMeta} />
            </div>
          ) : null}
        </section>

        <section className="panel animated-panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Confidence Graph</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Specialist signal spread</h3>
            </div>
            <Radar className="h-5 w-5 text-mint" />
          </div>

          <div className="mt-6 space-y-4">
            {state.findings.map((finding, index) => (
              <div
                key={finding.findingId}
                className="animated-panel rounded-3xl border border-line bg-[rgba(7,16,28,0.7)] p-4"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">
                      {getAgentLabel(finding.agentId)}
                    </p>
                    <p className="mt-2 text-lg font-medium text-white">{finding.hypothesis}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-[0.18em] text-mist/55">confidence</div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {Math.round(finding.confidence * 100)}%
                    </div>
                  </div>
                </div>
                <div className="mt-4 h-3 rounded-full bg-[rgba(255,255,255,0.04)]">
                  <div
                    className={cn(
                      'chart-bar h-3 rounded-full bg-gradient-to-r',
                      agentColors[finding.agentId] ?? 'from-cyan-400 to-emerald-500',
                    )}
                    style={{ width: getConfidenceWidth(finding.confidence) }}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {finding.evidence.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/5 bg-white/5 px-3 py-1 text-xs text-mist/72"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel animated-panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Detailed Debate</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Finding to rebuttal trace</h3>
            </div>
            <Swords className="h-5 w-5 text-mint" />
          </div>

          <div className="mt-6 space-y-5">
            {state.findings.map((finding, index) => {
              const challenge = findChallengeForAgent(state.challenges, finding.agentId);
              const rebuttal = findRebuttalForChallenge(state.rebuttals, challenge?.challengeId ?? null);

              return (
                <article
                  key={finding.findingId}
                  className="animated-panel grid gap-4 rounded-[30px] border border-line bg-[rgba(7,16,28,0.72)] p-5 xl:grid-cols-[1.15fr_0.85fr]"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="debate-pulse flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(93,255,178,0.14)] bg-[rgba(10,31,25,0.62)]">
                        <Bot className="h-5 w-5 text-mint" />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">
                          {getAgentLabel(finding.agentId)}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-white">{finding.hypothesis}</p>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-line bg-[rgba(5,13,22,0.62)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">evidence</p>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-mist/78">
                        {finding.evidence.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-3xl border border-[rgba(93,255,178,0.12)] bg-[rgba(8,26,25,0.62)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-mint/80">
                        Proposed code change
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white">
                        {finding.proposedRemediation}
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-line bg-[rgba(6,14,24,0.7)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">
                        challenge lane
                      </p>
                      {challenge ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-100">
                            <ShieldAlert className="h-4 w-4" />
                            {getAgentLabel(challenge.challengerAgentId)}
                            <ArrowRight className="h-3 w-3" />
                            {getAgentLabel(challenge.targetAgentId)}
                          </div>
                          <p className="text-sm leading-7 text-white">{challenge.counterHypothesis}</p>
                          <ul className="space-y-2 text-sm text-mist/72">
                            {challenge.evidence.map((item) => (
                              <li key={item}>• {item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-mist/65">
                          No agent produced a strong enough contradiction to challenge this finding.
                        </p>
                      )}
                    </div>

                    <div className="rounded-3xl border border-line bg-[rgba(6,14,24,0.7)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">rebuttal</p>
                      {rebuttal ? (
                        <div className="mt-3 space-y-3">
                          <div
                            className={cn(
                              'inline-flex rounded-full border px-3 py-1 text-xs font-medium',
                              rebuttal.position === 'DEFEND'
                                ? 'border-mint/20 bg-mint/10 text-mint'
                                : 'border-amber-400/25 bg-amber-400/10 text-amber-100',
                            )}
                          >
                            {rebuttal.position}
                          </div>
                          <p className="text-sm text-mist/78">
                            Updated confidence {Math.round(rebuttal.updatedConfidence * 100)} with
                            rebuttal factor {rebuttal.rebuttalFactor.toFixed(2)}.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-mist/65">
                          No rebuttal was needed for this lane.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="scroll-panel h-full space-y-6 overflow-y-auto pr-1">
        <section className="panel animated-panel p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Round Timeline</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Live round motion</h3>
            </div>
            <Activity className="h-5 w-5 text-mint" />
          </div>

          <div className="mt-6 space-y-4">
            {timeline.map((item, index) => (
              <div key={item.label} className="relative pl-8">
                {index !== timeline.length - 1 ? (
                  <div className="timeline-line absolute left-[11px] top-8 h-[calc(100%+0.75rem)] w-px" />
                ) : null}
                <div
                  className={cn(
                    'absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold',
                    item.complete
                      ? 'debate-pulse border-mint/20 bg-[rgba(9,34,27,0.84)] text-mint'
                      : 'border-line bg-[rgba(8,16,28,0.84)] text-mist/60',
                  )}
                >
                  {index + 1}
                </div>
                <div className="rounded-3xl border border-line bg-[rgba(7,16,28,0.72)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-mist/55">
                        {item.detail}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium',
                        item.complete
                          ? 'border-mint/20 bg-mint/10 text-mint'
                          : 'border-line bg-[rgba(255,255,255,0.04)] text-mist/60',
                      )}
                    >
                      {item.complete ? 'Complete' : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel animated-panel p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Live Feed</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Streaming activity</h3>
            </div>
            <Sparkles className="h-5 w-5 text-mint" />
          </div>

          <div className="mt-6 space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line p-6 text-sm text-mist/65">
                Waiting for debate activity...
              </div>
            ) : (
              activity.map((item, index) => (
                <article
                  key={item.id}
                  className={cn(
                    'animated-panel rounded-3xl border p-4',
                    getActivityToneClasses(item.tone),
                  )}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <span className="text-xs uppercase tracking-[0.18em] text-mist/50">
                      {item.timestamp}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-mist/80">{item.detail}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel animated-panel p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Judge</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Decision and patch direction</h3>
            </div>
            <Gavel className="h-5 w-5 text-mint" />
          </div>

          {state.decision ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-line bg-[rgba(7,16,28,0.72)] p-5">
                <div className="flex items-center justify-between gap-4">
                  <RiskBadge tier={state.decision.riskTier} />
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-[0.18em] text-mist/55">score</div>
                    <div className="mt-2 text-3xl font-semibold text-white">
                      {Math.round(state.decision.compositeScore * 100)}
                    </div>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-mist/80">{state.decision.reasoning}</p>
              </div>

              <div className="rounded-3xl border border-[rgba(93,255,178,0.14)] bg-[rgba(8,26,25,0.68)] p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-mint/80">
                  Recommended code change
                </p>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white">
                  {state.decision.recommendedAction}
                </pre>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-line p-6 text-sm text-mist/65">
              Waiting for judge synthesis...
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
