import { randomUUID } from 'node:crypto';
import { db, pipelineEvents, agentFindings, challenges, rebuttals, decisions } from '@agentic-cicd/db';
import { runDebate } from '../debate/run-debate.js';
import { loadEnv } from '../env.js';

loadEnv();
process.env.ADK_BASE_URL = 'http://127.0.0.1:59999';

async function main() {
  const event = {
    eventId: randomUUID(),
    repository: 'acme/web-app',
    commitSha: '5678abcd',
    branch: 'fix/spacing-bug',
    failureType: 'lint_formatting_spacing',
    errorLog: 'Error: ESLint found 1 error.\npackages/shared-types/src/dummy.ts:1:32 - error: Trailing spaces not allowed. (no-trailing-spaces)\n\n1 | export const trigger = \'yes\';       \n                                   ^^^^^^^',
    timestamp: new Date(),
  };

  await db.insert(pipelineEvents).values(event);
  
  // We can patch runDebate or just run it and see if the LLM thinks quotes are low risk.
  // Actually, the user asked me to "induce a low risk event testcase".
  // Let's run it.
  console.log('Sending event ID', event.eventId);
  await runDebate(event);
}

main().catch(console.error);