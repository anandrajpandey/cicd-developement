'use client';

import { useEffect, useMemo, useState } from 'react';

import { io } from 'socket.io-client';

import type { WorkflowAgentSnapshot, WorkflowListItem } from '../../lib/orchestrator';

const AGENTS = [
  { id: 'build_analyzer', label: 'Build', color: '#d8d8d8' },
  { id: 'code_reviewer', label: 'Code', color: '#bfbfbf' },
  { id: 'test_analyzer', label: 'Test', color: '#f0f0f0' },
  { id: 'dependency_checker', label: 'Deps', color: '#9f9f9f' },
] as const;

type AgentId = (typeof AGENTS)[number]['id'];

function upsertWorkflow(
  workflows: WorkflowListItem[],
  patch: Omit<Partial<WorkflowListItem>, 'timestamps'> & {
    eventId: string;
    timestamps?: Partial<WorkflowListItem['timestamps']>;
  },
) {
  const existing = workflows.find((item) => item.eventId === patch.eventId);
  const fallbackAgents: WorkflowAgentSnapshot[] = [
    ...AGENTS.map(
      (agent): WorkflowAgentSnapshot => ({
        agentId: agent.id,
        confidence: null,
        status: 'analyzing',
        rebuttalPosition: null,
      }),
    ),
    {
      agentId: 'judge',
      confidence: null,
      status: 'idle',
      rebuttalPosition: null,
    },
  ];
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
    agents: fallbackAgents,
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

      return {
        ...workflow,
        agents: (workflow.agents ?? []).map((agent) =>
          agent.agentId === agentId ? { ...agent, ...patch } : agent,
        ),
      };
    }),
    { eventId },
  );
}

function summarizeAgent(workflows: WorkflowListItem[], agentId: AgentId) {
  const samples = workflows
    .slice(0, 8)
    .reverse()
    .map(
      (workflow) => workflow.agents?.find((agent) => agent.agentId === agentId)?.confidence ?? 0,
    );

  const latest = samples.at(-1) ?? 0;
  const average =
    samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length;

  return { samples, latest, average };
}

function buildLinePath(points: number[]) {
  if (points.length === 0) {
    return '';
  }

  const width = 100;
  const height = 100;

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - point * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildAreaPath(points: number[]) {
  if (points.length === 0) {
    return '';
  }

  const line = buildLinePath(points);
  return `${line} L 100 100 L 0 100 Z`;
}

export function LiveConfidenceGraph({
  initialWorkflows,
}: {
  initialWorkflows: WorkflowListItem[];
}) {
  const [workflows, setWorkflows] = useState(initialWorkflows);

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
            },
          }),
        );
      },
    );

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
      'round:1:challenge',
      (payload: {
        eventId: string;
        challenge: { challengerAgentId: WorkflowAgentSnapshot['agentId'] };
      }) => {
        setWorkflows((current) =>
          updateAgentSnapshot(current, payload.eventId, payload.challenge.challengerAgentId, {
            status: 'challenging',
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
        decision: {
          eventId?: string;
          decisionId?: string;
          compositeScore?: number;
          riskTier?: 'LOW' | 'MEDIUM' | 'HIGH';
        };
      }) => {
        if (!payload.decision.eventId) {
          return;
        }
        const eventId = payload.decision.eventId;

        const now = new Date().toISOString();
        setWorkflows((current) =>
          upsertWorkflow(current, {
            eventId,
            status: 'JUDGED',
            timestamps: { round3At: now },
            decision: payload.decision.decisionId
              ? {
                  decisionId: payload.decision.decisionId,
                  compositeScore: payload.decision.compositeScore ?? 0,
                  riskTier: payload.decision.riskTier ?? 'LOW',
                }
              : null,
          }),
        );
      },
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  const agentSeries = useMemo(
    () =>
      AGENTS.map((agent) => ({
        ...agent,
        ...summarizeAgent(workflows, agent.id),
      })),
    [workflows],
  );
  const recentWorkflows = useMemo(() => workflows.slice(0, 6), [workflows]);
  const combinedSeries = useMemo(() => {
    const reversed = workflows.slice(0, 8).reverse();

    return reversed.map((workflow) => {
      const values = (workflow.agents ?? [])
        .filter((agent) => agent.agentId !== 'judge')
        .map((agent) => agent.confidence)
        .filter((confidence): confidence is number => typeof confidence === 'number');

      if (workflow.decision?.compositeScore !== undefined && values.length === 0) {
        return workflow.decision.compositeScore;
      }

      if (values.length === 0) {
        return 0;
      }

      return values.reduce((sum, value) => sum + value, 0) / values.length;
    });
  }, [workflows]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="dashboard-line-panel">
        <div className="dashboard-line-header">
          <div>
            <div className="dashboard-stat-title">Average composite score trend</div>
            <div className="mt-2 text-sm text-white/56">
              Average composite score across the latest filtered workflows.
            </div>
          </div>
          <div className="text-right">
            <div className="dashboard-stat-title">Observed workflows</div>
            <div className="mt-2 text-2xl font-semibold text-white">{recentWorkflows.length}</div>
          </div>
        </div>

        <div className="dashboard-line-chart">
          <div className="dashboard-line-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="dashboard-line-grid-row" />
            ))}
          </div>

          {combinedSeries.length > 0 ? (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <defs>
                <linearGradient id="confidenceLineGlow" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.92)" />
                </linearGradient>
                <linearGradient id="confidenceAreaFill" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                </linearGradient>
              </defs>

              <path d={buildAreaPath(combinedSeries)} fill="url(#confidenceAreaFill)" />
              <path
                d={buildLinePath(combinedSeries)}
                fill="none"
                stroke="url(#confidenceLineGlow)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div className="dashboard-line-empty">No workflow data</div>
          )}

          <div className="dashboard-line-footer">
            <span>earlier</span>
            <span>latest</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {agentSeries.map((agent) => (
          <div key={agent.id} className="dashboard-stat-row">
            <div>
              <div className="dashboard-stat-title">{agent.label} confidence</div>
              <div className="mt-2 text-xs text-white/44">
                avg {Math.round(agent.average * 100)}% over recent workflows
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-white">
                {Math.round(agent.latest * 100)}%
              </div>
              <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(agent.latest * 100)}%`,
                    background: agent.color,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
