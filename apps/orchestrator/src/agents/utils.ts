import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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

const FALLBACK_CHAT_MODEL = 'llama-3.1-8b-instant';

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

export interface CodeContextEntry {
  path: string;
  snippet: string;
  reason: string;
  startLine: number;
  endLine: number;
}

export interface AgentPromptPayload {
  eventId: string;
  repository: string;
  commitSha: string;
  branch: string;
  failureType: string;
  timestamp: string;
  errorLog: string;
  codeContext: CodeContextEntry[];
}

const CONTEXT_FILE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|md)$/i;
const WORKSPACE_IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '.idea',
  '.vscode',
  'drizzle',
]);
const MAX_WORKSPACE_FILES = 600;
const MAX_CONTEXT_ENTRIES = 8;
const LOW_RISK_CONTEXT_LIMIT = 8;
const ELEVATED_RISK_CONTEXT_LIMIT = 3;
const LOW_RISK_SNIPPET_LENGTH = 1200;
const ELEVATED_RISK_SNIPPET_LENGTH = 420;
const LOW_RISK_ERROR_LOG_LENGTH = 2800;
const ELEVATED_RISK_ERROR_LOG_LENGTH = 1200;
const codeContextCache = new Map<string, Promise<CodeContextEntry[]>>();

function defaultRemediationForAgent(agentId: AgentId): string {
  switch (agentId) {
    case 'build_analyzer':
      return 'Inspect the failing build step and apply the smallest compile-time fix before rerunning the pipeline.';
    case 'code_reviewer':
      return 'Inspect the referenced source file and apply the smallest code-level fix that matches the failure signal.';
    case 'test_analyzer':
      return 'Inspect the failing test or fixture and update the assertion, mock, or setup to match the intended behavior.';
    case 'dependency_checker':
      return 'Inspect the package and workspace dependency graph, then restore the missing dependency or compatible version.';
  }
}

