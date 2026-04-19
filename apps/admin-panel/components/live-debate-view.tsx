'use client';

import { useEffect, useMemo, useState } from 'react';

import { io, type Socket } from 'socket.io-client';

import type { DecisionDetail } from '../lib/orchestrator';
import { cn } from '../lib/utils';
import { RiskBadge } from './risk-badge';

type LiveState = {
  findings: DecisionDetail['findings'];
  challenges: DecisionDetail['challenges'];
  rebuttals: DecisionDetail['rebuttals'];
  decision: DecisionDetail['decision'] | null;
};

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

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://localhost:4000';
    const socket: Socket = io(baseUrl, { transports: ['websocket'] });

    socket.emit('debate:subscribe', eventId);
    socket.on(
      'round:0:complete',
      (payload: { eventId: string; findings: LiveState['findings'] }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, findings: payload.findings }));
        }
      },
    );
    socket.on(
      'round:1:complete',
      (payload: { eventId: string; challenges: LiveState['challenges'] }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, challenges: payload.challenges }));
        }
      },
    );
    socket.on(
      'round:2:complete',
      (payload: { eventId: string; rebuttals: LiveState['rebuttals'] }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, rebuttals: payload.rebuttals }));
        }
      },
    );
    socket.on(
      'decision:ready',
      (payload: { eventId: string; decision: NonNullable<LiveState['decision']> }) => {
        if (payload.eventId === eventId) {
          setState((previous) => ({ ...previous, decision: payload.decision }));
        }
      },
    );

    return () => {
      socket.emit('debate:unsubscribe', eventId);
      socket.close();
    };
  }, [eventId]);

  const challengeByTarget = useMemo(
    () => new Map(state.challenges.map((challenge) => [challenge.targetAgentId, challenge])),
    [state.challenges],
  );

  const rebuttalByChallenge = useMemo(
    () => new Map(state.rebuttals.map((rebuttal) => [rebuttal.challengeId, rebuttal])),
    [state.rebuttals],
  );

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Round 0</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Parallel Agent Findings</h2>
          </div>
          <div className="text-sm text-mist/60">{state.findings.length}/4 findings received</div>
        </div>

        {state.decision?.executionMeta ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {Object.entries(state.decision.executionMeta).map(([round, source]) => (
              <div key={round} className="rounded-2xl border border-line bg-black/15 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-mist/55">{round}</p>
                <p
                  className={cn(
                    'mt-2 text-sm font-semibold',
                    source === 'ADK' ? 'text-mint' : 'text-amber-200',
                  )}
                >
                  {source}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {state.findings.map((finding) => (
            <article
              key={finding.findingId}
              className="rounded-3xl border border-line bg-black/15 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-mint/80">
                  {finding.agentId.replaceAll('_', ' ')}
                </p>
                <span className="text-sm text-mist/70">
                  {(finding.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/5">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-signal to-mint"
                  style={{ width: `${finding.confidence * 100}%` }}
                />
              </div>
              <p className="mt-4 text-base text-white">{finding.hypothesis}</p>
              <ul className="mt-4 space-y-2 text-sm text-mist/70">
                {finding.evidence.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/5 bg-white/5 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-6">
          <p className="eyebrow">Round 1 & 2</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Challenges & Rebuttals</h2>
          <div className="mt-6 space-y-4">
            {state.findings.map((finding) => {
              const challenge = challengeByTarget.get(finding.agentId);
              const rebuttal = challenge ? rebuttalByChallenge.get(challenge.challengeId) : null;

              return (
                <div
                  key={finding.agentId}
                  className="rounded-3xl border border-line bg-black/15 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm uppercase tracking-[0.18em] text-mint/80">
                      {finding.agentId.replaceAll('_', ' ')}
                    </div>
                    <div className="text-xs text-mist/55">
                      {challenge ? `Challenged by ${challenge.challengerAgentId}` : 'No challenge'}
                    </div>
                  </div>

                  {challenge ? (
                    <>
                      <p className="mt-4 text-sm text-white">{challenge.counterHypothesis}</p>
                      <div
                        className={cn(
                          'mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-medium',
                          rebuttal?.position === 'CONCEDE'
                            ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
                            : 'border-mint/25 bg-mint/10 text-mint',
                        )}
                      >
                        {rebuttal?.position ?? 'Awaiting rebuttal'}
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-mist/65">
                      This finding survived Round 1 unchanged.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel p-6">
          <p className="eyebrow">Round 3</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Judge Decision</h2>
          {state.decision ? (
            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between">
                <RiskBadge tier={state.decision.riskTier} />
                <div className="text-3xl font-semibold text-white">
                  {(state.decision.compositeScore * 100).toFixed(0)}
                </div>
              </div>
              <p className="text-sm leading-7 text-mist/80">{state.decision.reasoning}</p>
              <div className="rounded-3xl border border-mint/15 bg-mint/8 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-mint/75">
                  Recommended Action
                </p>
                <p className="mt-2 text-sm text-white">{state.decision.recommendedAction}</p>
              </div>
            </div>
          ) : (
            <div className="mt-10 rounded-3xl border border-dashed border-line p-6 text-sm text-mist/65">
              Waiting for judge synthesis...
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
