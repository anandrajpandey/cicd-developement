import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import { and, desc, eq, inArray, notExists } from 'drizzle-orm';
import { z } from 'zod';

import {
  agentFindings,
  approvals,
  challenges,
  db,
  decisions,
  pipelineEvents,
  rebuttals,
} from '@agentic-cicd/db';
import { approvalSchema } from '@agentic-cicd/shared-types';

const approvalRequestSchema = approvalSchema.extend({
  decisionId: z.string().uuid(),
});

const decisionParamsSchema = z.object({
  id: z.string().uuid(),
});

export const decisionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/decisions', async () => {
    const rows = await db
      .select({
        decisionId: decisions.decisionId,
        eventId: decisions.eventId,
        compositeScore: decisions.compositeScore,
        riskTier: decisions.riskTier,
        reasoning: decisions.reasoning,
        recommendedAction: decisions.recommendedAction,
        createdAt: decisions.createdAt,
        repository: pipelineEvents.repository,
        failureType: pipelineEvents.failureType,
        branch: pipelineEvents.branch,
      })
      .from(decisions)
      .innerJoin(pipelineEvents, eq(decisions.eventId, pipelineEvents.eventId))
      .orderBy(desc(decisions.createdAt));

    return rows;
  });

  fastify.get('/api/decisions/:id', async (request, reply) => {
    const { id } = decisionParamsSchema.parse(request.params);

    const decisionRow = await db.query.decisions.findFirst({
      where: eq(decisions.decisionId, id),
    });

    if (!decisionRow) {
      return reply.status(404).send({
        message: 'Decision not found.',
      });
    }

    const [event, findingRows, challengeRows, rebuttalRows, approvalRows] = await Promise.all([
      db.query.pipelineEvents.findFirst({
        where: eq(pipelineEvents.eventId, decisionRow.eventId),
      }),
      db.query.agentFindings.findMany({
        where: eq(agentFindings.eventId, decisionRow.eventId),
      }),
      db.query.challenges.findMany({
        where: eq(challenges.eventId, decisionRow.eventId),
      }),
      db.query.rebuttals.findMany({
        where: eq(rebuttals.eventId, decisionRow.eventId),
      }),
      db.query.approvals.findMany({
        where: eq(approvals.decisionId, id),
      }),
    ]);

    return {
      decision: decisionRow,
      event,
      findings: findingRows,
      challenges: challengeRows,
      rebuttals: rebuttalRows,
      approvals: approvalRows,
    };
  });

  fastify.get('/api/approvals', async () => {
    const rows = await db
      .select({
        decisionId: decisions.decisionId,
        eventId: decisions.eventId,
        compositeScore: decisions.compositeScore,
        riskTier: decisions.riskTier,
        reasoning: decisions.reasoning,
        recommendedAction: decisions.recommendedAction,
        createdAt: decisions.createdAt,
        repository: pipelineEvents.repository,
        branch: pipelineEvents.branch,
        failureType: pipelineEvents.failureType,
      })
      .from(decisions)
      .innerJoin(pipelineEvents, eq(decisions.eventId, pipelineEvents.eventId))
      .where(
        and(
          inArray(decisions.riskTier, ['MEDIUM', 'HIGH']),
          notExists(
            db
              .select({ approvalId: approvals.approvalId })
              .from(approvals)
              .where(eq(approvals.decisionId, decisions.decisionId)),
          ),
        ),
      )
      .orderBy(desc(decisions.createdAt));

    return rows;
  });

  fastify.post('/api/approvals', async (request, reply) => {
    const payload = approvalRequestSchema.parse(request.body);

    const decisionRow = await db.query.decisions.findFirst({
      where: eq(decisions.decisionId, payload.decisionId),
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