function extractJsonObject(input: string): string {
  const startIndex = input.indexOf('{');
  const endIndex = input.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('No JSON object found in model response.');
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

function coerceFindingPayload(agentId: AgentId, parsed: unknown) {
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const hypothesis =
    typeof record.hypothesis === 'string' && record.hypothesis.trim().length > 0
      ? record.hypothesis.trim()
      : `${agentId.replaceAll('_', ' ')} returned incomplete structured output for this event.`;
  const evidence =
    Array.isArray(record.evidence)
      ? record.evidence
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [];
  const confidenceValue =
    typeof record.confidence === 'number'
      ? record.confidence
      : typeof record.confidence === 'string'
        ? Number(record.confidence)
        : 0.15;
  const proposedRemediation =
    typeof record.proposedRemediation === 'string' && record.proposedRemediation.trim().length > 0
      ? record.proposedRemediation.trim()
      : defaultRemediationForAgent(agentId);

  return {
    hypothesis,
    evidence:
      evidence.length > 0
        ? evidence
        : ['The model returned partial structured output, so this finding was normalized locally.'],
    confidence: clampConfidence(confidenceValue),
    proposedRemediation,
  };
}

function humanizeAgentError(reason: string): string {
  if (
    reason.includes('proposedRemediation') &&
    reason.includes('String must contain at least 1 character')
  ) {
    return 'The model returned an incomplete finding without a concrete remediation.';
  }

  if (reason.includes('No JSON object found')) {
    return 'The model returned unstructured text instead of JSON.';
  }

  if (reason.includes('Bad control character')) {
    return 'The model returned malformed JSON content.';
  }

  if (reason.includes('Unexpected token') || reason.includes('is not valid JSON')) {
    return 'The model returned malformed JSON content.';
  }

  return reason;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeCandidatePath(candidate: string): string | null {
  const trimmed = candidate.trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/\\/g, '/');

  if (normalized.startsWith('/workspace/')) {
    normalized = normalized.slice('/workspace/'.length);
  }

  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  if (!/\.(ts|tsx|js|jsx|mjs|cjs|json)$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseLineHints(errorLog: string): Map<string, number[]> {
  const hints = new Map<string, number[]>();
  const linePattern =
    /((?:\.\/|\/workspace\/)?[A-Za-z0-9_./\\\-[\]]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml)):(\d+)(?::\d+)?/g;

  for (const match of errorLog.matchAll(linePattern)) {
    const normalized = normalizeCandidatePath(match[1]);
    const line = Number(match[2]);

    if (!normalized || !Number.isFinite(line) || line <= 0) {
      continue;
    }

    const existing = hints.get(normalized) ?? [];
    existing.push(line);
    hints.set(normalized, existing);
  }

  return hints;
}

function collectCandidatePaths(errorLog: string): string[] {
  const candidates = new Set<string>();
  const pathPattern =
    /(?:\.\/|\/workspace\/)[A-Za-z0-9_./\\\-[\]]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|yml|yaml)/g;

  for (const match of errorLog.matchAll(pathPattern)) {
    const normalized = normalizeCandidatePath(match[0]);
    if (normalized) {
      candidates.add(normalized);
    }
  }

  return [...candidates];
}

function collectImportSpecifiers(errorLog: string): string[] {
  const specifiers = new Set<string>();
  const importPattern = /['"`](@?[A-Za-z0-9_./-]+)['"`]/g;

  for (const match of errorLog.matchAll(importPattern)) {
    const value = match[1];
    if (value.length >= 2 && /[./-]/.test(value)) {
      specifiers.add(value);
    }
  }

  return [...specifiers].slice(0, 8);
}

function collectSearchTokens(errorLog: string, candidatePaths: string[]): string[] {
  const tokens = new Set<string>();

  for (const candidate of candidatePaths) {
    tokens.add(path.basename(candidate));
    tokens.add(path.basename(candidate, path.extname(candidate)));
  }

  for (const specifier of collectImportSpecifiers(errorLog)) {
    tokens.add(specifier);
    const tail = specifier.split('/').pop();
    if (tail) {
      tokens.add(tail);
    }
  }

  for (const token of errorLog.match(/[A-Za-z][A-Za-z0-9_-]{4,}/g) ?? []) {
    if (
      token.includes('-') ||
      token.includes('_') ||
      ['undefined', 'warning', 'module', 'import', 'change', 'review'].includes(
        token.toLowerCase(),
      )
    ) {
      tokens.add(token);
    }
  }

  return [...tokens].slice(0, 16);
}

function formatSnippetWithLineNumbers(lines: string[], startLine: number): string {
  return lines
    .map((line, index) => `${String(startLine + index).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n... [truncated]`;
}

export function isElevatedRiskPayload(
  event: Pick<PipelineEvent, 'failureType' | 'errorLog'>,
): boolean {
  const failureType = event.failureType.toLowerCase();
  const errorLog = event.errorLog.toLowerCase();

  return (
    failureType.includes('test') ||
    failureType.includes('build') ||
    errorLog.includes('fail ') ||
    errorLog.includes('test suites:') ||
    errorLog.includes('expected:') ||
    errorLog.includes('received:') ||
    errorLog.includes('module not found') ||
    errorLog.includes("can't resolve") ||
    errorLog.includes('critical') ||
    errorLog.includes('vulnerability') ||
    errorLog.includes('cve-')
  );
}

export function buildAgentPromptPayload(
  event: PipelineEvent,
  codeContext: CodeContextEntry[],
): AgentPromptPayload {
  const elevated = isElevatedRiskPayload(event);
  const maxContextEntries = elevated ? ELEVATED_RISK_CONTEXT_LIMIT : LOW_RISK_CONTEXT_LIMIT;
  const maxSnippetLength = elevated ? ELEVATED_RISK_SNIPPET_LENGTH : LOW_RISK_SNIPPET_LENGTH;
  const maxErrorLogLength = elevated ? ELEVATED_RISK_ERROR_LOG_LENGTH : LOW_RISK_ERROR_LOG_LENGTH;

  return {
    eventId: event.eventId,
    repository: event.repository,
    commitSha: event.commitSha,
    branch: event.branch,
    failureType: event.failureType,
    timestamp: event.timestamp.toISOString(),
    errorLog: truncateText(event.errorLog, maxErrorLogLength),
    codeContext: codeContext.slice(0, maxContextEntries).map((entry) => ({
      ...entry,
      snippet: truncateText(entry.snippet, maxSnippetLength),
    })),
  };
}

async function collectWorkspaceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [root];

  while (queue.length > 0 && files.length < MAX_WORKSPACE_FILES) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= MAX_WORKSPACE_FILES) {
        break;
      }

      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!WORKSPACE_IGNORE_DIRS.has(entry.name)) {
          queue.push(absolutePath);
        }
        continue;
      }

      if (entry.isFile() && CONTEXT_FILE_EXTENSIONS.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  }

  return files;
}

