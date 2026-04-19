import type { FastifyPluginAsync } from 'fastify';

import { db, pipelineEvents } from '@agentic-cicd/db';
import { pipelineEventSchema } from '@agentic-cicd/shared-types';

import { runDebate } from '../debate/run-debate.js';

const responseSchema = {
  202: {
    type: 'object',
    required: ['eventId', 'status'],
    properties: {
      eventId: { type: 'string', format: 'uuid' },
      status: { type: 'string' },
    },
  },
} as const;

export const eventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/events',
    {
      schema: {
        body: {
          type: 'object',
          required: [
            'eventId',
            'repository',
            'commitSha',
            'branch',
            'failureType',
            'errorLog',
            'timestamp',
          ],
          properties: {
            eventId: { type: 'string', format: 'uuid' },
            repository: { type: 'string' },
            commitSha: { type: 'string' },
            branch: { type: 'string' },
            failureType: { type: 'string' },
            errorLog: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        response: responseSchema,
      },
    },
    async (request, reply) => {
      const event = pipelineEventSchema.parse(request.body);

      await db.insert(pipelineEvents).values({
        eventId: event.eventId,
        repository: event.repository,
        commitSha: event.commitSha,
        branch: event.branch,
        failureType: event.failureType,
        errorLog: event.errorLog,
        timestamp: event.timestamp,
      });

      fastify.log.info({ eventId: event.eventId }, 'Pipeline event stored.');

      void runDebate(event).catch((error: unknown) => {
        fastify.log.error(
          { err: error, eventId: event.eventId },
          'Debate pipeline failed after intake.',
        );
      });

      return reply.code(202).send({
        eventId: event.eventId,
        status: 'accepted',
      });
    },
  );
};
