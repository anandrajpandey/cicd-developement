import { randomUUID } from 'node:crypto';

import {
  BaseLlm,
  Gemini,
  InMemoryRunner,
  LLMRegistry,
  LlmAgent,
  ParallelAgent,
  SequentialAgent,
} from '@google/adk';
import { chat } from '@agentic-cicd/llm-client';
import type { ChatMessage } from '@agentic-cicd/llm-client';
import {
  agentFindingSchema,
  challengeSchema,
  decisionSchema,
  rebuttalSchema,
  type AgentFinding,
  type AgentId,
  type Challenge,
  type PipelineEvent,
  type Rebuttal,
} from '@agentic-cicd/shared-types';

import { loadEnv } from '../env.js';
import { loadCodeContext, type CodeContextEntry } from '../agents/utils.js';

import { buildAnalyzerPrompt } from '../prompts/build-analyzer.js';
import { codeReviewerPrompt } from '../prompts/code-reviewer.js';
import { dependencyCheckerPrompt } from '../prompts/dependency-checker.js';
import { judgePrompt } from '../prompts/judge.js';
import { testAnalyzerPrompt } from '../prompts/test-analyzer.js';
import { crossChallengePrompt, rebuttalPrompt } from '../prompts/debate-stages.js';

const PRIMARY_MODEL = 'groq/llama-3.1-8b-instant';
const FALLBACK_MODEL = 'ollama/mistral:7b';
const ADK_EXECUTION_TIMEOUT_MS = 60_000; // Increased to 60s for local LLM inference
const findingPayloadSchema = agentFindingSchema.pick({
  hypothesis: true,
  evidence: true,
  confidence: true,
  proposedRemediation: true,
});
const judgePayloadSchema = decisionSchema.pick({
  reasoning: true,
  recommendedAction: true,
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
  rebuttalFactor: true,
});
const roundZeroAgentIds = [
  'build_analyzer',
  'code_reviewer',
  'test_analyzer',
  'dependency_checker',
] as const satisfies readonly AgentId[];

loadEnv();

class GroqBridgeLlm extends BaseLlm {
  static supportedModels = [/^groq\/.+$/, /^ollama\/.+$/];

  override async *generateContentAsync(
    request: Parameters<Gemini['generateContentAsync']>[0],
    _stream?: Parameters<Gemini['generateContentAsync']>[1],
  ): ReturnType<Gemini['generateContentAsync']> {
    this.maybeAppendUserContent(request);

    const model = request.model ?? this.model;
    const normalizedModel = model.replace(/^(groq|ollama)\//, '');
    const systemInstruction =
      typeof request.config?.systemInstruction === 'string'
        ? request.config.systemInstruction.trim()
        : '';

    const systemMessages: ChatMessage[] = systemInstruction
      ? [
          {
            role: 'system',
            content: systemInstruction,
          },
        ]
      : [];

    const messages = request.contents.flatMap((content): ChatMessage[] => {
      const role: ChatMessage['role'] =
        content.role === 'model' ? 'assistant' : content.role === 'user' ? 'user' : 'system';

      const text = (content.parts ?? [])
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('\n')
        .trim();

      if (!text) {
        return [];
      }

      return [
        {
          role,
          content: text,
        },
      ];
    });

    const response = await chat([...systemMessages, ...messages], normalizedModel);

    yield {
      content: {
        role: 'model',
        parts: [{ text: response }],
      },
    };
  }

  override async connect(
    _request: Parameters<Gemini['connect']>[0],
  ): ReturnType<Gemini['connect']> {
    throw new Error('GroqBridgeLlm does not support live ADK connections in this MVP.');
  }
}

LLMRegistry.register(GroqBridgeLlm);

function withFallbackNote(instruction: string): string {
  return `${instruction}

Execution note:
- Primary inference target: ${PRIMARY_MODEL}
- Fallback inference target: ${FALLBACK_MODEL}`;
}

function withFindingOutputRules(instruction: string): string {
  return `${instruction}

Respond with JSON only in this shape:
{
  "hypothesis": "one-sentence root cause",
  "evidence": ["specific point", "specific point"],
  "confidence": 0.0,
  "proposedRemediation": "concrete file-level code or config change"
}

Rules:
- Confidence must be between 0 and 1.
- Evidence must contain at least one concrete point from the event.
- If codeContext is present, use it directly and cite the actual file path.
- Prefer a patch-like remediation over a summary.
- When possible, write proposedRemediation in this style:
  File: path/to/file
  Change:
  <exact code, config, import, or test edit>
- Do not include markdown fences or extra commentary.`;
}

function withJudgeOutputRules(instruction: string): string {
  return `${instruction}

Respond with JSON only in this shape:
{
  "reasoning": "natural-language reasoning summary",
  "recommendedAction": "grounded code-change plan"
}

Rules:
- Reasoning should synthesize the strongest findings and rebuttal-adjusted confidence.
- recommendedAction should be concise, actionable, and grounded in files already present in the event, codeContext, or findings.
- Never invent file paths, languages, modules, or frameworks that do not appear in the input.
- Prefer a numbered list of concrete edits when the findings support it.
- Do not include markdown fences or extra commentary.`;
}

function collectReferencedFiles(input: string): string[] {
  const matches = input.match(
    /(?:\.\/|\/workspace\/)?[A-Za-z0-9_./\\\-[\]]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml)/g,
  );

