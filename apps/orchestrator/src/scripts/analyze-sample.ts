import { randomUUID } from 'node:crypto';

import type { PipelineEvent } from '@agentic-cicd/shared-types';

import { loadEnv } from '../env.js';
import { executeAdkWorkflow, getAdkWorkflowSummary } from '../adk/workflow.js';
import {
  runCrossChallenges,
  runInitialAnalysis,
  runJudgeSynthesis,
  runRebuttals,
} from '../debate/run-debate.js';

loadEnv();

const sampleEvent: PipelineEvent = {
  eventId: randomUUID(),
  repository: 'acme/web-app',
  commitSha: 'f42ab9738ee22d5fe4b1cb54fc9980c1d84a6cb2',
  branch: 'main',
  failureType: 'build_failure',
  errorLog: `Failed to compile.
./src/app/page.tsx:4:31
Module not found: Can't resolve '@agentic-cicd/shared-types'

Import trace for requested module:
./src/app/page.tsx

Node.js version: 22.15.0`,
  timestamp: new Date(),
};

async function main(): Promise<void> {
  const adkWorkflow = getAdkWorkflowSummary();
  const adkExecution = await executeAdkWorkflow(sampleEvent);
  const initialAnalysis = await runInitialAnalysis(sampleEvent, { persist: false });
  const challengeResults = await runCrossChallenges(sampleEvent, initialAnalysis.data, { persist: false });
  const rebuttalResults = await runRebuttals(sampleEvent, initialAnalysis.data, challengeResults.data, {
    persist: false,
  });
  const decision = await runJudgeSynthesis(
    sampleEvent,
    initialAnalysis.data,
    challengeResults.data,
    rebuttalResults.data,
    {
      round0: initialAnalysis.source,
      round1: challengeResults.source,
      round2: rebuttalResults.source,
      round3: 'NATIVE',
    },
    { persist: false },
  );

  console.log(
    JSON.stringify(
      {
        adkWorkflow,
        adkExecution,
        findings: initialAnalysis,
        challengeResults,
        rebuttalResults,
        decision,
      },
      null,
      2,
    ),
  );
}

void main();
