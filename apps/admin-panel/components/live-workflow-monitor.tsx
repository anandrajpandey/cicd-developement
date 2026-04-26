'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';

import type { WorkflowAgentSnapshot, WorkflowListItem, WorkflowStatus } from '../lib/orchestrator';

interface Props {
  initialWorkflows: WorkflowListItem[];
}

const AGENT_ORDER = [
  'build_analyzer',
  'code_reviewer',
  'test_analyzer',
  'dependency_checker',
  'judge',
] as const;

const AGENT_LABELS: Record<(typeof AGENT_ORDER)[number], string> = {
  build_analyzer: 'Build',
  code_reviewer: 'Code',
  test_analyzer: 'Test',
  dependency_checker: 'Deps',
  judge: 'Judge',
};

function statusLabel(status: WorkflowStatus) {
  switch (status) {
    case 'STARTED':
      return 'Started';
    case 'ANALYZING':
      return 'Round 0';
    case 'CHALLENGING':
      return 'Round 1';
    case 'REBUTTING':
      return 'Round 2';
    case 'JUDGED':
      return 'Complete';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

function progressWidth(status: WorkflowStatus) {
  switch (status) {
    case 'STARTED':
      return '10%';
    case 'ANALYZING':
      return '38%';
    case 'CHALLENGING':
      return '62%';
    case 'REBUTTING':
      return '82%';
    case 'JUDGED':
      return '100%';
    case 'CANCELLED':
      return '100%';
  }
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Pending';
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatRoundTimestamp(
  workflow: WorkflowListItem,
  round: 'round0At' | 'round1At' | 'round2At' | 'round3At',
) {
  const value = workflow.timestamps[round];

  if (value) {
    return formatTimestamp(value);
  }

  if (workflow.status === 'CANCELLED') {
    return 'Cancelled';
  }

  if (
    round === 'round1At' &&
    workflow.timestamps.round3At &&
    (workflow.counts?.challenges ?? 0) === 0
  ) {
    return 'No challenge needed';
  }

  if (
    round === 'round2At' &&
    workflow.timestamps.round3At &&
    (workflow.counts?.rebuttals ?? 0) === 0
  ) {
    return 'No rebuttal needed';
  }

  if (
    round === 'round1At' &&
    workflow.timestamps.round2At &&
    (workflow.counts?.challenges ?? 0) === 0
  ) {
    return 'No challenge needed';
  }

  if (
    round === 'round2At' &&
    workflow.timestamps.round3At &&
    (workflow.counts?.challenges ?? 0) === 0
  ) {
    return 'No rebuttal needed';
  }

  return 'Pending';
}

function upsertWorkflow(
  workflows: WorkflowListItem[],
  patch: Omit<Partial<WorkflowListItem>, 'timestamps'> & {
    eventId: string;
    timestamps?: Partial<WorkflowListItem['timestamps']>;
  },
) {
  const existing = workflows.find((item) => item.eventId === patch.eventId);
  const fallback: WorkflowListItem = {
    eventId: patch.eventId,
    repository: 'Unknown repository',
    branch: 'unknown',
    commitSha: 'unknown',
    failureType: 'unknown',
    status: 'STARTED',
    createdAt: new Date().toISOString(),
    timestamps: {
      startedAt: new Date().toISOString(),
      round0At: null,
      round1At: null,
      round2At: null,
      round3At: null,
    },
    decision: null,
    agents: AGENT_ORDER.map((agentId) => ({
      agentId,
      confidence: null,
      status: agentId === 'judge' ? 'idle' : 'analyzing',
      rebuttalPosition: null,
    })),
  };

  const merged = {
    ...(existing ?? fallback),
    ...patch,
    timestamps: {
      ...(existing?.timestamps ?? fallback.timestamps),
      ...(patch.timestamps ?? {}),
    },
    agents: patch.agents ?? existing?.agents ?? fallback.agents,
  } satisfies WorkflowListItem;

  return [...workflows.filter((item) => item.eventId !== patch.eventId), merged].sort(
    (left, right) =>
      new Date(right.timestamps.round3At ?? right.timestamps.startedAt).getTime() -
      new Date(left.timestamps.round3At ?? left.timestamps.startedAt).getTime(),
  );
}

function updateAgentSnapshot(
  workflows: WorkflowListItem[],
  eventId: string,
  agentId: WorkflowAgentSnapshot['agentId'],
  patch: Partial<WorkflowAgentSnapshot>,
) {
  return upsertWorkflow(
    workflows.map((workflow) => {
      if (workflow.eventId !== eventId) {
        return workflow;
      }

      const currentAgents =
        workflow.agents ??
        AGENT_ORDER.map((currentAgentId) => ({
          agentId: currentAgentId,
          confidence: null,
          status: currentAgentId === 'judge' ? 'idle' : 'analyzing',
          rebuttalPosition: null,
        }));

      return {
        ...workflow,
        agents: currentAgents.map((agent) =>
          agent.agentId === agentId
            ? {
                ...agent,
                ...patch,
              }
            : agent,
        ),
      };
    }),
    { eventId },
  );
}

function agentBarColor(status: WorkflowAgentSnapshot['status']) {
  switch (status) {
    case 'challenging':
      return 'from-amber-400 to-orange-300';
    case 'defending':
      return 'from-sky-400 to-blue-300';
    case 'conceding':
      return 'from-red-400 to-rose-300';
    case 'judging':
      return 'from-yellow-400 to-amber-300';
    case 'finding_ready':
      return 'from-mint to-[#77ffca]';
    case 'analyzing':
      return 'from-cyan-400 to-sky-300';
    default:
      return 'from-white/15 to-white/5';
  }
}

function formatConfidenceDelta(agent?: WorkflowAgentSnapshot) {
  if (
    !agent ||
    typeof agent.confidence !== 'number' ||
    typeof agent.previousConfidence !== 'number'
  ) {
    return null;
  }

  const delta = agent.confidence - agent.previousConfidence;
  if (delta >= 0) {
    return null;
  }

  return `${Math.round(delta * 100)}%`;
}

export function LiveWorkflowMonitor({ initialWorkflows }: Props) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>(initialWorkflows);

  useEffect(() => {
    setWorkflows((current) => {
      if (current.length === 0) {
        return initialWorkflows;
      }

      const merged = new Map(current.map((workflow) => [workflow.eventId, workflow]));

      for (const workflow of initialWorkflows) {
        const existing = merged.get(workflow.eventId);
        if (!existing) {
          merged.set(workflow.eventId, workflow);
          continue;
        }

        merged.set(workflow.eventId, {
          ...existing,
          ...workflow,
          timestamps: {
            ...existing.timestamps,
            ...workflow.timestamps,
          },
          agents: workflow.agents && workflow.agents.length > 0 ? workflow.agents : existing.agents,
        });
      }

      return [...merged.values()].sort(
        (left, right) =>
          new Date(right.timestamps.round3At ?? right.timestamps.startedAt).getTime() -
          new Date(left.timestamps.round3At ?? left.timestamps.startedAt).getTime(),
      );
    });
  }, [initialWorkflows]);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://127.0.0.1:4000');

    socket.on(
      'debate:started',
      (payload: { eventId: string; repository: string; branch: string; failureType: string }) => {
        const now = new Date().toISOString();
        setWorkflows((current) =>
          upsertWorkflow(current, {
            eventId: payload.eventId,
            repository: payload.repository,
            branch: payload.branch,
            failureType: payload.failureType,
            status: 'STARTED',
            createdAt: now,
            timestamps: {
              startedAt: now,
              round0At: null,
              round1At: null,
              round2At: null,
              round3At: null,
            },
            agents: AGENT_ORDER.map((agentId) => ({
              agentId,
              confidence: null,
              status: agentId === 'judge' ? 'idle' : 'analyzing',
              rebuttalPosition: null,
            })),
          }),
        );
      },
    );

    socket.on('debate:cancelled', (payload: { eventId: string; status: 'CANCELLED' }) => {
      setWorkflows((current) =>
        upsertWorkflow(current, {
          eventId: payload.eventId,
          status: 'CANCELLED',
        }),
      );
    });

    socket.on('round:0:complete', (payload: { eventId: string }) => {
      const now = new Date().toISOString();
      setWorkflows((current) =>
        upsertWorkflow(current, {
          eventId: payload.eventId,
          status: 'ANALYZING',
          timestamps: { round0At: now },
        }),
      );
    });

    socket.on(
      'round:0:finding',
      (payload: {
        eventId: string;
        agentId: WorkflowAgentSnapshot['agentId'];
        finding: { confidence: number };
      }) => {
        setWorkflows((current) =>
          updateAgentSnapshot(current, payload.eventId, payload.agentId, {
            confidence: payload.finding.confidence,
            status: 'finding_ready',
          }),
        );
      },
    );

    socket.on('round:1:complete', (payload: { eventId: string }) => {
      const now = new Date().toISOString();
      setWorkflows((current) =>
        upsertWorkflow(current, {
          eventId: payload.eventId,
          status: 'CHALLENGING',
          timestamps: { round1At: now },
        }),
      );
    });

    socket.on(
      'round:1:challenge',
      (payload: {
        eventId: string;
        challenge: {
          challengerAgentId: WorkflowAgentSnapshot['agentId'];
          targetAgentId: WorkflowAgentSnapshot['agentId'];
        };
      }) => {
        setWorkflows((current) => {
          let next = updateAgentSnapshot(
            current,
            payload.eventId,
            payload.challenge.challengerAgentId,
            {
              status: 'challenging',
            },
          );
          next = updateAgentSnapshot(next, payload.eventId, payload.challenge.targetAgentId, {
            status: 'finding_ready',
          });
          return next;
        });
      },
    );

    socket.on('round:2:complete', (payload: { eventId: string }) => {
      const now = new Date().toISOString();
      setWorkflows((current) =>
        upsertWorkflow(current, {
          eventId: payload.eventId,
          status: 'REBUTTING',
          timestamps: { round2At: now },
        }),
      );
    });

    socket.on(
      'round:2:rebuttal',
      (payload: {
        eventId: string;
        rebuttal: {
          respondingAgentId: WorkflowAgentSnapshot['agentId'];
          updatedConfidence: number;
          position: 'DEFEND' | 'CONCEDE';
        };
      }) => {
        setWorkflows((current) =>
          updateAgentSnapshot(current, payload.eventId, payload.rebuttal.respondingAgentId, {
            confidence: payload.rebuttal.updatedConfidence,
            status: payload.rebuttal.position === 'DEFEND' ? 'defending' : 'conceding',
            rebuttalPosition: payload.rebuttal.position,
          }),
        );
      },
    );

    socket.on(
      'decision:ready',
      (payload: {
        eventId: string;
        decision: {
          eventId?: string;
          decisionId: string;
          riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
          compositeScore: number;
        };
      }) => {
        const eventId = payload.eventId ?? payload.decision.eventId;
        if (!eventId) {
          return;
        }

        const now = new Date().toISOString();
        setWorkflows((current) =>
          upsertWorkflow(current, {
            eventId,
            status: 'JUDGED',
            timestamps: { round3At: now },
            decision: {
              decisionId: payload.decision.decisionId,
              riskTier: payload.decision.riskTier,
              compositeScore: payload.decision.compositeScore,
            },
            agents: (current.find((workflow) => workflow.eventId === eventId)?.agents ?? []).map(
              (agent) =>
                agent.agentId === 'judge'
                  ? {
                      ...agent,
                      confidence: payload.decision.compositeScore,
                      status: 'judging',
                    }
                  : agent,
            ),
          }),
        );
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [router]);

  const orderedWorkflows = useMemo(
    () =>
      [...workflows].sort(
        (left, right) =>
          new Date(right.timestamps.round3At ?? right.timestamps.startedAt).getTime() -
          new Date(left.timestamps.round3At ?? left.timestamps.startedAt).getTime(),
      ),
    [workflows],
  );

  return (
    <section className="panel animated-panel -mx-12 overflow-hidden p-0">
      <div className="border-b border-white/12">
        <div className="px-12 pt-4 pb-4">
          <h2 className="text-3xl font-bold uppercase tracking-widest text-white">
            Workflow Timeline
          </h2>
          <p className="mt-2 text-sm text-white/58">Every event, live or complete</p>
        </div>
      </div>

      <div className="divide-y divide-line">
        <AnimatePresence initial={false}>
          {orderedWorkflows.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-6 py-10 text-sm text-mist/58"
            >
              No workflows yet. Trigger a simulation to open a live debate trace.
            </motion.div>
          ) : (
            orderedWorkflows.map((workflow) => {
              const href =
                workflow.status === 'JUDGED'
                  ? `/events/${workflow.eventId}`
                  : `/debate?eventId=${workflow.eventId}`;

              return (
                <motion.div
                  key={workflow.eventId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="px-6 py-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="truncate text-base font-semibold text-white">
                          {workflow.repository}
                        </h3>
                        <span className="border border-mint/20 bg-mint/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-mint">
                          {statusLabel(workflow.status)}
                        </span>
                        {workflow.decision ? (
                          <span className="border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-mist/80">
                            {workflow.decision.riskTier}{' '}
                            {Math.round(workflow.decision.compositeScore * 100)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-mist/55">
                        {workflow.branch} / {workflow.failureType} / {workflow.commitSha}
                      </p>
                    </div>

                    <Link
                      href={href}
                      className="whitespace-nowrap text-[11px] uppercase tracking-[0.22em] text-mint"
                    >
                      {workflow.status === 'JUDGED' ? 'View Complete Workflow' : 'Watch Live'}
                    </Link>
                  </div>

                  <div className="mt-4 h-[2px] overflow-hidden bg-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: progressWidth(workflow.status) }}
                      className="h-full bg-[linear-gradient(90deg,#25d18a,#77ffca)]"
                    />
                  </div>

                  {workflow.agents?.length ? (
                    <div className="mt-4 grid gap-3 xl:grid-cols-5">
                      {AGENT_ORDER.map((agentId) => {
                        const agent = workflow.agents?.find((entry) => entry.agentId === agentId);
                        const confidence = Math.max(
                          0,
                          Math.min(100, Math.round((agent?.confidence ?? 0) * 100)),
                        );

                        return (
                          <div
                            key={`${workflow.eventId}-${agentId}`}
                            className="border border-white/8 bg-black/25 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] uppercase tracking-[0.18em] text-mist/60">
                                {AGENT_LABELS[agentId]}
                              </span>
                              <div className="flex items-center gap-2">
                                {formatConfidenceDelta(agent) ? (
                                  <span className="font-mono text-[10px] text-red-300">
                                    {formatConfidenceDelta(agent)}
                                  </span>
                                ) : null}
                                <span className="font-mono text-[11px] text-white/85">
                                  {agent?.confidence == null ? '--' : `${confidence}%`}
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden bg-white/8">
                              <motion.div
                                initial={false}
                                animate={{ width: `${confidence}%` }}
                                transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                                className={`h-full bg-gradient-to-r ${agentBarColor(agent?.status ?? 'idle')}`}
                              />
                            </div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-mist/45">
                              {agent?.rebuttalPosition ??
                                agent?.status?.replace('_', ' ') ??
                                'idle'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 text-xs text-mist/68 xl:grid-cols-5">
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Started</div>
                      <div className="mt-1 font-mono">
                        {formatTimestamp(workflow.timestamps.startedAt)}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Round 0</div>
                      <div className="mt-1 font-mono">
                        {formatRoundTimestamp(workflow, 'round0At')}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Round 1</div>
                      <div className="mt-1 font-mono">
                        {formatRoundTimestamp(workflow, 'round1At')}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Round 2</div>
                      <div className="mt-1 font-mono">
                        {formatRoundTimestamp(workflow, 'round2At')}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Judge</div>
                      <div className="mt-1 font-mono">
                        {formatRoundTimestamp(workflow, 'round3At')}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