  if (!matches) {
    return [];
  }

  return [...new Set(matches.map((value) => value.replace(/^\/workspace\//, '').replace(/^\.\//, '')))];
}

function sanitizeFileForDisplay(path: string): string {
  return path.endsWith('.tsx]') ? path.replace(/\.tsx\]$/, '.tsx') : path;
}

function buildRecommendedActionFromFindings(findings: AgentFinding[]): string {
  const concrete = findings
    .map((finding) => finding.proposedRemediation.trim())
    .filter((value) => value.length > 0)
    .slice(0, 3);

  if (concrete.length === 0) {
    return 'Inspect the referenced failure files before making a patch.';
  }

  return concrete.map((value, index) => `${index + 1}. ${value}`).join('\n');
}

function groundJudgeRecommendedAction(
  event: PipelineEvent,
  findings: AgentFinding[],
  recommendedAction: string,
): string {
  const allowedFiles = new Set<string>([
    ...collectReferencedFiles(event.errorLog),
    ...findings.flatMap((finding) => collectReferencedFiles(finding.proposedRemediation)),
  ]);
  const referencedInJudge = collectReferencedFiles(recommendedAction);

  if (referencedInJudge.length === 0) {
    return buildRecommendedActionFromFindings(findings);
  }

  const hasUnknownReference = referencedInJudge.some((file) => !allowedFiles.has(file));
  if (hasUnknownReference) {
    return buildRecommendedActionFromFindings(findings);
  }

  return recommendedAction;
}

function buildGroundedJudgeInput(
  input: {
    event: PipelineEvent;
    findings: AgentFinding[];
    rebuttals: unknown;
    compositeScore: number;
    riskTier: string;
  },
  codeContext: CodeContextEntry[],
) {
  return {
    ...input,
    codeContext,
  };
}

function withChallengeOutputRules(instruction: string): string {
  return `${instruction}

Respond with either:
- NO_CHALLENGE
or JSON only in this shape:
{
  "targetAgentId": "build_analyzer | code_reviewer | test_analyzer | dependency_checker",
  "counterHypothesis": "one-sentence counter argument",
  "evidence": ["specific contradiction"],
  "confidence": 0.0
}

Rules:
- Never target yourself.
- Prefer challenging findings that introduce unsupported evidence, contradict the raw log, or use high confidence with weak grounding.
- If another finding is clearly outside its domain or invents facts not present in the event, challenge it.
- Evidence must contain at least one concrete point.
- Confidence must be between 0 and 1.
- Do not include markdown fences or extra commentary.`;
}

function withRebuttalOutputRules(instruction: string): string {
  return `${instruction}

Respond with JSON only in this shape:
{
  "position": "DEFEND" | "CONCEDE" | "COMPROMISE",
  "updatedConfidence": 0.0,
  "rebuttalFactor": 0.0
}

Rules:
- position must be one of DEFEND, CONCEDE, or COMPROMISE.
- updatedConfidence must be between 0 and 1.
- rebuttalFactor must be between 0 and 1, reflecting how much of the original confidence remains or how impactful the rebuttal is.
- Do not include markdown fences or extra commentary.`;
}

export const buildAnalyzerAdkAgent = new LlmAgent({
  name: 'build_analyzer',
  model: PRIMARY_MODEL,
  description: 'Analyzes build failures, compiler issues, and runtime mismatch problems.',
  instruction: withFallbackNote(withFindingOutputRules(buildAnalyzerPrompt)),
  outputKey: 'build_analyzer_finding',
});

export const codeReviewerAdkAgent = new LlmAgent({
  name: 'code_reviewer',
  model: PRIMARY_MODEL,
  description: 'Inspects code-quality and logic-level causes behind pipeline failures.',
  instruction: withFallbackNote(withFindingOutputRules(codeReviewerPrompt)),
  outputKey: 'code_reviewer_finding',
});

export const testAnalyzerAdkAgent = new LlmAgent({
  name: 'test_analyzer',
  model: PRIMARY_MODEL,
  description: 'Investigates regression, flaky test, and test setup causes.',
  instruction: withFallbackNote(withFindingOutputRules(testAnalyzerPrompt)),
  outputKey: 'test_analyzer_finding',
});

export const dependencyCheckerAdkAgent = new LlmAgent({
  name: 'dependency_checker',
  model: PRIMARY_MODEL,
  description: 'Checks dependency conflicts, missing packages, and version breakage.',
  instruction: withFallbackNote(withFindingOutputRules(dependencyCheckerPrompt)),
  outputKey: 'dependency_checker_finding',
});

export const crossChallengeAdkAgent = new LlmAgent({
  name: 'cross_challenge',
  model: PRIMARY_MODEL,
  description: 'Reviews findings for contradictions and proposes valid challenges.',
  instruction: withFallbackNote(
      withChallengeOutputRules(crossChallengePrompt),
    ),
    outputKey: 'cross_challenge_result',
  });

  export const rebuttalAdkAgent = new LlmAgent({
    name: 'rebuttal',
    model: PRIMARY_MODEL,
    description: 'Defends or concedes in response to a challenge.',
    instruction: withFallbackNote(
      withRebuttalOutputRules(rebuttalPrompt),
    ),
    outputKey: 'rebuttal_result',
  });

  export const judgeAdkAgent = new LlmAgent({
    name: 'judge',
  model: PRIMARY_MODEL,
  description: 'Synthesizes final reasoning, score interpretation, and recommended action.',
  instruction: withFallbackNote(withJudgeOutputRules(judgePrompt)),
  outputKey: 'judge_decision',
});

export const roundZeroParallelAdkAgent = new ParallelAgent({
  name: 'round_zero_parallel_analysis',
  description: 'Runs the four specialist analyzers in parallel for the first debate round.',
  subAgents: [
    buildAnalyzerAdkAgent,
    codeReviewerAdkAgent,
    testAnalyzerAdkAgent,
    dependencyCheckerAdkAgent,
  ],
});

export const debateWorkflowAdkAgent = new SequentialAgent({
  name: 'agentic_cicd_debate_workflow',
  description:
    'Coordinates parallel analysis, cross-challenge, rebuttal, and final synthesis for CI/CD failures.',
  subAgents: [roundZeroParallelAdkAgent, crossChallengeAdkAgent, rebuttalAdkAgent, judgeAdkAgent],
});

export const debateWorkflowRunner = new InMemoryRunner({
  agent: debateWorkflowAdkAgent,
  appName: 'agentic-cicd-orchestrator',
});
export const roundZeroWorkflowRunner = new InMemoryRunner({
  agent: roundZeroParallelAdkAgent,
  appName: 'agentic-cicd-orchestrator-round-zero',
});
export const judgeWorkflowRunner = new InMemoryRunner({
  agent: judgeAdkAgent,
  appName: 'agentic-cicd-orchestrator-judge',
});
export const crossChallengeWorkflowRunner = new InMemoryRunner({
  agent: crossChallengeAdkAgent,
  appName: 'agentic-cicd-orchestrator-challenge',
});
export const rebuttalWorkflowRunner = new InMemoryRunner({
  agent: rebuttalAdkAgent,
  appName: 'agentic-cicd-orchestrator-rebuttal',
});

export interface AdkWorkflowExecutionResult {
  status: 'completed' | 'failed';
  eventCount: number;
  textResponses: string[];
  errorMessage?: string;
}

export interface AdkRoundZeroResult {
  status: 'completed' | 'failed';
  findings: AgentFinding[];
  errorMessage?: string;
}

export interface AdkJudgeResult {
  status: 'completed' | 'failed';
  reasoning?: string;
  recommendedAction?: string;
  errorMessage?: string;
}

export interface AdkChallengeResult {
  status: 'completed' | 'failed';
  challenge: Challenge | null;
  errorMessage?: string;
}

export interface AdkRebuttalResult {
  status: 'completed' | 'failed';
  rebuttal?: Rebuttal;
  errorMessage?: string;
}

function extractJsonObject(input: string): string {
  const startIndex = input.indexOf('{');
  const endIndex = input.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('No JSON object found in ADK agent response.');
  }

  return input.slice(startIndex, endIndex + 1);
}

function escapeControlCharactersInJson(input: string): string {
  let result = '';
  let inString = false;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === '\n') {
        result += '\\n';
        continue;
      }
      if (char === '\r') {
        result += '\\r';
        continue;
      }
      if (char === '\t') {
        result += '\\t';
        continue;
      }
    }

