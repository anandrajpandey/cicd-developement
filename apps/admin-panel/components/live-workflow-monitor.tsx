'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';

import type { WorkflowListItem, WorkflowStatus } from '../lib/orchestrator';

interface Props {
  initialWorkflows: WorkflowListItem[];
}

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
  };

  const merged = {
    ...(existing ?? fallback),
    ...patch,
    timestamps: {
      ...(existing?.timestamps ?? fallback.timestamps),
      ...(patch.timestamps ?? {}),
    },
  } satisfies WorkflowListItem;

  return [...workflows.filter((item) => item.eventId !== patch.eventId), merged].sort(
    (left, right) =>
      new Date(right.timestamps.round3At ?? right.timestamps.startedAt).getTime() -
      new Date(left.timestamps.round3At ?? left.timestamps.startedAt).getTime(),
  );
}

export function LiveWorkflowMonitor({ initialWorkflows }: Props) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>(initialWorkflows);

  useEffect(() => {
    setWorkflows(initialWorkflows);
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
          }),
        );
        router.refresh();
      },
    );

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
          }),
        );
        router.refresh();
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
    <section className="panel animated-panel overflow-hidden p-0">
      <div className="border-b border-line bg-[linear-gradient(90deg,rgba(8,25,38,0.95),rgba(4,14,26,0.95))] px-6 py-5">
        <p className="eyebrow">Workflow Timeline</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Every event, live or complete</h2>
        <p className="mt-2 text-sm text-mist/68">
          Active workflows stream live. Completed workflows stay pinned with their final debate
          timestamps and decision links.
        </p>
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
                            {workflow.decision.riskTier} {Math.round(workflow.decision.compositeScore * 100)}
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

                  <div className="mt-4 grid gap-3 text-xs text-mist/68 xl:grid-cols-5">
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Started</div>
                      <div className="mt-1 font-mono">{formatTimestamp(workflow.timestamps.startedAt)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Round 0</div>
                      <div className="mt-1 font-mono">{formatTimestamp(workflow.timestamps.round0At)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Round 1</div>
                      <div className="mt-1 font-mono">{formatTimestamp(workflow.timestamps.round1At)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Round 2</div>
                      <div className="mt-1 font-mono">{formatTimestamp(workflow.timestamps.round2At)}</div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.16em] text-mist/45">Judge</div>
                      <div className="mt-1 font-mono">{formatTimestamp(workflow.timestamps.round3At)}</div>
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
