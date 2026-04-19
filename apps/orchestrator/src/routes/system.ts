import type { FastifyPluginAsync } from 'fastify';

import { getAdkWorkflowSummary } from '../adk/workflow.js';

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/system/agents', async () => {
    return getAdkWorkflowSummary();
  });
};
