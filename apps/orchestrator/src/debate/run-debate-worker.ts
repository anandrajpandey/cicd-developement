import type { PipelineEvent } from '@agentic-cicd/shared-types';

import { loadEnv } from '../env.js';
import { runDebate } from './run-debate.js';

loadEnv();

async function main(): Promise<void> {
  const encodedPayload = process.argv[2];

  if (!encodedPayload) {
    throw new Error('Missing debate worker payload.');
  }

  const event = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8')) as PipelineEvent;
  event.timestamp = new Date(event.timestamp);

  await runDebate(event);
}

void main().catch((error) => {
  console.error('Debate worker failed:', error);
  process.exit(1);
});

