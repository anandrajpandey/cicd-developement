import { randomUUID } from 'node:crypto';

import { chat } from '@agentic-cicd/llm-client';
import type {
  AgentFinding,
  AgentId,
  Challenge,
  Decision,
  PipelineEvent,
  Rebuttal,
  RiskTier,
} from '@agentic-cicd/shared-types';

import { agentFindings, challenges, db, decisions, rebuttals } from '@agentic-cicd/db';

import {
  buildAnalyzerAgent,
  codeReviewerAgent,
  dependencyCheckerAgent,
  testAnalyzerAgent,
} from '../agents/index.js';
import { createTimeoutFinding, fallbackDecision } from '../agents/utils.js';

import { logger } from '../logger.js';
import { judgePrompt } from '../prompts/judge.js';
import { createDebateStartedPayload, emitDebateEvent } from '../realtime.js';

const analysisAgents = [
  buildAnalyzerAgent,
  codeReviewerAgent,
  testAnalyzerAgent,
  dependencyCheckerAgent,
] as const;

const ROUND_0_TIMEOUT_MS = 30_000;
const ROUND_2_TIMEOUT_MS = 20_000;

const domainWeights: Record<AgentId, number> = {
  build_analyzer: 0.3,
  code_reviewer: 0.25,
  test_analyzer: 0.25,
  dependency_checker: 0.2,
};

interface DebateRoundOptions {
  persist?: boolean;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        resolve(fallback());
      }, timeoutMs);
    }),
  ]);
}

async function persistFindings(findings: AgentFinding[], eventId: string): Promise<void> {
  await db.insert(agentFindings).values(
    findings.map((finding) => ({
      findingId: finding.findingId,
      agentId: finding.agentId,
      eventId,
      hypothesis: finding.hypothesis,
      evidence: finding.evidence,
      confidence: finding.confidence,
      proposedRemediation: finding.proposedRemediation,
      timedOut: finding.hypothesis.startsWith('TIMEOUT:'),
    })),
  );
}

async function persistChallenges(foundChallenges: Challenge[], eventId: string): Promise<void> {
  if (foundChallenges.length === 0) {
    return;
  }

  await db.insert(challenges).values(
    foundChallenges.map((challenge) => ({
      challengeId: challenge.challengeId,
      eventId,
      challengerAgentId: challenge.challengerAgentId,
      targetAgentId: challenge.targetAgentId,
      counterHypothesis: challenge.counterHypothesis,
      evidence: challenge.evidence,
      confidence: challenge.confidence,
    })),
  );
}

async function persistRebuttals(foundRebuttals: Rebuttal[], eventId: string): Promise<void> {
  if (foundRebuttals.length === 0) {
    return;
  }

  await db.insert(rebuttals).values(
    foundRebuttals.map((rebuttal) => ({
      rebuttalId: rebuttal.rebuttalId,
      eventId,
      challengeId: rebuttal.challengeId,
      respondingAgentId: rebuttal.respondingAgentId,
      position: rebuttal.position,
      updatedConfidence: rebuttal.updatedConfidence,
      rebuttalFactor: rebuttal.rebuttalFactor,
    })),
  );
}

async function persistDecision(decision: Decision): Promise<void> {
  await db.insert(decisions).values({
    decisionId: decision.decisionId,
    eventId: decision.eventId,
    compositeScore: decision.compositeScore,
    riskTier: decision.riskTier,
    reasoning: decision.reasoning,
    recommendedAction: decision.recommendedAction,
  });
}

function validateChallenge(challenge: Challenge | null): Challenge | null {
  if (!challenge) {
    return null;
  }

  if (challenge.evidence.length === 0) {
    return null;
  }

  if (challenge.targetAgentId === challenge.challengerAgentId) {
    return null;
  }

  return challenge;
}

function validateRebuttal(rebuttal: Rebuttal | null): Rebuttal | null {
  if (!rebuttal) {
    return null;
  }

  if (rebuttal.rebuttalFactor !== 0.85 && rebuttal.rebuttalFactor !== 0.7) {
    return null;
  }

  if (rebuttal.updatedConfidence < 0 || rebuttal.updatedConfidence > 1) {
    return null;
  }

  return rebuttal;
}

function getRiskTier(compositeScore: number): RiskTier {
  if (compositeScore < 0.35) {
    return 'LOW';
  }

  if (compositeScore <= 0.7) {
    return 'MEDIUM';
  }

  return 'HIGH';
}

