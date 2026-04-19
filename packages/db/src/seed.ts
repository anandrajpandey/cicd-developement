import { randomUUID } from 'node:crypto';

import { db, pool } from './client.js';
import { pipelineEvents } from './schema.js';

async function seed(): Promise<void> {
  const now = new Date();

  await db.insert(pipelineEvents).values([
    {
      eventId: randomUUID(),
      repository: 'acme/frontend-app',
      commitSha: '4c8a6d2f15e1ab7fd8129d8f5b463cb6e0f0a91a',
      branch: 'main',
      failureType: 'build_failure',
      errorLog:
        "Error: Cannot find module '@agentic-cicd/shared-types'\n    at webpack compilation step\nNode.js v22.15.0",
      timestamp: now,
    },
    {
      eventId: randomUUID(),
      repository: 'acme/api-service',
      commitSha: 'b193de02d41a52cb90f4a1114cff065dc27f2a52',
      branch: 'release/1.4.2',
      failureType: 'test_failure',
      errorLog:
        'FAIL src/routes/approvals.spec.ts\nExpected status 201 but received 500\nRedis connection refused on localhost:6379',
      timestamp: new Date(now.getTime() - 60 * 60 * 1000),
    },
  ]);
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error('Failed to seed database.', error);
    await pool.end();
    process.exitCode = 1;
  });
