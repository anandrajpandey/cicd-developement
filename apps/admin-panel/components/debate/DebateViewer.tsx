'use client';

import { useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';

import { cancelEvent } from '../../lib/orchestrator';
import type { DecisionDetail } from '../../lib/orchestrator';
import { DebateGraph } from './DebateGraph';
import { DebateChatFeed } from './DebateChatFeed';
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

function toDecision(decision: DecisionDetail['decision']): Decision | null {
  if (!decision) {
    return null;
  }
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

  const [liveRound, setLiveRound] = useState(() =>
    deriveRound(initialFindings, initialChallenges, initialRebuttals, initialDecision),
  );
  const [selectedRound, setSelectedRound] = useState<number | 'live'>('live');
  
  const currentRound = selectedRound === 'live' ? liveRound : selectedRound;

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
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(initialData?.runtimeStatus === 'CANCELLED');
  
  const [hoveredNode, setHoveredNode] = useState<AgentId | null>(null);

  const setStatus = (agentId: AgentId, status: AgentStatus) =>
    setStatuses((state) => ({ ...state, [agentId]: status }));

  useEffect(() => {
    setLiveRound(deriveRound(initialFindings, initialChallenges, initialRebuttals, initialDecision));
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
    setIsCancelled(initialData?.runtimeStatus === 'CANCELLED');
  }, [eventId, initialChallenges, initialDecision, initialFindings, initialRebuttals]);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://127.0.0.1:4000');

    socket.emit('debate:subscribe', eventId);

    socket.on('debate:started', (payload: { eventId: string }) => {
      if (payload.eventId !== eventId) return;

      setLiveRound(0);
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
      setIsCancelled(false);
    });

    socket.on(
      'debate:cancelled',
      (payload: { eventId: string; status: 'CANCELLED' }) => {
        if (payload.eventId !== eventId) return;
        setIsCancelled(true);
        setStatuses(DEFAULT_STATUSES);
      },
    );

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
        setLiveRound(1);
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
        setLiveRound(2);
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
        setLiveRound(3);
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
        if (!incomingDecision) return;
        const normalized =
          'eventId' in incomingDecision
            ? toDecision(incomingDecision as DecisionDetail['decision'])
            : (incomingDecision as Decision);
        if (!normalized) return;
        if (
          'eventId' in incomingDecision &&
          incomingDecision?.eventId !== eventId
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

  const displayedFindings = currentRound >= 0 ? findings : [];
  const displayedChallenges = currentRound >= 1 ? challenges : [];
  const displayedRebuttals = currentRound >= 2 ? rebuttals : {};
  const displayedDecision = currentRound >= 3 ? decision : null;

  async function handleCancel() {
    setIsCancelling(true);
    try {
      await cancelEvent(eventId);
      setIsCancelled(true);
      setStatuses(DEFAULT_STATUSES);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0A0A0A] overflow-hidden flex flex-col font-sans">
      <div className="flex-none p-4 flex items-center justify-between bg-[#0F1218]">
        <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white tracking-widest uppercase">Agentic Trace</h1>
            <p className="text-mist/70 text-sm font-mono mt-0.5">Event {eventId.slice(0, 8)}</p>
            {isCancelled ? (
              <span className="px-3 py-1 rounded-md border border-red-500/30 bg-red-500/10 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">
                Cancelled
              </span>
            ) : null}
        </div>
        <div className="flex bg-white/5 rounded-lg p-1 gap-1">
            {!displayedDecision && !isCancelled ? (
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="px-4 py-1.5 rounded-md text-xs font-semibold tracking-wider uppercase transition-colors bg-red-500/10 text-red-300 shadow-lg hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCancelling ? 'Stopping...' : 'Stop Event'}
              </button>
            ) : null}
            <button onClick={() => setSelectedRound('live')} className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wider uppercase transition-colors ${selectedRound === 'live' ? 'bg-primary text-white shadow-lg' : 'text-mist hover:text-white hover:bg-white/5'}`}>Live View</button>
            <button onClick={() => setSelectedRound(3)} className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wider uppercase transition-colors ${selectedRound === 3 ? 'bg-white/10 text-white shadow-lg' : 'text-mist hover:text-white hover:bg-white/5'}`}>Final Decision</button>
            <a href="/" className="px-4 py-1.5 ml-4 rounded-md text-xs font-semibold tracking-wider uppercase transition-colors bg-white/10 text-white shadow-lg hover:bg-white/20">Exit</a>
        </div>
      </div>

      <div className="flex-1 relative flex h-[calc(100vh-64px)] overflow-hidden">
        <div className="hidden lg:flex w-[480px] border-r border-white/5 bg-[#08080A] flex-col z-20 shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40 shadow-sm z-10">
            <div className="flex gap-2 items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] uppercase font-bold tracking-widest text-mist/90">Agent Feed</span>
            </div>
            <span className="text-[9px] font-mono text-mist/50">Round {currentRound}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/5">
            <DebateChatFeed findings={displayedFindings} challenges={displayedChallenges} rebuttals={displayedRebuttals} decision={displayedDecision} />
          </div>
        </div>

        <div className="flex-1 relative h-full w-full">
            <DebateGraph
            statuses={statuses}
            confidences={confidences}
            challenges={displayedChallenges}
            rebuttals={displayedRebuttals}
            onHoverNode={setHoveredNode}
            />
        </div>

        <AnimatePresence>
          {hoveredNode && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 20, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-[400px] bg-[#0F1218]/95 backdrop-blur-3xl p-6 shadow-2xl z-10 overflow-y-auto"
            >
              <h2 className="text-xl font-mono text-white tracking-widest uppercase mb-6 pb-2 border-b border-white/5">
                {hoveredNode.replace('_', ' ')}
              </h2>

              {hoveredNode === 'root_event' ? (
                <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/5">
                        <p className="text-xs uppercase text-mist/60 font-semibold mb-1">Repository / Branch</p>
                        <p className="text-sm font-mono text-white/90">{initialData?.event?.repository} / {initialData?.event?.branch}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-red-900/10 border border-red-500/20">
                        <p className="text-xs uppercase text-red-400 font-semibold mb-2">Error Log</p>
                        <pre className="text-[10px] sm:text-xs text-red-300 font-mono whitespace-pre-wrap break-words">{initialData?.event?.errorLog ?? 'No logs captured.'}</pre>
                    </div>
                </div>
              ) : hoveredNode === 'judge' ? (
                displayedDecision ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/5">
                        <p className="text-xs uppercase text-mist/60 font-semibold mb-1">Decision</p>
                        <p className="text-sm text-white/90">{displayedDecision.recommendedAction}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5">
                        <p className="text-xs uppercase text-mist/60 font-semibold mb-1">Reasoning</p>
                        <p className="text-sm text-white/90">{displayedDecision.reasoning}</p>
                    </div>
                    <div className="flex justify-between p-4 rounded-xl bg-white/5">
                        <div>
                            <p className="text-xs uppercase text-mist/60 font-semibold mb-1">Risk Tier</p>
                            <p className="text-sm font-mono text-white/90">{displayedDecision.riskTier}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase text-mist/60 font-semibold mb-1">Score</p>
                            <p className="text-sm font-mono text-white/90">{Math.round(displayedDecision.compositeScore * 100)}%</p>
                        </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-mist/50 italic text-sm">Judge is pending review...</p>
                )
              ) : (
                <div className="space-y-6">
                  {displayedFindings.find((f) => f.agentId === hoveredNode) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold tracking-wider">Analysis Finding</div>
                         <div className="text-xl font-mono text-white/90">{Math.round((displayedFindings.find((f) => f.agentId === hoveredNode)?.confidence ?? 0) * 100)}% <span className="text-xs text-mist/50">Conf.</span></div>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl space-y-4">
                        <div>
                            <p className="text-[10px] uppercase text-[#3B82F6] font-bold tracking-widest mb-1">Hypothesis</p>
                            <p className="text-sm text-white/90 leading-relaxed mt-1">{displayedFindings.find((f) => f.agentId === hoveredNode)?.hypothesis}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase text-[#10B981] font-bold tracking-widest mb-1 border-b border-[#10B981]/20 pb-1 inline-block">Evidence</p>
                            <ul className="mt-1 space-y-2">
                              {displayedFindings.find((f) => f.agentId === hoveredNode)?.evidence.map((ev, i) => (
                                <li key={i} className="text-xs text-mist/70 font-mono bg-black/20 p-2 rounded-lg break-words">— {ev}</li>
                              ))}
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase text-mist/50 font-bold tracking-widest mb-1 border-b border-white/10 pb-1 inline-block">Proposed Mitigation</p>
                            <pre className="mt-1 text-xs text-mist/80 font-mono bg-black/20 p-3 rounded-lg break-words whitespace-pre-wrap">{displayedFindings.find((f) => f.agentId === hoveredNode)?.proposedRemediation}</pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {displayedChallenges.filter((c) => c.targetAgentId === hoveredNode).length > 0 && (
                    <div className="space-y-3">
                      <div className="px-3 py-1 bg-orange-500/10 text-orange-400 rounded-full text-xs font-semibold tracking-wider self-start inline-block">Challenged By</div>
                      <div className="space-y-3">
                        {displayedChallenges.filter((c) => c.targetAgentId === hoveredNode).map((c) => (
                            <div key={c.challengeId} className="bg-orange-500/5 p-4 rounded-xl space-y-3">
                                <div className="flex items-center gap-2">       
                                  <p className="text-xs text-orange-400 font-bold uppercase tracking-widest">{c.challengerAgentId.replace('_', ' ')}</p>        
                                </div>
                                <p className="text-sm text-mist/90 leading-relaxed">{c.counterHypothesis}</p>
                            </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {displayedRebuttals[hoveredNode as AgentId] && (
                    <div className="space-y-3">
                      <div className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-xs font-semibold tracking-wider self-start inline-block">Resolution Motion</div>
                      <div className={`p-4 rounded-xl space-y-3 ${displayedRebuttals[hoveredNode as AgentId]!.position === 'DEFEND' ? 'bg-blue-500/5' : 'bg-red-500/5'}`}>
                         <p className={`text-[10px] uppercase font-bold tracking-widest ${displayedRebuttals[hoveredNode as AgentId]!.position === 'DEFEND' ? 'text-blue-400' : 'text-red-400'}`}>Agent chose to {displayedRebuttals[hoveredNode as AgentId]!.position}</p>
                         <div className="flex justify-between items-center text-sm font-mono p-2 bg-black/20 rounded-lg">
                           <span className="text-mist/60">Updated Confidence</span>
                           <span className="text-white/90">{Math.round(displayedRebuttals[hoveredNode as AgentId]!.updatedConfidence * 100)}%</span>
                         </div>
                      </div>
                    </div>
                  )}

                  {!displayedFindings.find((f) => f.agentId === hoveredNode) && (
                      <p className="text-mist/50 italic text-sm">Waiting for agent analysis...</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