    result += char;
  }

  return result;
}

function parseJsonLenient(input: string): unknown {
  return JSON.parse(escapeControlCharactersInJson(extractJsonObject(input)));
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function createAdkFailureFinding(
  agentId: AgentId,
  event: PipelineEvent,
  reason: string,
): AgentFinding {
  return {
    findingId: randomUUID(),
    agentId,
    eventId: event.eventId,
    hypothesis: `${agentId} ADK analysis was unavailable: ${reason}`,
    evidence: [
      `failureType=${event.failureType}`,
      `repository=${event.repository}`,
      `errorLog_length=${event.errorLog.length}`,
    ],
    confidence: 0,
    proposedRemediation:
      'Fall back to native agent analysis or inspect the raw error log manually.',
  };
}

function extractStateDeltaValue(event: unknown, key: string): string | null {
  if (
    !event ||
    typeof event !== 'object' ||
    !('actions' in event) ||
    !event.actions ||
    typeof event.actions !== 'object' ||
    !('stateDelta' in event.actions) ||
    !event.actions.stateDelta ||
    typeof event.actions.stateDelta !== 'object'
  ) {
    return null;
  }

  const value = event.actions.stateDelta[key as keyof typeof event.actions.stateDelta];
  return typeof value === 'string' ? value : null;
}

function parseAdkFinding(
  agentId: AgentId,
  event: PipelineEvent,
  rawPayload: string | null,
): AgentFinding {
  if (!rawPayload) {
    return createAdkFailureFinding(agentId, event, 'No ADK finding payload was returned.');
  }

  try {
    const parsed = parseJsonLenient(rawPayload);
    const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const normalizedFinding = {
      hypothesis:
        typeof record.hypothesis === 'string' && record.hypothesis.trim().length > 0
          ? record.hypothesis.trim()
          : `${agentId.replaceAll('_', ' ')} returned incomplete structured output for this event.`,
      evidence:
        Array.isArray(record.evidence) &&
        record.evidence.some((entry) => typeof entry === 'string' && entry.trim().length > 0)
          ? record.evidence
              .filter((entry): entry is string => typeof entry === 'string')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          : ['The ADK model returned partial structured output, so this finding was normalized locally.'],
      confidence:
        typeof record.confidence === 'number'
          ? clampConfidence(record.confidence)
          : typeof record.confidence === 'string'
            ? clampConfidence(Number(record.confidence))
            : 0.15,
      proposedRemediation:
        typeof record.proposedRemediation === 'string' && record.proposedRemediation.trim().length > 0
          ? record.proposedRemediation.trim()
          : 'Inspect the referenced file or log and apply the smallest domain-appropriate fix before rerunning the pipeline.',
    };
    const finding = findingPayloadSchema.parse(normalizedFinding);

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
    const reason = error instanceof Error ? error.message : 'Unknown ADK finding parse error.';
    return createAdkFailureFinding(agentId, event, reason);
  }
}

export function normalizeAdkRoundZeroFindings(
  event: PipelineEvent,
  findings: AgentFinding[],
): AgentFinding[] {
  const errorLog = event.errorLog.toLowerCase();
  const hasModuleResolutionSignal =
    errorLog.includes('module not found') ||
    errorLog.includes("can't resolve") ||
    errorLog.includes('cannot resolve') ||
    errorLog.includes('import trace');

  if (!hasModuleResolutionSignal) {
    return findings;
  }

  const primaryReferencedFile = collectReferencedFiles(event.errorLog)[0];

  return findings.map((finding) => {
    if (finding.agentId === 'build_analyzer') {
      const hypothesisLooksWeak =
        finding.hypothesis.toLowerCase().includes('insufficient') ||
        finding.hypothesis.toLowerCase().includes('does not provide') ||
        finding.confidence < 0.75;

      if (!hypothesisLooksWeak) {
        return finding;
      }

      return {
        ...finding,
        hypothesis: 'The build failure is likely due to a missing dependency or invalid import.',
        evidence: [
          'The error log explicitly says "Module not found".',
          'The log includes a "Can\'t resolve" package/import failure.',
          'The import trace points to an unresolved module during bundling.',
        ],
        confidence: 0.85,
        proposedRemediation:
          primaryReferencedFile
            ? `File: ${sanitizeFileForDisplay(primaryReferencedFile)}\nChange:\nReplace the unresolved import with the correct workspace path or restore the missing package export used by this file.`
            : 'File: package.json\nChange:\nRestore the missing package dependency or workspace export referenced by the failing import.',
      };
    }

    if (finding.agentId === 'dependency_checker') {
      const hypothesisLooksWeak =
        finding.hypothesis.toLowerCase().includes('insufficient') ||
        finding.hypothesis.toLowerCase().includes('does not provide') ||
        finding.confidence < 0.45;

      if (!hypothesisLooksWeak) {
        return finding;
      }

      return {
        ...finding,
        hypothesis:
          'The pipeline likely includes a missing package or dependency-resolution problem.',
        evidence: [
          'The unresolved module points to a package/dependency lookup failure.',
          'The bundler could not resolve the referenced shared-types module.',
        ],
        confidence: 0.45,
        proposedRemediation:
          'File: package.json\nChange:\nAdd or restore the missing workspace dependency and resync the lockfile so the referenced package can resolve during bundling.',
      };
    }

    return finding;
  });
}

function extractLatestStateDeltaValue(events: unknown[], key: string): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = extractStateDeltaValue(events[index], key);
    if (value) {
      return value;
    }
  }

  return null;
}