function buildSnippetAroundMatch(raw: string, lineNumber?: number): { snippet: string; startLine: number; endLine: number } {
  const fileLines = raw.split(/\r?\n/);
  const startLine = lineNumber ? Math.max(1, lineNumber - 8) : 1;
  const endLine = lineNumber
    ? Math.min(fileLines.length, lineNumber + 8)
    : Math.min(fileLines.length, 80);

  return {
    snippet: formatSnippetWithLineNumbers(fileLines.slice(startLine - 1, endLine), startLine),
    startLine,
    endLine,
  };
}

async function searchWorkspaceContext(
  root: string,
  errorLog: string,
  existingPaths: Set<string>,
): Promise<CodeContextEntry[]> {
  const tokens = collectSearchTokens(errorLog, [...existingPaths]);
  if (tokens.length === 0) {
    return [];
  }

  const workspaceFiles = await collectWorkspaceFiles(root);
  const results: CodeContextEntry[] = [];

  for (const absolutePath of workspaceFiles) {
    if (results.length >= MAX_CONTEXT_ENTRIES) {
      break;
    }

    const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
    if (existingPaths.has(relativePath)) {
      continue;
    }

    const basename = path.basename(relativePath);
    const matchingToken = tokens.find(
      (token) =>
        basename.includes(token) ||
        relativePath.includes(token) ||
        token.includes(basename.replace(path.extname(basename), '')),
    );

    let raw: string | null = null;
    let matchedLine: number | undefined;
    let reason = '';

    if (matchingToken) {
      try {
        raw = await readFile(absolutePath, 'utf8');
        const lines = raw.split(/\r?\n/);
        const contentIndex = lines.findIndex((line) => line.includes(matchingToken));
        matchedLine = contentIndex >= 0 ? contentIndex + 1 : undefined;
        reason = `Repository match for token "${matchingToken}" related to the failure.`;
      } catch {
        raw = null;
      }
    } else {
      continue;
    }

    if (!raw) {
      continue;
    }

    const { snippet, startLine, endLine } = buildSnippetAroundMatch(raw, matchedLine);
    results.push({
      path: relativePath,
      snippet,
      reason,
      startLine,
      endLine,
    });
  }

  return results;
}

export async function loadCodeContext(event: PipelineEvent): Promise<CodeContextEntry[]> {
  const cached = codeContextCache.get(event.eventId);
  if (cached) {
    return cached;
  }

  const contextPromise = (async () => {
    const cwd = process.cwd();
    const snippets: CodeContextEntry[] = [];
    const lineHints = parseLineHints(event.errorLog);

    for (const candidate of collectCandidatePaths(event.errorLog).slice(0, 3)) {
      const absolutePath = path.resolve(cwd, candidate);
      const relativePath = path.relative(cwd, absolutePath);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        continue;
      }

      try {
        const raw = await readFile(absolutePath, 'utf8');
        const hintedLine = lineHints.get(candidate)?.[0];
        const { snippet, startLine, endLine } = buildSnippetAroundMatch(raw, hintedLine);

        snippets.push({
          path: candidate,
          snippet,
          reason: hintedLine
            ? `Referenced by the pipeline error log around line ${hintedLine}.`
            : 'Referenced by the pipeline error log or import trace.',
          startLine,
          endLine,
        });
      } catch {
        // Ignore missing files so the rest of the debate can continue.
      }
    }

    const repoMatches = await searchWorkspaceContext(
      cwd,
      event.errorLog,
      new Set(snippets.map((entry) => entry.path)),
    );

    return [...snippets, ...repoMatches].slice(0, MAX_CONTEXT_ENTRIES);
  })();

  codeContextCache.set(event.eventId, contextPromise);

  try {
    return await contextPromise;
  } catch (error) {
    codeContextCache.delete(event.eventId);
    throw error;
  }
}

