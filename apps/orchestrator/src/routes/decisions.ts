import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { approvals, db } from '@agentic-cicd/db';
import { approvalSchema } from '@agentic-cicd/shared-types';

import { getEventRuntimeStatus } from '../debate/runtime-state.js';
import { sendApprovalSlackNotification } from '../utils/slack.js';

const approvalRequestSchema = approvalSchema.extend({
  decisionId: z.string().uuid(),
});

const decisionParamsSchema = z.object({
  id: z.string().uuid(),
});

const workflowAgentOrder = [
  'build_analyzer',
  'code_reviewer',
  'test_analyzer',
  'dependency_checker',
  'judge',
] as const;

type WorkflowAgentId = (typeof workflowAgentOrder)[number];

function inferWorkflowStatus(args: {
  runtimeStatus: ReturnType<typeof getEventRuntimeStatus>;
  findingCount: number;
  challengeCount: number;
  rebuttalCount: number;
  hasDecision: boolean;
}) {
  if (args.runtimeStatus === 'CANCELLED') {
    return 'CANCELLED' as const;
  }

  if (args.hasDecision || args.runtimeStatus === 'COMPLETED') {
    return 'JUDGED' as const;
  }

  if (args.rebuttalCount > 0) {
    return 'REBUTTING' as const;
  }

  if (args.challengeCount > 0) {
    return 'CHALLENGING' as const;
  }

  if (args.findingCount > 0 || args.runtimeStatus === 'RUNNING') {
    return 'ANALYZING' as const;
  }

  return 'STARTED' as const;
}

function buildAgentSnapshots(args: {
  findings: Array<{
    agentId: string;
    confidence: number;
    timedOut: boolean;
  }>;
  rebuttals: Array<{
    respondingAgentId: string;
    updatedConfidence: number;
    position: 'DEFEND' | 'CONCEDE' | 'COMPROMISE';
  }>;
  decision: {
    compositeScore: number;
  } | null;
}) {
  return workflowAgentOrder.map((agentId) => {
    if (agentId === 'judge') {
      return {
        agentId,
        confidence: args.decision?.compositeScore ?? null,
        previousConfidence: null,
        status: args.decision ? 'judging' : 'idle',
        rebuttalPosition: null,
      };
    }

    const finding = args.findings.find((row) => row.agentId === agentId);
    const rebuttal = args.rebuttals.find((row) => row.respondingAgentId === agentId);

    let status:
      | 'idle'
      | 'analyzing'
      | 'finding_ready'
      | 'challenging'
      | 'defending'
      | 'conceding'
      | 'judging' = 'idle';

    if (rebuttal) {
      status = rebuttal.position === 'CONCEDE' ? 'conceding' : 'defending';
    } else if (finding) {
      status = finding.timedOut ? 'idle' : 'finding_ready';
    }

    return {
      agentId,
      confidence: rebuttal?.updatedConfidence ?? finding?.confidence ?? null,
      previousConfidence: finding?.confidence ?? null,
      status,
      rebuttalPosition: rebuttal?.position === 'COMPROMISE' ? null : (rebuttal?.position ?? null),
    };
  });
}

