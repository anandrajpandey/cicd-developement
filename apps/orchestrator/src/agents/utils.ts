import { randomUUID } from 'node:crypto';

import { chat } from '@agentic-cicd/llm-client';
import {
  type AgentFinding,
  type AgentId,
  type Challenge,
  type Decision,
  type PipelineEvent,
  type Rebuttal,
  agentFindingSchema,
  challengeSchema,
  rebuttalSchema,
} from '@agentic-cicd/shared-types';

const findingPayloadSchema = agentFindingSchema.pick({
  hypothesis: true,
  evidence: true,
  confidence: true,
  proposedRemediation: true,
});

const challengePayloadSchema = challengeSchema.pick({
  targetAgentId: true,
  counterHypothesis: true,
  evidence: true,
  confidence: true,
});

const rebuttalPayloadSchema = rebuttalSchema.pick({
  position: true,
  updatedConfidence: true,
});

function extractJsonObject(input: string): string {
  const startIndex = input.indexOf('{');
  const endIndex = input.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('No JSON object found in model response.');
  }

  return input.slice(startIndex, endIndex + 1);
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function fallbackFinding(agentId: AgentId, event: PipelineEvent, reason: string): AgentFinding {
  return {
    findingId: randomUUID(),
    agentId,
    eventId: event.eventId,
    hypothesis: `${agentId} could not complete analysis: ${reason}`,
    evidence: [
      `failureType=${event.failureType}`,
      `repository=${event.repository}`,
      `errorLog_length=${event.errorLog.length}`,
    ],
    confidence: 0.15,
    proposedRemediation: 'Review the raw error log manually and retry the debate run.',
  };
}

export async function analyzeWithPrompt(
  agentId: AgentId,
  prompt: string,
  event: PipelineEvent,
): Promise<AgentFinding> {
  const userMessage = JSON.stringify(
    {
      eventId: event.eventId,
      repository: event.repository,
      commitSha: event.commitSha,
      branch: event.branch,
      failureType: event.failureType,
      timestamp: event.timestamp.toISOString(),
      errorLog: event.errorLog,
    },
    null,
    2,
  );

  try {
    const response = await chat([
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: `Analyze this pipeline event and return only JSON.\n${userMessage}`,
      },
    ]);

    const parsed = JSON.parse(extractJsonObject(response)) as unknown;
    const finding = findingPayloadSchema.parse(parsed);

    return {
      findingId: randomUUID(),
      agentId,
      eventId: event.eventId,
      hypothesis: finding.hypothesis,
      evidence: finding.evidence,
      confidence: clampConfidence(finding.confidence),
      proposedRemediation: finding.proposedRemediation,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown analysis failure';
    return fallbackFinding(agentId, event, reason);
  }
}

export function createTimeoutFinding(agentId: AgentId, event: PipelineEvent): AgentFinding {
  return {
    findingId: randomUUID(),
    agentId,
    eventId: event.eventId,
    hypothesis: 'TIMEOUT: agent did not respond within the Round 0 time limit.',
    evidence: ['Round 0 analysis exceeded the 30 second timeout window.'],
    confidence: 0,
    proposedRemediation: 'Retry the debate run or inspect the raw error log manually.',
  };
}

export async function challengeWithPrompt(
  agentId: AgentId,
  domainPrompt: string,
  myFinding: AgentFinding,
  otherFindings: AgentFinding[],
): Promise<Challenge | null> {
  const prompt = `${domainPrompt}

You are now in debate Round 1.
Review your own finding and the other agents' findings.
If another finding clearly contradicts or weakens your conclusion, challenge the single best target.
If there is no meaningful contradiction, respond exactly with NO_CHALLENGE.

Otherwise respond with JSON only:
{
  "targetAgentId": "build_analyzer | code_reviewer | test_analyzer | dependency_checker",
  "counterHypothesis": "one-sentence counter argument",
  "evidence": ["specific contradiction", "specific contradiction"],
  "confidence": 0.0
}

Rules:
- Never target yourself.
- Only challenge one agent.
- Evidence must have at least one concrete point.
- Confidence must be between 0 and 1.
- Do not wrap the JSON in markdown.`;

  const userMessage = JSON.stringify(
    {
      myFinding,
      otherFindings,
    },
    null,
    2,
  );

  try {
    const response = await chat([
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: `Evaluate whether a challenge is warranted.\n${userMessage}`,
      },
    ]);

    if (response.trim() === 'NO_CHALLENGE') {
      return null;
    }

    const parsed = JSON.parse(extractJsonObject(response)) as unknown;
    const challenge = challengePayloadSchema.parse(parsed);

    if (challenge.targetAgentId === agentId || challenge.evidence.length === 0) {
      return null;
    }

    return {
      challengeId: randomUUID(),
      challengerAgentId: agentId,
      targetAgentId: challenge.targetAgentId,
      counterHypothesis: challenge.counterHypothesis,
      evidence: challenge.evidence,
      confidence: clampConfidence(challenge.confidence),
    };
  } catch {
    return null;
  }
}

export async function defaultRebuttal(
  agentId: AgentId,
  challenge: Challenge,
): Promise<Rebuttal> {
  return {
    rebuttalId: randomUUID(),
    respondingAgentId: agentId,
    challengeId: challenge.challengeId,
    position: 'DEFEND',
    updatedConfidence: 0.5,
    rebuttalFactor: 0.85,
  };
}

export async function rebuttalWithPrompt(
  agentId: AgentId,
  domainPrompt: string,
  myFinding: AgentFinding,
  challenge: Challenge,
): Promise<Rebuttal> {
  const prompt = `${domainPrompt}

You are now in debate Round 2.
Another agent has challenged your finding.
Choose whether to DEFEND your original finding or CONCEDE to the challenge.

Respond with JSON only:
{
  "position": "DEFEND" | "CONCEDE",
  "updatedConfidence": 0.0
}

Rules:
- DEFEND means your rebuttalFactor will be 0.85.
- CONCEDE means your rebuttalFactor will be 0.70.
- updatedConfidence must be between 0 and 1.
- Do not wrap the JSON in markdown.`;

  const userMessage = JSON.stringify(
    {
      myFinding,
      challenge,
    },
    null,
    2,
  );

  try {
    const response = await chat([
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: `Respond to this challenge.\n${userMessage}`,
      },
    ]);

    const parsed = JSON.parse(extractJsonObject(response)) as unknown;
    const rebuttal = rebuttalPayloadSchema.parse(parsed);

    return {
      rebuttalId: randomUUID(),
      respondingAgentId: agentId,
      challengeId: challenge.challengeId,
      position: rebuttal.position,
      updatedConfidence: clampConfidence(rebuttal.updatedConfidence),
      rebuttalFactor: rebuttal.position === 'DEFEND' ? 0.85 : 0.7,
    };
  } catch {
    return defaultRebuttal(agentId, challenge);
  }
}

export function fallbackDecision(eventId: string, compositeScore: number): Pick<
  Decision,
  'reasoning' | 'recommendedAction'
> {
  return {
    reasoning: `Judge fallback summary for event ${eventId}: the decision was computed from weighted agent confidence after rebuttal adjustments because judge synthesis was unavailable.`,
    recommendedAction:
      compositeScore >= 0.7
        ? 'Escalate immediately, review the strongest findings, and require human approval before remediation.'
        : compositeScore >= 0.35
          ? 'Review the findings and approve remediation after a quick human sanity check.'
          : 'Proceed with low-risk remediation and monitor the next pipeline run.',
  };
}
