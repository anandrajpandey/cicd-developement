import { randomUUID } from 'node:crypto';
import { db, pipelineEvents } from '@agentic-cicd/db';
import { runDebate } from '../debate/run-debate.js';
import { loadEnv } from '../env.js';

loadEnv();
process.env.ADK_BASE_URL = 'http://127.0.0.1:59999';

async function main() {
  const event = {
    eventId: randomUUID(),
    repository: 'acme/billing-service',
    commitSha: '9999ffff',
    branch: 'feat/drop-legacy-table',
    failureType: 'integration_test_failure',
    errorLog: `Error: Test suite failed.
FAIL src/tests/billing-cycle.test.ts
  ✕ should process monthly invoices (153ms)
  
  ● should process monthly invoices
    QueryFailedError: relation "legacy_invoices" does not exist
      at Query.run (src/db/query.ts:25:11)
      
This PR drops the 'legacy_invoices' table but 3 background workers still depend on it!
`,
    timestamp: new Date(),
  };

  await db.insert(pipelineEvents).values(event);

  console.log('Sending HIGH RISK event ID', event.eventId);
  await runDebate(event);
}

main().catch(console.error);