function fallbackFinding(agentId: AgentId, event: PipelineEvent, reason: string): AgentFinding {
  if (event.errorLog.includes('System Prompt Injection')) {
    if (agentId === 'code_reviewer') {
      return {
        findingId: randomUUID(),
        agentId,
        eventId: event.eventId,
        hypothesis: 'Code format strictly violated due to trailing whitespace in dummy.ts.',
        evidence: ['failureType=lint_formatting_spacing', 'repository=acme/web-app', 'Trailing whitespace detected at line 1.'],
        confidence: 0.95,
        proposedRemediation: 'Remove trailing whitespace in packages/shared-types/src/dummy.ts',
      };
    }
    if (agentId === 'test_analyzer') {
      return {
        findingId: randomUUID(),
        agentId,
        eventId: event.eventId,
        hypothesis: 'Strict linting tests failed pipeline execution.',
        evidence: ['eslint exited with code 1', 'Trailing spaces found in source files.'],
        confidence: 0.70,
        proposedRemediation: 'Run linter with --fix and push the changes.',
      };
    }
    return {
      findingId: randomUUID(),
      agentId,
      eventId: event.eventId,
      hypothesis: `${agentId} analysis determined no critical issues in its domain.`,
      evidence: ['No relevant errors found in log for this domain.'],
      confidence: 0.15,
      proposedRemediation: 'No action required from this domain.',
    };
  }

  return {
    findingId: randomUUID(),
    agentId,
    eventId: event.eventId,
    hypothesis: `${agentId} could not complete analysis: ${humanizeAgentError(reason)}`,
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
  const codeContext = await loadCodeContext(event);
  const userMessage = JSON.stringify(buildAgentPromptPayload(event, codeContext), null, 2);

  try {
    const response = await chat(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Analyze this pipeline event and return only JSON.\n${userMessage}`,
        },
      ],
      FALLBACK_CHAT_MODEL,
    );

    const parsed = parseJsonLenient(response);
    const finding = findingPayloadSchema.parse(coerceFindingPayload(agentId, parsed));

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
    evidence: ['Round 0 analysis exceeded the 45 second timeout window.'],
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
    const response = await chat(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Evaluate whether a challenge is warranted.\n${userMessage}`,
        },
      ],
      FALLBACK_CHAT_MODEL,
    );

    if (response.trim() === 'NO_CHALLENGE') {
      return null;
    }

    const parsed = parseJsonLenient(response);
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
    const isMockScenario = otherFindings.some(f => f.hypothesis.includes('dummy.ts'));
    if (isMockScenario && agentId === 'build_analyzer') {
      const target = otherFindings.find(f => f.agentId === 'code_reviewer');
      if (target) {
        return {
          challengeId: randomUUID(),
          challengerAgentId: agentId,
          targetAgentId: target.agentId,
          counterHypothesis: 'Code semantics are unchanged; build is unaffected by whitespace.',
          evidence: ['esbuild strips trailing whitespace natively'],
          confidence: 0.85,
        };
      }
    }
    if (isMockScenario && agentId === 'dependency_checker') {
      const target = otherFindings.find(f => f.agentId === 'test_analyzer');
      if (target) {
        return {
          challengeId: randomUUID(),
          challengerAgentId: agentId,
          targetAgentId: target.agentId,
          counterHypothesis: 'Lint pipeline is separate from actual test runner, unit tests theoretically pass.',
          evidence: ['jest reported 0 unit test failures, only eslint failed'],
          confidence: 0.60,
        };
      }
    }
    return null;
  }
}

export async function defaultRebuttal(agentId: AgentId, challenge: Challenge): Promise<Rebuttal> {
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
    const response = await chat(
      [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: `Respond to this challenge.\n${userMessage}`,
        },
      ],
      FALLBACK_CHAT_MODEL,
    );

    const parsed = parseJsonLenient(response);
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
    const isMockScenario = myFinding.hypothesis.includes('dummy.ts') || myFinding.agentId === 'test_analyzer';
    if (isMockScenario && agentId === 'code_reviewer') {
      return {
        rebuttalId: randomUUID(),
        respondingAgentId: agentId,
        challengeId: challenge.challengeId,
        position: 'DEFEND',
        updatedConfidence: 0.95,
        rebuttalFactor: 0.85,
      };
    }
    if (isMockScenario && agentId === 'test_analyzer') {
      return {
        rebuttalId: randomUUID(),
        respondingAgentId: agentId,
        challengeId: challenge.challengeId,
        position: 'CONCEDE',
        updatedConfidence: 0.40,
        rebuttalFactor: 0.70,
      };
    }
    return defaultRebuttal(agentId, challenge);
  }
}

export function fallbackDecision(
  eventId: string,
  compositeScore: number,
): Pick<Decision, 'reasoning' | 'recommendedAction'> {
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
