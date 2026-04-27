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
    repository: 'backend-team/api-service',
    commitSha: '7777cccc',
    branch: 'feat/api-v2',
    failureType: 'simulation_medium',
    errorLog: sanitizeLog(`Unit Test Failures Detected:

FAIL  src/__tests__/userService.test.ts
  ✕ should fetch user profile correctly (234ms)
    AssertionError: expected null to equal Object {
      id: '123',
      email: 'test@example.com',
      role: 'admin'
    }
      at UserService.getProfile (src/services/userService.ts:45:11)
      at async Object.<anonymous> (src/__tests__/userService.test.ts:18:5)
  
  ● should fetch user profile correctly
    The API response structure changed but migration script was not executed.
    Schema mismatch detected: expected 'profile' field but got 'user_profile' in database.

Test Summary: 1 failed, 23 passed (156ms total)`),
    timestamp: new Date(),
  };

  await db.insert(pipelineEvents).values(event);
  const mode = forceDeterministicFallback ? 'DETERMINISTIC' : 'AI';
  console.log(`\n[${timestamp}] MEDIUM Risk Simulation (Mode: ${mode})`);
  console.log(`Repository: ${event.repository}`);
  console.log(`Branch: ${event.branch}`);
  console.log(`Event ID: ${event.eventId}\n`);
  
  try {
    await runDebate(event);
    console.log(`\n✓ MEDIUM simulation completed successfully.\n`);
  } catch (error) {
    console.error(`\n✗ MEDIUM simulation failed:`, error);
    process.exit(1);
  }
}

main().catch(console.error);
