import { loadEnv } from './env.js';
import { initializeRealtime } from './realtime.js';
import { buildApp } from './app.js';

loadEnv();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

async function start(): Promise<void> {
  const app = buildApp();

  try {
    await app.listen({ port, host });
    await initializeRealtime(app.server);
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start orchestrator.');
    process.exit(1);
  }
}

void start();