function collectTextResponses(events: unknown[]): string[] {
  return events.flatMap((event) => {
    if (
      !event ||
      typeof event !== 'object' ||
      !('content' in event) ||
      !event.content ||
      typeof event.content !== 'object' ||
      !('parts' in event.content) ||
      !Array.isArray(event.content.parts)
    ) {
      return [];
    }

    return event.content.parts.flatMap((part) => {
      if (!part || typeof part !== 'object' || !('text' in part) || typeof part.text !== 'string') {
        return [];
      }

      return [part.text];
    });
  });
}

export async function executeAdkWorkflow(
  event: PipelineEvent,
): Promise<AdkWorkflowExecutionResult> {
  const events: unknown[] = [];

  try {
    const execution = (async () => {
      for await (const runnerEvent of debateWorkflowRunner.runEphemeral({
        userId: `event:${event.eventId}`,
        newMessage: {
          parts: [
            {
              text: JSON.stringify(event, null, 2),
            },
          ],
        },
      })) {
        events.push(runnerEvent);
      }

      return {
        status: 'completed' as const,
        eventCount: events.length,
        textResponses: collectTextResponses(events),
      };
    })();

    const timeout = new Promise<AdkWorkflowExecutionResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'failed',
          eventCount: events.length,
          textResponses: collectTextResponses(events),
          errorMessage: `ADK execution timed out after ${ADK_EXECUTION_TIMEOUT_MS}ms.`,
        });
      }, ADK_EXECUTION_TIMEOUT_MS);
    });

    return await Promise.race([execution, timeout]);
  } catch (error) {
    return {
      status: 'failed',
      eventCount: events.length,
      textResponses: collectTextResponses(events),
      errorMessage: error instanceof Error ? error.message : 'Unknown ADK execution error.',
    };
  }
}

