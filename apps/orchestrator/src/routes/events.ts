import type { FastifyPluginAsync } from 'fastify';

import { db, pipelineEvents } from '@agentic-cicd/db';
import { pipelineEventSchema } from '@agentic-cicd/shared-types';

import { getEventRuntimeStatus } from '../debate/runtime-state.js';
import { cancelDebateWorker, startDebateWorker } from '../debate/worker-processes.js';
import { emitDebateEvent } from '../realtime.js';

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

      startDebateWorker(event);

      return reply.code(202).send({
        eventId: event.eventId,
        status: 'accepted',
      });
    },
  );

  fastify.post(
    '/api/events/:id/cancel',
    async (request, reply) => {
      try {
        const params = (request.params ?? {}) as { id?: string };
        const id = typeof params.id === 'string' ? params.id.trim() : '';

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
          return reply.status(400).send({
            message: 'Invalid event id.',
          });
        }

        const runtimeStatus = getEventRuntimeStatus(id);

        if (runtimeStatus === 'COMPLETED') {
          return reply.status(409).send({
            eventId: id,
            status: 'completed',
          });
        }

        if (runtimeStatus === null) {
          const [eventRow, decisionRow] = await Promise.all([
            db.query.pipelineEvents.findFirst({
              where: (fields, operators) => operators.eq(fields.eventId, id),
            }),
            db.query.decisions.findFirst({
              where: (fields, operators) => operators.eq(fields.eventId, id),
            }),
          ]);

          if (!eventRow) {
            return reply.status(404).send({
              eventId: id,
              status: 'not_found',
            });
          }

          if (decisionRow) {
            return reply.status(409).send({
              eventId: id,
              status: 'completed',
            });
          }
        }

        cancelDebateWorker(id);
        void emitDebateEvent('debate:cancelled', id, {
          eventId: id,
          status: 'CANCELLED',
        }).catch((error) => {
          fastify.log.error({ err: error, eventId: id }, 'Failed to emit cancellation event.');
        });

        return reply.code(202).send({
          eventId: id,
          status: 'cancelled',
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Cancel route failed.');
        return reply.status(500).send({
          message: error instanceof Error ? error.message : 'Unknown cancellation error.',
        });
      }
    },
  );
};