function getFinalizedFindings(findings: AgentFinding[], foundChallenges: Challenge[], foundRebuttals: Rebuttal[]) {
  return findings.map((finding) => {
    const relatedRebuttal = foundRebuttals.find(
      (rebuttal) => rebuttal.respondingAgentId === finding.agentId,
    );

    if (!relatedRebuttal) {
      return {
        ...finding,
        effectiveConfidence: finding.confidence,
        rebuttalFactor: 1,
      };
    }

    const relatedChallenge = foundChallenges.find(
      (challenge) => challenge.challengeId === relatedRebuttal.challengeId,
    );

    const updatedHypothesis =
      relatedRebuttal.position === 'CONCEDE' && relatedChallenge
        ? relatedChallenge.counterHypothesis
        : finding.hypothesis;

    return {
      ...finding,
      hypothesis: updatedHypothesis,
      effectiveConfidence: relatedRebuttal.updatedConfidence,
      rebuttalFactor: relatedRebuttal.rebuttalFactor,
    };
  });
}

export function calculateCompositeScore(
  findings: AgentFinding[],
  foundChallenges: Challenge[],
  foundRebuttals: Rebuttal[],
): number {
  const finalizedFindings = getFinalizedFindings(findings, foundChallenges, foundRebuttals);

  const numerator = finalizedFindings.reduce((total, finding) => {
    const weight = domainWeights[finding.agentId];
    return total + finding.effectiveConfidence * weight * finding.rebuttalFactor;
  }, 0);

  const denominator = Object.values(domainWeights).reduce((sum, weight) => sum + weight, 0);
  return denominator === 0 ? 0 : numerator / denominator;
}

async function synthesizeDecision(
  event: PipelineEvent,
  findings: AgentFinding[],
  foundChallenges: Challenge[],
  foundRebuttals: Rebuttal[],
  compositeScore: number,
  riskTier: RiskTier,
): Promise<Pick<Decision, 'reasoning' | 'recommendedAction'>> {
  try {
    const response = await chat([
      { role: 'system', content: judgePrompt },
      {
        role: 'user',
        content: JSON.stringify(
          {
            event,
            findings: getFinalizedFindings(findings, foundChallenges, foundRebuttals),
            rebuttals: foundRebuttals,
            compositeScore,
            riskTier,
          },
          null,
          2,
        ),
      },
    ]);

    const parsed = JSON.parse(response.slice(response.indexOf('{'), response.lastIndexOf('}') + 1)) as {
      reasoning?: unknown;
      recommendedAction?: unknown;
    };

    if (
      typeof parsed.reasoning === 'string' &&
      parsed.reasoning.length > 0 &&
      typeof parsed.recommendedAction === 'string' &&
      parsed.recommendedAction.length > 0
    ) {
      return {
        reasoning: parsed.reasoning,
        recommendedAction: parsed.recommendedAction,
      };
    }
  } catch (error) {
    logger.warn('Judge synthesis fell back to deterministic summary.', {
      eventId: event.eventId,
      error,
    });
  }

  return fallbackDecision(event.eventId, compositeScore);
}

export async function runInitialAnalysis(
  event: PipelineEvent,
  options: DebateRoundOptions = {},
): Promise<AgentFinding[]> {
  const settledFindings = await Promise.allSettled(
    analysisAgents.map((agent) =>
      withTimeout(agent.analyze(event), ROUND_0_TIMEOUT_MS, () =>
        createTimeoutFinding(agent.agentId, event),
      ),
    ),
  );

  const findings = settledFindings.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    logger.warn('Agent analysis failed, using timeout/error fallback.', {
      eventId: event.eventId,
      agentId: analysisAgents[index].agentId,
      error: result.reason,
    });

    return createTimeoutFinding(analysisAgents[index].agentId, event);
  });

  if (options.persist ?? true) {
    await persistFindings(findings, event.eventId);
  }

  logger.info('Initial agent analysis complete.', {
    eventId: event.eventId,
    agentCount: findings.length,
  });

  emitDebateEvent('round:0:complete', event.eventId, {
    eventId: event.eventId,
    findings,
  });

  return findings;
}

