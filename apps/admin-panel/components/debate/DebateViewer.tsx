'use client';

import { useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';

import type { DecisionDetail } from '../../lib/orchestrator';
import { DebateGraph } from './DebateGraph';
import { FindingCard } from './FindingCard';
import { JudgeCard } from './JudgeCard';
import { RoundLabel } from './RoundLabel';
import type {
  AgentFinding,
  AgentId,
  AgentStatus,
  Challenge,
  Decision,
  Rebuttal,
} from './debate.types';

const ALL_AGENTS: AgentId[] = [
  'build_analyzer',
  'code_reviewer',
  'test_analyzer',
  'dependency_checker',
  'judge',
];

const DEFAULT_STATUSES = Object.fromEntries(ALL_AGENTS.map((id) => [id, 'idle'])) as Record<
  AgentId,
  AgentStatus
>;

function toFinding(finding: DecisionDetail['findings'][number]): AgentFinding {
  return {
    findingId: finding.findingId,
    agentId: finding.agentId as AgentId,
    hypothesis: finding.hypothesis,
    evidence: finding.evidence,
    confidence: finding.confidence,
    proposedRemediation: finding.proposedRemediation,
  };
}

function toChallenge(challenge: DecisionDetail['challenges'][number]): Challenge {
  return {
    challengeId: challenge.challengeId,
    challengerAgentId: challenge.challengerAgentId as AgentId,
    targetAgentId: challenge.targetAgentId as AgentId,
    counterHypothesis: challenge.counterHypothesis,
  };
}

function toRebuttal(rebuttal: DecisionDetail['rebuttals'][number]): Rebuttal {
  return {
    rebuttalId: rebuttal.rebuttalId,
    respondingAgentId: rebuttal.respondingAgentId as AgentId,
    position: rebuttal.position,
    updatedConfidence: rebuttal.updatedConfidence,
    rebuttalFactor: rebuttal.rebuttalFactor,
  };
}

function toDecision(decision: DecisionDetail['decision']): Decision {
  return {
    decisionId: decision.decisionId,
    compositeScore: decision.compositeScore,
    riskTier: decision.riskTier,
    reasoning: decision.reasoning,
    recommendedAction: decision.recommendedAction,
  };
}

function deriveRound(
  findings: AgentFinding[],
  challenges: Challenge[],
  rebuttalMap: Partial<Record<AgentId, Rebuttal>>,
  decision: Decision | null,
) {
  if (decision) {
    return 3;
  }
  if (Object.keys(rebuttalMap).length > 0) {
    return 2;
  }
  if (challenges.length > 0) {
    return 1;
  }
  return findings.length > 0 ? 0 : 0;
}

function hydrateStatuses(
  findings: AgentFinding[],
  challenges: Challenge[],
  rebuttalMap: Partial<Record<AgentId, Rebuttal>>,
  decision: Decision | null,
): Record<AgentId, AgentStatus> {
  const statuses = { ...DEFAULT_STATUSES };

  for (const finding of findings) {
    statuses[finding.agentId] = 'finding_ready';
  }

  for (const challenge of challenges) {
    statuses[challenge.challengerAgentId] = 'challenging';
  }

  for (const rebuttal of Object.values(rebuttalMap)) {
    if (!rebuttal) continue;
    statuses[rebuttal.respondingAgentId] =
      rebuttal.position === 'DEFEND' ? 'defending' : 'conceding';
  }

  if (decision) {
    statuses.judge = 'judging';
  }

  return statuses;
}

export function DebateViewer({
  eventId,
  initialData,
}: {
  eventId: string;
  initialData?: DecisionDetail | null;
}) {
  const initialFindings = useMemo(
    () => (initialData?.findings ?? []).map((finding) => toFinding(finding)),
    [initialData],
  );
  const initialChallenges = useMemo(
    () => (initialData?.challenges ?? []).map((challenge) => toChallenge(challenge)),
    [initialData],
  );
  const initialRebuttals = useMemo(
    () =>
      Object.fromEntries(
        (initialData?.rebuttals ?? []).map((rebuttal) => {
          const mapped = toRebuttal(rebuttal);
          return [mapped.respondingAgentId, mapped];
        }),
      ) as Partial<Record<AgentId, Rebuttal>>,
    [initialData],
  );
  const initialDecision = useMemo(
    () => (initialData?.decision ? toDecision(initialData.decision) : null),
    [initialData],
  );

  const [round, setRound] = useState(() =>
    deriveRound(initialFindings, initialChallenges, initialRebuttals, initialDecision),
  );
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>(() =>
    hydrateStatuses(initialFindings, initialChallenges, initialRebuttals, initialDecision),
  );
  const [confidences, setConfidences] = useState<Partial<Record<AgentId, number>>>(() =>
    Object.fromEntries(initialFindings.map((finding) => [finding.agentId, finding.confidence])),
  );
  const [findings, setFindings] = useState<AgentFinding[]>(initialFindings);
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [rebuttals, setRebuttals] = useState<Partial<Record<AgentId, Rebuttal>>>(initialRebuttals);
  const [decision, setDecision] = useState<Decision | null>(initialDecision);

  const setStatus = (agentId: AgentId, status: AgentStatus) =>
    setStatuses((state) => ({ ...state, [agentId]: status }));

  useEffect(() => {
    setRound(deriveRound(initialFindings, initialChallenges, initialRebuttals, initialDecision));
    setStatuses(
      hydrateStatuses(initialFindings, initialChallenges, initialRebuttals, initialDecision),
    );
    setConfidences(
      Object.fromEntries(initialFindings.map((finding) => [finding.agentId, finding.confidence])),
    );
    setFindings(initialFindings);
    setChallenges(initialChallenges);
    setRebuttals(initialRebuttals);
    setDecision(initialDecision);
  }, [eventId, initialChallenges, initialDecision, initialFindings, initialRebuttals]);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://127.0.0.1:4000');

    socket.emit('debate:subscribe', eventId);

    socket.on('debate:started', (payload: { eventId: string }) => {
      if (payload.eventId !== eventId) return;

      setRound(0);
      setDecision(null);
      setFindings([]);
      setChallenges([]);
      setRebuttals({});
      setConfidences({});
      setStatuses({
        ...DEFAULT_STATUSES,
        build_analyzer: 'analyzing',
        code_reviewer: 'analyzing',
        test_analyzer: 'analyzing',
        dependency_checker: 'analyzing',
      });
    });

    socket.on(
      'round:0:finding',
      ({
        eventId: incomingEventId,
        agentId,
        finding,
      }: {
        eventId: string;
        agentId: AgentId;
        finding: AgentFinding;
      }) => {
        if (incomingEventId !== eventId) return;
        if (finding.agentId !== agentId || finding.agentId === 'judge') return;

        setFindings((state) => {
          if (state.some((entry) => entry.findingId === finding.findingId)) {
            return state;
          }
          return [...state, finding];
        });
        setConfidences((state) => ({ ...state, [agentId]: finding.confidence }));
        setStatus(agentId, 'finding_ready');
      },
    );

    socket.on(
      'round:0:complete',
      ({
        eventId: incomingEventId,
        findings: incomingFindings,
      }: {
        eventId: string;
        findings?: AgentFinding[];
      }) => {
        if (incomingEventId !== eventId) return;
        setRound(1);
        if (incomingFindings?.length) {
          setFindings(incomingFindings);
          setConfidences(
            Object.fromEntries(
              incomingFindings.map((finding) => [finding.agentId, finding.confidence]),
            ),
          );
        }
      },
    );

    socket.on(
      'round:1:challenge',
      ({ eventId: incomingEventId, challenge }: { eventId: string; challenge: Challenge }) => {
        if (incomingEventId !== eventId) return;
        if (challenge.targetAgentId === 'judge' || challenge.challengerAgentId === 'judge') return;

        setChallenges((state) => {
          if (state.some((entry) => entry.challengeId === challenge.challengeId)) {
            return state;
          }
          return [...state, challenge];
        });
        setStatus(challenge.challengerAgentId, 'challenging');
      },
    );

    socket.on(
      'round:1:complete',
      ({
        eventId: incomingEventId,
        challenges: incomingChallenges,
      }: {
        eventId: string;
        challenges?: Challenge[];
      }) => {
        if (incomingEventId !== eventId) return;
        setRound(2);
        if (incomingChallenges) {
          setChallenges(incomingChallenges);
        }
      },
    );

    socket.on(
      'round:2:rebuttal',
      ({ eventId: incomingEventId, rebuttal }: { eventId: string; rebuttal: Rebuttal }) => {
        if (incomingEventId !== eventId) return;
        setRebuttals((state) => ({ ...state, [rebuttal.respondingAgentId]: rebuttal }));
        setConfidences((state) => ({
          ...state,
          [rebuttal.respondingAgentId]: rebuttal.updatedConfidence,
        }));
        setStatus(
          rebuttal.respondingAgentId,
          rebuttal.position === 'DEFEND' ? 'defending' : 'conceding',
        );
      },
    );

    socket.on(
      'round:2:complete',
      ({
        eventId: incomingEventId,
        rebuttals: incomingRebuttals,
      }: {
        eventId: string;
        rebuttals?: Array<DecisionDetail['rebuttals'][number]>;
      }) => {
        if (incomingEventId !== eventId) return;
        setRound(3);
        setStatus('judge', 'judging');
        if (incomingRebuttals) {
          const mapped = Object.fromEntries(
            incomingRebuttals.map((rebuttal) => {
              const normalized = toRebuttal(rebuttal);
              return [normalized.respondingAgentId, normalized];
            }),
          ) as Partial<Record<AgentId, Rebuttal>>;
          setRebuttals(mapped);
        }
      },
    );

    socket.on(
      'decision:ready',
      ({ decision: incomingDecision }: { decision: DecisionDetail['decision'] | Decision }) => {
        const normalized =
          'eventId' in incomingDecision
            ? toDecision(incomingDecision as DecisionDetail['decision'])
            : (incomingDecision as Decision);
        if (
          'eventId' in incomingDecision &&
          (incomingDecision as DecisionDetail['decision']).eventId !== eventId
        ) {
          return;
        }
        setDecision(normalized);
        setStatuses(DEFAULT_STATUSES);
      },
    );

    return () => {
      socket.emit('debate:unsubscribe', eventId);
      socket.disconnect();
    };
  }, [eventId]);

  return (
    <section className="flex min-h-[calc(100vh-12rem)] flex-col bg-[rgba(6,14,24,0.82)]">
      <div className="px-6 pt-6">
        <RoundLabel round={round} />
      </div>

      <div className="px-2 pt-4">
        <DebateGraph
          statuses={statuses}
          confidences={confidences}
          challenges={challenges}
          rebuttals={rebuttals}
        />
      </div>

      <AnimatePresence>
        {findings.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="grid gap-1 border-t border-white/5 px-6 py-6 xl:grid-cols-2"
          >
            {findings.map((finding, index) => (
              <FindingCard key={finding.findingId} finding={finding} index={index} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {decision ? (
          <div className="border-t border-white/5 px-6 py-6">
            <JudgeCard decision={decision} />
          </div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
