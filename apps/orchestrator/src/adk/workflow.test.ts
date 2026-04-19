import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentFinding, PipelineEvent } from '@agentic-cicd/shared-types';

import { normalizeAdkRoundZeroFindings } from './workflow.js';

test('normalizeAdkRoundZeroFindings boosts build and dependency confidence for clear module-resolution failures', () => {
  const event: PipelineEvent = {
    eventId: '11111111-1111-4111-8111-111111111111',
    repository: 'acme/web-app',
    commitSha: 'abc123',
    branch: 'main',
    failureType: 'build_failure',
    errorLog:
      "Build failed during bundling.\nModule not found: Can't resolve '@agentic-cicd/shared-types'\nImport trace:\n./src/app/page.tsx",
    timestamp: new Date('2026-04-20T00:00:00.000Z'),
  };

  const findings: AgentFinding[] = [
    {
      findingId: 'f1',
      agentId: 'build_analyzer',
      eventId: event.eventId,
      hypothesis: 'The pipeline event does not provide sufficient information.',
      evidence: ['No details'],
      confidence: 0,
      proposedRemediation: 'Provide more details.',
    },
    {
      findingId: 'f2',
      agentId: 'dependency_checker',
      eventId: event.eventId,
      hypothesis: 'The pipeline event does not provide sufficient information.',
      evidence: ['No details'],
      confidence: 0,
      proposedRemediation: 'Provide more details.',
    },
    {
      findingId: 'f3',
      agentId: 'code_reviewer',
      eventId: event.eventId,
      hypothesis: 'Weak code signal',
      evidence: ['No code diff'],
      confidence: 0.2,
      proposedRemediation: 'Review changes.',
    },
    {
      findingId: 'f4',
      agentId: 'test_analyzer',
      eventId: event.eventId,
      hypothesis: 'Weak test signal',
      evidence: ['No test output'],
      confidence: 0,
      proposedRemediation: 'Review tests.',
    },
  ];

  const normalized = normalizeAdkRoundZeroFindings(event, findings);

  assert.equal(normalized[0]?.confidence, 0.85);
  assert.equal(normalized[1]?.confidence, 0.45);
  assert.equal(normalized[2]?.confidence, 0.2);
  assert.equal(normalized[3]?.confidence, 0);
});
