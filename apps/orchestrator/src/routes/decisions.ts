import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { approvals, db } from '@agentic-cicd/db';
import { approvalSchema } from '@agentic-cicd/shared-types';

const approvalRequestSchema = approvalSchema.extend({
  decisionId: z.string().uuid(),
});

const decisionParamsSchema = z.object({
  id: z.string().uuid(),
});

export const decisionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/workflows', async () => {
    const events = await db.query.pipelineEvents.findMany({
      with: {
        findings: true,
        challenges: true,
        rebuttals: true,
        decisions: true,
      },
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
      limit: 30,
    });

    return events.map((event) => {
      const latestDecision = [...event.decisions].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];
      const latestFinding = [...event.findings].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];
      const latestChallenge = [...event.challenges].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];
      const latestRebuttal = [...event.rebuttals].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )[0];

      const status = latestDecision
        ? 'JUDGED'
        : latestRebuttal
          ? 'REBUTTING'
          : latestChallenge
            ? 'CHALLENGING'
            : latestFinding
              ? 'ANALYZING'
              : 'STARTED';

      return {
        eventId: event.eventId,
        repository: event.repository,
        branch: event.branch,
        commitSha: event.commitSha,
        failureType: event.failureType,
        status,
        createdAt: event.createdAt,
        timestamps: {
          startedAt: event.createdAt,
          round0At: latestFinding?.createdAt ?? null,
          round1At: latestChallenge?.createdAt ?? null,
          round2At: latestRebuttal?.createdAt ?? null,
          round3At: latestDecision?.createdAt ?? null,
        },
        decision: latestDecision
          ? {
              decisionId: latestDecision.decisionId,
              riskTier: latestDecision.riskTier,
              compositeScore: latestDecision.compositeScore,
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
        where: (fields, operators) => operators.eq(fields.decisionId, decisionRow?.decisionId ?? '00000000-0000-0000-0000-000000000000'),
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
          }
        }
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

    return reply.code(201).send({
      status: 'recorded',
      decisionId: payload.decisionId,
    });
  });
};