export async function runCrossChallenges(
  findings: AgentFinding[],
  options: DebateRoundOptions = {},
): Promise<Challenge[]> {
  const settledChallenges = await Promise.allSettled(
    analysisAgents.map((agent) => {
      const myFinding = findings.find((finding) => finding.agentId === agent.agentId);
      const otherFindings = findings.filter((finding) => finding.agentId !== agent.agentId);

      if (!myFinding) {
        return Promise.resolve(null);
      }

      return agent.challenge(myFinding, otherFindings);
    }),
  );

  const validChallenges = settledChallenges
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .map((challenge) => validateChallenge(challenge))
    .filter((challenge): challenge is Challenge => challenge !== null);

  const eventId = findings[0]?.eventId;
  if (eventId && (options.persist ?? true)) {
    await persistChallenges(validChallenges, eventId);
  }

  logger.info('Cross-challenge round complete.', {
    eventId,
    challengeCount: validChallenges.length,
  });

  if (eventId) {
    emitDebateEvent('round:1:complete', eventId, {
      eventId,
      challenges: validChallenges,
    });
  }

  return validChallenges;
}

export async function runRebuttals(
  findings: AgentFinding[],
  foundChallenges: Challenge[],
  options: DebateRoundOptions = {},
): Promise<Rebuttal[]> {
  const settledRebuttals = await Promise.allSettled(
    foundChallenges.map((challenge) => {
      const targetAgent = analysisAgents.find((agent) => agent.agentId === challenge.targetAgentId);
      const myFinding = findings.find((finding) => finding.agentId === challenge.targetAgentId);

      if (!targetAgent || !myFinding) {
        return Promise.resolve(null);
      }

      return withTimeout(
        targetAgent.rebuttal(myFinding, challenge),
        ROUND_2_TIMEOUT_MS,
        () => ({
          rebuttalId: randomUUID(),
          respondingAgentId: challenge.targetAgentId,
          challengeId: challenge.challengeId,
          position: 'DEFEND' as const,
          updatedConfidence: myFinding.confidence,
          rebuttalFactor: 0.85 as const,
        }),
      );
    }),
  );

  const validRebuttals = settledRebuttals
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .map((rebuttal) => validateRebuttal(rebuttal))
    .filter((rebuttal): rebuttal is Rebuttal => rebuttal !== null);

  const eventId = findings[0]?.eventId;
  if (eventId && (options.persist ?? true)) {
    await persistRebuttals(validRebuttals, eventId);
  }

  logger.info('Rebuttal round complete.', {
    eventId,
    rebuttalCount: validRebuttals.length,
  });

  if (eventId) {
    emitDebateEvent('round:2:complete', eventId, {
      eventId,
      rebuttals: validRebuttals,
    });
  }

  return validRebuttals;
}

export async function runJudgeSynthesis(
  event: PipelineEvent,
  findings: AgentFinding[],
  foundChallenges: Challenge[],
  foundRebuttals: Rebuttal[],
  options: DebateRoundOptions = {},
): Promise<Decision> {
  const compositeScore = calculateCompositeScore(findings, foundChallenges, foundRebuttals);
  const riskTier = getRiskTier(compositeScore);
  const synthesis = await synthesizeDecision(
    event,
    findings,
    foundChallenges,
    foundRebuttals,
    compositeScore,
    riskTier,
  );

  const decision: Decision = {
    decisionId: randomUUID(),
    eventId: event.eventId,
    compositeScore,
    riskTier,
    reasoning: synthesis.reasoning,
    recommendedAction: synthesis.recommendedAction,
  };

  if (options.persist ?? true) {
    await persistDecision(decision);
  }

  logger.info('Judge synthesis complete.', {
    eventId: event.eventId,
    decisionId: decision.decisionId,
    compositeScore,
    riskTier,
  });

  emitDebateEvent('decision:ready', event.eventId, {
    eventId: event.eventId,
    decision,
  });

  return decision;
}

export async function runDebate(event: PipelineEvent): Promise<void> {
  emitDebateEvent('debate:started', event.eventId, createDebateStartedPayload(event));

  const findings = await runInitialAnalysis(event);
  const foundChallenges = await runCrossChallenges(findings);
  const foundRebuttals = await runRebuttals(findings, foundChallenges);
  const decision = await runJudgeSynthesis(event, findings, foundChallenges, foundRebuttals);

  logger.info('Debate pipeline complete.', {
    eventId: event.eventId,
    repository: event.repository,
    findings,
    foundChallenges,
    foundRebuttals,
    decision,
  });
}
