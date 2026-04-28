import Fastify from 'fastify';
import { ZodError } from 'zod';

import { loadEnv } from './env.js';
import { githubRoutes } from './routes/github.js';
import { decisionRoutes } from './routes/decisions.js';
import { eventRoutes } from './routes/events.js';
import { systemRoutes } from './routes/system.js';

export function buildApp() {
  loadEnv();

  const app = Fastify({
    logger: true,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: 'Invalid pipeline event payload.',
        issues: error.issues,
      });
    }

    app.log.error({ err: error }, 'Unhandled request error.');

    return reply.status(500).send({
      message: 'Internal server error.',
    });
  });

  app.get('/health', async () => ({
    status: 'ok',
  }));

  app.register(eventRoutes);
  app.register(githubRoutes);
  app.register(decisionRoutes);
  app.register(systemRoutes);

  return app;
}