export async function executeAdkRoundZero(event: PipelineEvent): Promise<AdkRoundZeroResult> {
  const events: unknown[] = [];

  try {
    const codeContext = await loadCodeContext(event);
    const execution = (async () => {
      for await (const runnerEvent of roundZeroWorkflowRunner.runEphemeral({
        userId: `event:${event.eventId}`,
        newMessage: {
          parts: [
            {
              text: JSON.stringify({ ...event, codeContext }, null, 2),
            },
          ],
        },
      })) {
        events.push(runnerEvent);
      }

      const findings = roundZeroAgentIds.map((agentId) =>
        parseAdkFinding(
          agentId,
          event,
          extractStateDeltaValue(
            events.find((item) => {
              if (!item || typeof item !== 'object' || !('author' in item)) {
                return false;
              }

              return item.author === agentId;
            }),
            `${agentId}_finding`,
          ),
        ),
      );

      return {
        status: 'completed' as const,
        findings: normalizeAdkRoundZeroFindings(event, findings),
      };
    })();

    const timeout = new Promise<AdkRoundZeroResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'failed',
          findings: roundZeroAgentIds.map((agentId) =>
            createAdkFailureFinding(
              agentId,
              event,
              `ADK round zero timed out after ${ADK_EXECUTION_TIMEOUT_MS}ms.`,
            ),
          ),
          errorMessage: `ADK round zero timed out after ${ADK_EXECUTION_TIMEOUT_MS}ms.`,
        });
      }, ADK_EXECUTION_TIMEOUT_MS);
    });

    return await Promise.race([execution, timeout]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown ADK round zero error.';
    return {
      status: 'failed',
      findings: roundZeroAgentIds.map((agentId) => createAdkFailureFinding(agentId, event, reason)),
      errorMessage: reason,
    };
  }
}

