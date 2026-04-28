import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentFinding, PipelineEvent } from '@agentic-cicd/shared-types';

import { normalizeFindingForEvent, shouldBypassCodeContext } from './utils.js';

const lintEvent: PipelineEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  repository: 'agentic-testers/dummy-repo',
  commitSha: '5a2b1c9d',
  branch: 'feature/test-risks',
  failureType: 'lint_error',
  errorLog: `Warning: Multiple spaces found before 'import' declaration. (no-multi-spaces)
  at src/components/button.tsx:4:1
Warning: Missing trailing comma. (comma-dangle)
  at src/utils/format.ts:12:15
Warning: React hook missing dependency: 'router'. (react-hooks/exhaustive-deps)`,
  timestamp: new Date('2026-04-28T00:00:00.000Z'),
};

function makeFinding(agentId: AgentFinding['agentId'], confidence = 0.8): AgentFinding {
  return {
    findingId: `${agentId}-finding`,
    agentId,
    eventId: lintEvent.eventId,
    hypothesis: 'Strong root cause claimed by the agent.',
    evidence: ['generic evidence 1', 'generic evidence 2'],
    confidence,
    proposedRemediation: 'File: src/whatever.ts\nChange:\nDo something.',
  };
}

test('normalizeFindingForEvent weakens only clearly off-domain lint findings', () => {
  const normalizedTest = normalizeFindingForEvent(lintEvent, makeFinding('test_analyzer'));
  const normalizedDependency = normalizeFindingForEvent(
    lintEvent,
    makeFinding('dependency_checker'),
  );

  assert.equal(normalizedTest.confidence, 0.15);
  assert.match(normalizedTest.hypothesis, /test-domain explanation is weak/i);

  // React hook dependency lint rules should keep dependency-checker in-domain.
  assert.equal(normalizedDependency.confidence, 0.8);
  assert.doesNotMatch(normalizedDependency.hypothesis, /dependency.*weak/i);
});

test('normalizeFindingForEvent preserves a strong code reviewer on lint events', () => {
  const normalized = normalizeFindingForEvent(lintEvent, makeFinding('code_reviewer', 0.8));

  assert.equal(normalized.confidence, 0.8);
});

test('shouldBypassCodeContext skips code context for hard simulation code reviewer runs', () => {
  assert.equal(shouldBypassCodeContext('code_reviewer', { ...lintEvent, failureType: 'simulation_hard' }), true);
  assert.equal(shouldBypassCodeContext('build_analyzer', { ...lintEvent, failureType: 'simulation_hard' }), true);
  assert.equal(shouldBypassCodeContext('dependency_checker', { ...lintEvent, failureType: 'simulation_hard' }), true);
  assert.equal(shouldBypassCodeContext('code_reviewer', { ...lintEvent, failureType: 'lint_error' }), false);
});
