import { randomUUID } from 'node:crypto';
import { db, pipelineEvents } from '@agentic-cicd/db';
import { runDebate } from '../debate/run-debate.js';
import { loadEnv } from '../env.js';

loadEnv();
process.env.ADK_BASE_URL = 'http://127.0.0.1:59999';

const forceDeterministicFallback = process.argv.includes('--deterministic');
if (forceDeterministicFallback) {
  process.env.SIMULATION_FORCE_FALLBACK = 'true';
}

function sanitizeLog(log: string): string {
  return log.replace(/[\u0000-\u001F\u007F]/g, (m) => (m === '\n' ? ' ' : '')).trim();
}

async function main() {
  const timestamp = new Date().toISOString();
  const event = {
    eventId: randomUUID(),
    repository: 'data-platform/warehouse',
    commitSha: '9999ffff',
    branch: 'feat/schema-migration-v3',
    failureType: 'simulation_hard',
    errorLog: sanitizeLog(`CRITICAL BUILD FAILURE: Database Migration Failed.

Error in migration 20260427_drop_legacy_tables.sql:
  CONSTRAINT VIOLATION: Cannot drop table 'invoices_v1' - 8 active foreign key constraints depend on it.
  Dependent objects: batch_jobs.reference_invoice_id, reports.invoice_source, webhooks.payload

Error in test: src/tests/integration/payments.test.ts
  X should process monthly billing cycles (1245ms)
    QueryFailedError: relation "invoices_v1" does not exist
      at ConnectionPool.query (src/db/pool.ts:89:15)
      at Billing.processInvoices (src/billing/processor.ts:142:8)
  
  CRITICAL: This PR drops critical table 'invoices_v1' that 5 microservices depend on.
  3 background workers will crash on deployment. Multiple data integrity issues detected.
  
Build Status: FAILED (0 tests passed, 1 critical failure).
Deployment blocked. Manual database intervention required.`),
    timestamp: new Date(),
  };

  await db.insert(pipelineEvents).values(event);
  const mode = forceDeterministicFallback ? 'DETERMINISTIC' : 'AI';
  console.log(`\\n[${timestamp}] HIGH Risk Simulation (Mode: ${mode})`);
  console.log(`Repository: ${event.repository}`);
  console.log(`Branch: ${event.branch}`);
  console.log(`Event ID: ${event.eventId}\\n`);
  
  try {
    await runDebate(event);
    console.log(`\\n✓ HIGH simulation completed successfully.\\n`);
  } catch (error) {
    console.error(`\\n✗ HIGH simulation failed:`, error);
    process.exit(1);
  }
}

main().catch(console.error);