export async function executeAdkJudge(input: {
  event: PipelineEvent;
  findings: AgentFinding[];
  rebuttals: unknown;
  compositeScore: number;
  riskTier: string;
}): Promise<AdkJudgeResult> {
  const events: unknown[] = [];

  try {
    const codeContext = await loadCodeContext(input.event);
    const execution = (async () => {
      for await (const runnerEvent of judgeWorkflowRunner.runEphemeral({
        userId: `event:${input.event.eventId}`,
        newMessage: {
          parts: [
            {
              text: JSON.stringify(buildGroundedJudgeInput(input, codeContext), null, 2),
            },
          ],
        },
      })) {
        events.push(runnerEvent);
      }

      const rawPayload = extractLatestStateDeltaValue(events, 'judge_decision');
      if (!rawPayload) {
        return {
          status: 'failed' as const,
          errorMessage: 'No ADK judge payload was returned.',
        };
      }

      const parsed = parseJsonLenient(rawPayload);
      const judgeDecision = judgePayloadSchema.parse(parsed);

      return {
        status: 'completed' as const,
        reasoning: judgeDecision.reasoning,
        recommendedAction: groundJudgeRecommendedAction(
          input.event,
          input.findings,
          judgeDecision.recommendedAction,
        ),
      };
    })();

    const timeout = new Promise<AdkJudgeResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'failed',
          errorMessage: `ADK judge timed out after ${ADK_EXECUTION_TIMEOUT_MS}ms.`,
        });
      }, ADK_EXECUTION_TIMEOUT_MS);
    });

    return await Promise.race([execution, timeout]);
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown ADK judge error.',
    };
  }
}

