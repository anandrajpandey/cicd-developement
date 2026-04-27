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
    repository: 'web-team/dashboard-app',
    commitSha: 'a1b2c3d4e5f6',
    branch: 'chore/update-deps',
    failureType: 'simulation_easy',
    errorLog: sanitizeLog(`ESLint Report: Lint warnings detected in the build.
  File: src/components/Header.tsx:14:32
    Warning: Multiple trailing spaces found. (no-trailing-spaces)
  File: src/utils/helpers.ts:42:1
    Warning: Unused variable 'tempVar' declared. (no-unused-vars)
  File: src/pages/Dashboard.tsx:8:5
    Warning: React Hook missing dependency: 'data'. (react-hooks/exhaustive-deps)
  
Build completed with 3 lint warnings. Consider fixing before merge.`),
    timestamp: new Date(),
  };

  try {
    await db.insert(pipelineEvents).values(event);
  } catch (err) {
    console.warn('DB insert failed; continuing without persistence:', err instanceof Error ? err.message : String(err));
  }
  const mode = forceDeterministicFallback ? 'DETERMINISTIC' : 'AI';
  console.log(`\n[${timestamp}] EASY Risk Simulation (Mode: ${mode})`);
  console.log(`Repository: ${event.repository}`);
  console.log(`Branch: ${event.branch}`);
  console.log(`Event ID: ${event.eventId}\n`);
  
  try {
    await runDebate(event);
    console.log(`\n✓ EASY simulation completed successfully.\n`);
  } catch (error) {
    console.error(`\n✗ EASY simulation failed:`, error);
    process.exit(1);
  }
}

main().catch(console.error);
