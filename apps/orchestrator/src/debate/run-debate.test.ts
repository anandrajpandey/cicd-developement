import test from 'node:test';
import assert from 'node:assert/strict';

import type { AgentFinding, Challenge, Rebuttal } from '@agentic-cicd/shared-types';

import { calculateCompositeScore, classifyRiskTier } from './run-debate.js';

const baseFindings: AgentFinding[] = [
  {
    findingId: 'f1',
    agentId: 'build_analyzer',
    eventId: '11111111-1111-4111-8111-111111111111',
    hypothesis: 'build issue',
    evidence: ['build evidence'],
    confidence: 0.9,
    proposedRemediation: 'fix build',
  },
  {
    findingId: 'f2',
    agentId: 'code_reviewer',
    eventId: '11111111-1111-4111-8111-111111111111',
    hypothesis: 'code issue',
    evidence: ['code evidence'],
    confidence: 0.8,
    proposedRemediation: 'fix code',
  },
  {
    findingId: 'f3',
    agentId: 'test_analyzer',
    eventId: '11111111-1111-4111-8111-111111111111',
    hypothesis: 'test issue',
    evidence: ['test evidence'],
    confidence: 0.7,
    proposedRemediation: 'fix tests',
  },
  {
    findingId: 'f4',
    agentId: 'dependency_checker',
    eventId: '11111111-1111-4111-8111-111111111111',
    hypothesis: 'dependency issue',
    evidence: ['dependency evidence'],
    confidence: 0.6,
    proposedRemediation: 'fix dependency',
  },
];

test('calculateCompositeScore uses maximum effective confidence', () => {
  const challenges: Challenge[] = [
    {
      challengeId: 'c1',
      challengerAgentId: 'build_analyzer',
      targetAgentId: 'test_analyzer',
      counterHypothesis: 'build issue overrides test issue',
      evidence: ['contradiction'],
      confidence: 0.75,
    },
  ];

  const rebuttals: Rebuttal[] = [
    {
      rebuttalId: 'r1',
      respondingAgentId: 'test_analyzer',
      challengeId: 'c1',
      position: 'CONCEDE',
      updatedConfidence: 0.5,
      rebuttalFactor: 0.7,
    },
  ];

  const score = calculateCompositeScore(baseFindings, challenges, rebuttals);
  assert.equal(Number(score.toFixed(4)), 0.9);
});

test('classifyRiskTier respects low, medium, and high thresholds', () => {
  assert.equal(classifyRiskTier(0.34), 'LOW');
  assert.equal(classifyRiskTier(0.35), 'MEDIUM');
  assert.equal(classifyRiskTier(0.7), 'MEDIUM');
  assert.equal(classifyRiskTier(0.71), 'HIGH');
});