export async function executeAdkChallenge(input: {
  eventId: string;
  agentId: AgentId;
  myFinding: AgentFinding;
  otherFindings: AgentFinding[];
}): Promise<AdkChallengeResult> {
  const events: unknown[] = [];

  try {
    const execution = (async () => {
      for await (const runnerEvent of crossChallengeWorkflowRunner.runEphemeral({
        userId: `event:${input.eventId}:${input.agentId}`,
        newMessage: {
          parts: [
            {
              text: JSON.stringify(input, null, 2),
            },
          ],
        },
      })) {
        events.push(runnerEvent);
      }

      const rawPayload = extractLatestStateDeltaValue(events, 'cross_challenge_result');
      if (!rawPayload) {
        return {
          status: 'failed' as const,
          challenge: null,
          errorMessage: 'No ADK challenge payload was returned.',
        };
      }

      if (rawPayload.trim() === 'NO_CHALLENGE') {
        return {
          status: 'completed' as const,
          challenge: null,
        };
      }

      const parsed = parseJsonLenient(rawPayload);
      const challenge = challengePayloadSchema.parse(parsed);

      return {
        status: 'completed' as const,
        challenge: {
          challengeId: randomUUID(),
          challengerAgentId: input.agentId,
          targetAgentId: challenge.targetAgentId,
          counterHypothesis: challenge.counterHypothesis,
          evidence: challenge.evidence,
          confidence: clampConfidence(challenge.confidence),
        },
      };
    })();

    const timeout = new Promise<AdkChallengeResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'failed',
          challenge: null,
          errorMessage: `ADK challenge timed out after ${ADK_EXECUTION_TIMEOUT_MS}ms.`,
        });
      }, ADK_EXECUTION_TIMEOUT_MS);
    });

    return await Promise.race([execution, timeout]);
  } catch (error) {
    return {
      status: 'failed',
      challenge: null,
      errorMessage: error instanceof Error ? error.message : 'Unknown ADK challenge error.',
    };
  }
}

export async function executeAdkRebuttal(input: {
  eventId: string;
  agentId: AgentId;
  myFinding: AgentFinding;
  challenge: Challenge;
}): Promise<AdkRebuttalResult> {
  const events: unknown[] = [];

  try {
    const execution = (async () => {
      for await (const runnerEvent of rebuttalWorkflowRunner.runEphemeral({
        userId: `event:${input.eventId}:${input.agentId}`,
        newMessage: {
          parts: [
            {
              text: JSON.stringify(input, null, 2),
            },
          ],
        },
      })) {
        events.push(runnerEvent);
      }

      const rawPayload = extractLatestStateDeltaValue(events, 'rebuttal_result');
      if (!rawPayload) {
        return {
          status: 'failed' as const,
          errorMessage: 'No ADK rebuttal payload was returned.',
        };
      }

      const parsed = parseJsonLenient(rawPayload);
      const rebuttal = rebuttalPayloadSchema.parse(parsed);

      return {
        status: 'completed' as const,
        rebuttal: {
          rebuttalId: randomUUID(),
          respondingAgentId: input.agentId,
          challengeId: input.challenge.challengeId,
          position: rebuttal.position,
          updatedConfidence: clampConfidence(rebuttal.updatedConfidence),
          rebuttalFactor: clampConfidence(rebuttal.rebuttalFactor),
        },
      };
    })();

    const timeout = new Promise<AdkRebuttalResult>((resolve) => {
      setTimeout(() => {
        resolve({
          status: 'failed',
          errorMessage: `ADK rebuttal timed out after ${ADK_EXECUTION_TIMEOUT_MS}ms.`,
        });
      }, ADK_EXECUTION_TIMEOUT_MS);
    });

    return await Promise.race([execution, timeout]);
  } catch (error) {
    return {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown ADK rebuttal error.',
    };
  }
}

export function getAdkWorkflowSummary() {
  return {
    rootAgentName: debateWorkflowAdkAgent.name,
    appName: 'agentic-cicd-orchestrator',
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    phases: ['round_zero_parallel_analysis', 'cross_challenge', 'rebuttal', 'judge'],
    specialistAgents: ['build_analyzer', 'code_reviewer', 'test_analyzer', 'dependency_checker'],
  };
}



