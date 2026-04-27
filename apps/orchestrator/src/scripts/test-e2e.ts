import { randomUUID } from 'node:crypto';
import { loadEnv } from '../env.js';

loadEnv();
process.env.ADK_BASE_URL = 'http://127.0.0.1:59999';

let db: any;
let pipelineEvents: any;
let runDebate: any;

const forceDeterministicFallback = process.argv.includes('--deterministic');
if (forceDeterministicFallback) {
  process.env.SIMULATION_FORCE_FALLBACK = 'true';
}

/**
 * Rate limit helper: delay between requests to avoid Groq 429 errors
 * Groq rate limits: typically 30 requests per minute for free tier
 * So we use 2-3 second delay between simulations
 */
function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeLog(log: string): string {
  return log.replace(/[\u0000-\u001F\u007F]/g, (m) => (m === '\n' ? ' ' : '')).trim();
}

interface SimulationResult {
  tier: string;
  eventId: string;
  repository: string;
  branch: string;
  mode: string;
  status: 'success' | 'failed';
  duration: number;
  error?: string;
}

const results: SimulationResult[] = [];

async function runSimulation(
  tier: string,
  failureType: string,
  repository: string,
  commitSha: string,
  branch: string,
  errorLog: string,
): Promise<SimulationResult> {
  const startTime = Date.now();
  const eventId = randomUUID();
  const mode = forceDeterministicFallback ? 'DETERMINISTIC' : 'AI';

  if (!db) {
    const dbModule = await import('@agentic-cicd/db');
    db = dbModule.db;
    pipelineEvents = dbModule.pipelineEvents;
  }

  if (!runDebate) {
    const rn = await import('../debate/run-debate.js');
    runDebate = rn.runDebate ?? rn;
  }

  console.log(`\n[${'='.repeat(70)}]`);
  console.log(`[${tier.toUpperCase()} RISK - ${mode} MODE]`);
  console.log(`Repository: ${repository}`);
  console.log(`Branch: ${branch}`);
  console.log(`Event ID: ${eventId}`);
  console.log(`[${'='.repeat(70)}]\n`);

  try {
    const event = {
      eventId,
      repository,
      commitSha,
      branch,
      failureType,
      errorLog: sanitizeLog(errorLog),
      timestamp: new Date(),
    };

    try {
      await db.insert(pipelineEvents).values(event);
    } catch (err) {
      console.warn('DB insert failed; continuing without persistence:', err instanceof Error ? err.message : String(err));
    }

    await runDebate(event);

    const duration = Date.now() - startTime;
    console.log(`\n✓ ${tier.toUpperCase()} simulation completed in ${(duration / 1000).toFixed(2)}s\n`);

    return { tier, eventId, repository, branch, mode, status: 'success', duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ ${tier.toUpperCase()} simulation failed: ${errorMsg}\n`);

    return { tier, eventId, repository, branch, mode, status: 'failed', duration, error: errorMsg };
  }
}

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' END-TO-END SIMULATION TEST SUITE '.padEnd(69) + '║');
  console.log('║' + ` Mode: ${(forceDeterministicFallback ? 'DETERMINISTIC' : 'AI').padEnd(61)}║`);
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('');

  // EASY: Linter Warnings
  const easyResult = await runSimulation(
    'EASY',
    'simulation_easy',
    'web-team/dashboard-app',
    'a1b2c3d4e5f6',
    'chore/update-deps',
    `ESLint Report: Lint warnings detected in the build.
  File: src/components/Header.tsx:14:32
    Warning: Multiple trailing spaces found. (no-trailing-spaces)
  File: src/utils/helpers.ts:42:1
    Warning: Unused variable 'tempVar' declared. (no-unused-vars)
  File: src/pages/Dashboard.tsx:8:5
    Warning: React Hook missing dependency: 'data'. (react-hooks/exhaustive-deps)
  
Build completed with 3 lint warnings. Consider fixing before merge.`,
  );
  results.push(easyResult);

  console.log('Waiting 3 seconds before MEDIUM test (rate limit buffer)...');
  await delayMs(3000);

  // MEDIUM: Test Failure
  const mediumResult = await runSimulation(
    'MEDIUM',
    'simulation_medium',
    'backend-team/api-service',
    '7777cccc',
    'feat/api-v2',
    `Unit Test Failures Detected:

FAIL  src/__tests__/userService.test.ts
  X should fetch user profile correctly (234ms)
    AssertionError: expected null to equal Object {
      id: '123',
      email: 'test@example.com',
      role: 'admin'
    }
      at UserService.getProfile (src/services/userService.ts:45:11)
      at async Object.<anonymous> (src/__tests__/userService.test.ts:18:5)
  
  - should fetch user profile correctly
    The API response structure changed but migration script was not executed.
    Schema mismatch detected: expected 'profile' field but got 'user_profile' in database.

Test Summary: 1 failed, 23 passed (156ms total)`,
  );
  results.push(mediumResult);

  console.log('Waiting 3 seconds before HIGH test (rate limit buffer)...');
  await delayMs(3000);

  // HARD: Database Schema Violation
  const hardResult = await runSimulation(
    'HIGH',
    'simulation_hard',
    'data-platform/warehouse',
    '9999ffff',
    'feat/schema-migration-v3',
    `CRITICAL BUILD FAILURE: Database Migration Failed.

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
Deployment blocked. Manual database intervention required.`,
  );
  results.push(hardResult);

  // Print summary report
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' TEST EXECUTION SUMMARY '.padEnd(69) + '║');
  console.log('╠' + '═'.repeat(68) + '╣');

  let totalDuration = 0;
  let successCount = 0;

  for (const result of results) {
    totalDuration += result.duration;
    if (result.status === 'success') {
      successCount++;
    }

    const statusIcon = result.status === 'success' ? '✓' : '✗';
    const statusText = result.status === 'success' ? 'PASS' : 'FAIL';
    const durationText = `${(result.duration / 1000).toFixed(2)}s`;

    const line = `║ ${statusIcon} ${result.tier.padEnd(8)} ${statusText.padEnd(6)} ${result.mode.padEnd(12)} ${result.repository.padEnd(35)} ${durationText.padStart(7)} ║`;
    console.log(line);
  }

  console.log('╠' + '═'.repeat(68) + '╣');
  const passRate = ((successCount / results.length) * 100).toFixed(0);
  console.log(`║ Results: ${successCount}/${results.length} passed (${passRate}%)${''.padEnd(48)} ║`);
  console.log(`║ Total Duration: ${(totalDuration / 1000).toFixed(2)}s${''.padEnd(51)} ║`);
  console.log(`║ Execution Mode: ${forceDeterministicFallback ? 'DETERMINISTIC' : 'AI'.padEnd(50)}  ║`);
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('');

  // Exit with appropriate code
  const allPassed = successCount === results.length;
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