export const decisionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/config', async () => {
    return {
      slackApprovalsEnabled: Boolean(process.env.SLACK_APPROVALS_WEBHOOK_URL),
    };
  });

  fastify.get('/api/workflows', async () => {
    const rows = await db.query.pipelineEvents.findMany({
      with: {
        findings: true,
        challenges: true,
        rebuttals: true,
        decisions: true,
      },
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    return rows.map((row) => {
      const decision = row.decisions[0] ?? null;
      const runtimeStatus = getEventRuntimeStatus(row.eventId);
      const findingRows = [...row.findings].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
      const challengeRows = [...row.challenges].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
      const rebuttalRows = [...row.rebuttals].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );

      return {
        eventId: row.eventId,
        repository: row.repository,
        branch: row.branch,
        commitSha: row.commitSha,
        failureType: row.failureType,
        status: inferWorkflowStatus({
          runtimeStatus,
          findingCount: findingRows.length,
          challengeCount: challengeRows.length,
          rebuttalCount: rebuttalRows.length,
          hasDecision: Boolean(decision),
        }),
        runtimeStatus,
        createdAt: row.createdAt,
        timestamps: {
          startedAt: row.createdAt,
          round0At: findingRows[0]?.createdAt ?? null,
          round1At: challengeRows[0]?.createdAt ?? null,
          round2At: rebuttalRows[0]?.createdAt ?? null,
          round3At: decision?.createdAt ?? null,
        },
        counts: {
          findings: findingRows.length,
          challenges: challengeRows.length,
          rebuttals: rebuttalRows.length,
        },
        agents: buildAgentSnapshots({
          findings: findingRows,
          rebuttals: rebuttalRows,
          decision,
        }),
        decision: decision
          ? {
              decisionId: decision.decisionId,
              riskTier: decision.riskTier,
              compositeScore: decision.compositeScore,
            }
          : null,
      };
    });
  });

  fastify.get('/api/decisions', async () => {
    const rows = await db.query.decisions.findMany({
      with: {
        event: true,
      },
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    return rows.map((row) => ({
      decisionId: row.decisionId,
      eventId: row.eventId,
      compositeScore: row.compositeScore,
      riskTier: row.riskTier,
      reasoning: row.reasoning,
      recommendedAction: row.recommendedAction,
      executionMeta: row.executionMeta,
      createdAt: row.createdAt,
      repository: row.event.repository,
      failureType: row.event.failureType,
      branch: row.event.branch,
    }));
  });

  fastify.get('/api/decisions/:id', async (request, reply) => {
    const { id } = decisionParamsSchema.parse(request.params);

    let event = await db.query.pipelineEvents.findFirst({
      where: (fields, operators) => operators.eq(fields.eventId, id),
    });
    let targetEventId = id;
    let decisionRow = null;

    if (!event) {
      decisionRow = await db.query.decisions.findFirst({
        where: (fields, operators) => operators.eq(fields.decisionId, id),
      });
      if (!decisionRow) {
        return reply.status(404).send({
          message: 'Not found.',
        });
      }
      targetEventId = decisionRow.eventId;
      event = await db.query.pipelineEvents.findFirst({
        where: (fields, operators) => operators.eq(fields.eventId, targetEventId),
      });
    } else {
      decisionRow = await db.query.decisions.findFirst({
        where: (fields, operators) => operators.eq(fields.eventId, id),
      });
    }

    const [findingRows, challengeRows, rebuttalRows, approvalRows] = await Promise.all([
      db.query.agentFindings.findMany({
        where: (fields, operators) => operators.eq(fields.eventId, targetEventId),
      }),
      db.query.challenges.findMany({
        where: (fields, operators) => operators.eq(fields.eventId, targetEventId),
      }),
      db.query.rebuttals.findMany({
        where: (fields, operators) => operators.eq(fields.eventId, targetEventId),
      }),
      db.query.approvals.findMany({
        where: (fields, operators) =>
          operators.eq(
            fields.decisionId,
            decisionRow?.decisionId ?? '00000000-0000-0000-0000-000000000000',
          ),
      }),
    ]);

    return {
      decision: decisionRow ?? null,
      event,
      findings: findingRows,
      challenges: challengeRows,
      rebuttals: rebuttalRows,
      approvals: approvalRows,
    };
  });

  fastify.get('/api/approvals', async () => {
    const rows = await db.query.decisions.findMany({
      with: {
        event: true,
        approvals: true,
      },
      where: (fields, operators) => operators.inArray(fields.riskTier, ['MEDIUM', 'HIGH']),
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    return rows
      .filter((row) => row.approvals.length === 0)
      .map((row) => ({
        decisionId: row.decisionId,
        eventId: row.eventId,
        compositeScore: row.compositeScore,
        riskTier: row.riskTier,
        reasoning: row.reasoning,
        recommendedAction: row.recommendedAction,
        executionMeta: row.executionMeta,
        createdAt: row.createdAt,
        repository: row.event.repository,
        branch: row.event.branch,
        failureType: row.event.failureType,
      }));
  });

  fastify.get('/api/mitigations', async () => {
    // Only fetch approvals that were automatically created by the Auto-Mitigator
    const rows = await db.query.approvals.findMany({
      where: (fields, operators) => operators.eq(fields.approver, 'Auto-Mitigator'),
      with: {
        decision: {
          with: {
            event: true,
          },
        },
      },
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    return rows.map((row) => ({
      approvalId: row.approvalId,
      eventId: row.decision?.eventId,
      repository: row.decision?.event?.repository,
      branch: row.decision?.event?.branch,
      failureType: row.decision?.event?.failureType,
      errorLog: row.decision?.event?.errorLog,
      justification: row.justification,
      mitigationDiff: row.mitigationDiff,
      recommendedAction: row.decision?.recommendedAction,
      createdAt: row.createdAt,
    }));
  });

  fastify.post('/api/approvals', async (request, reply) => {
    const payload = approvalRequestSchema.parse(request.body);

    const decisionRow = await db.query.decisions.findFirst({
      where: (fields, operators) => operators.eq(fields.decisionId, payload.decisionId),
      with: {
        event: true,
      },
    });

    if (!decisionRow) {
      return reply.status(404).send({
        message: 'Decision not found.',
      });
    }

    await db.insert(approvals).values({
      approvalId: randomUUID(),
      decisionId: payload.decisionId,
      approver: payload.approver,
      action: payload.action,
      justification: payload.justification,
      timestamp: payload.timestamp,
    });

    if (decisionRow?.event) {
      try {
        await sendApprovalSlackNotification({
          decisionId: decisionRow.decisionId,
          eventId: decisionRow.eventId,
          repository: decisionRow.event.repository,
          branch: decisionRow.event.branch,
          failureType: decisionRow.event.failureType,
          riskTier: decisionRow.riskTier,
          compositeScore: decisionRow.compositeScore,
          reasoning: decisionRow.reasoning,
          recommendedAction: decisionRow.recommendedAction,
          approver: payload.approver,
          action: payload.action,
          justification: payload.justification,
        });
      } catch (error) {
        fastify.log.warn(
          { err: error, decisionId: payload.decisionId },
          'Failed to send Slack approval notification',
        );
      }
    }

    return reply.code(201).send({
      status: 'recorded',
      decisionId: payload.decisionId,
    });
  });
};
