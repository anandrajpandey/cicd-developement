import { randomUUID } from 'node:crypto';
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
  const { db, pipelineEvents } = await import('@agentic-cicd/db');
  const { runDebate } = await import('../debate/run-debate.js');
  const timestamp = new Date().toISOString();
  const event = {
    eventId: randomUUID(),
    repository: 'data-platform/warehouse',
    commitSha: '9999ffff',
    branch: 'feat/schema-migration-v3',
    failureType: 'simulation_hard',
    errorLog: sanitizeLog(`CRITICAL BUILD FAILURE: Module resolution failed during schema migration.

Error in src/billing/processor.ts:142
  Cannot find module '@app/db/client'
  import trace:
    src/billing/processor.ts

Build Status: FAILED. Shared billing services cannot start until the missing module is restored.`),
    timestamp: new Date(),
  };

  try {
    await db.insert(pipelineEvents).values(event);
  } catch (err) {
    console.warn('DB insert failed; continuing without persistence:', err instanceof Error ? err.message : String(err));
  }
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
