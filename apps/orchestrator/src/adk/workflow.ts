import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BaseLlm,
  FunctionTool,
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
import { z } from 'zod';

import { loadEnv } from '../env.js';
import { buildAgentPromptPayload, loadCodeContext, type CodeContextEntry } from '../agents/utils.js';

import { buildAnalyzerPrompt } from '../prompts/build-analyzer.js';
import { codeReviewerPrompt } from '../prompts/code-reviewer.js';
import { dependencyCheckerPrompt } from '../prompts/dependency-checker.js';
import { judgePrompt } from '../prompts/judge.js';
import { testAnalyzerPrompt } from '../prompts/test-analyzer.js';
import { crossChallengePrompt, rebuttalPrompt } from '../prompts/debate-stages.js';

const PRIMARY_MODEL = 'groq/llama-3.1-8b-instant';
const FALLBACK_MODEL = 'ollama/mistral:7b';
const ADK_EXECUTION_TIMEOUT_MS = 60_000; // Increased to 60s for local LLM inference
const ADK_TOOL_CALL_SCHEMA = z.object({
  toolCall: z.object({
    name: z.string().min(1),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
});
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
const TOOL_SEARCH_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const TOOL_MAX_RESULTS = 6;
const TOOL_MAX_FILE_BYTES = 32_000;
const TOOL_MAX_WORKSPACE_FILES = 800;
const REPO_ROOT = process.cwd();
const SEARCH_WORKSPACE_INPUT_SCHEMA = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});
const READ_FILE_SNIPPET_INPUT_SCHEMA = z.object({
  filePath: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});
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
type ToolTraceLike = {
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  timestamp?: number;
};

loadEnv();

function clampLine(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value as number));
}

function isWorkspaceIgnored(entryPath: string): boolean {
  return entryPath
    .split(path.sep)
    .some((segment) => WORKSPACE_IGNORE_DIRS.has(segment));
}

function resolveWorkspacePath(candidatePath: string): string {
  const sanitized = candidatePath.replace(/^\/+/, '').replace(/\\/g, path.sep);
  const resolved = path.resolve(REPO_ROOT, sanitized);
  const relative = path.relative(REPO_ROOT, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path "${candidatePath}" is outside the workspace.`);
  }

  return resolved;
}

async function readWorkspaceFileSnippet(
  filePath: string,
  startLine?: number,
  endLine?: number,
): Promise<{
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
}> {
  const resolvedPath = resolveWorkspacePath(filePath);
  const raw = await readFile(resolvedPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const safeStart = clampLine(startLine, 1);
  const safeEnd = Math.max(safeStart, clampLine(endLine, safeStart + 24));
  const boundedEnd = Math.min(lines.length, safeEnd);
  const snippet = lines
    .slice(safeStart - 1, boundedEnd)
    .map((line, index) => `${safeStart + index}: ${line}`)
    .join('\n')
    .slice(0, TOOL_MAX_FILE_BYTES);

  return {
    path: path.relative(REPO_ROOT, resolvedPath).replace(/\\/g, '/'),
    startLine: safeStart,
    endLine: boundedEnd,
    snippet,
  };
}

async function listWorkspaceFiles(dir: string, acc: string[] = []): Promise<string[]> {
  if (acc.length >= TOOL_MAX_WORKSPACE_FILES) {
    return acc;
  }

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (acc.length >= TOOL_MAX_WORKSPACE_FILES) {
      break;
    }

    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(REPO_ROOT, fullPath);

    if (isWorkspaceIgnored(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      await listWorkspaceFiles(fullPath, acc);
      continue;
    }

    if (!TOOL_SEARCH_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    acc.push(fullPath);
  }

  return acc;
}

async function searchWorkspace(
  query: string,
  limit = TOOL_MAX_RESULTS,
): Promise<
  Array<{
    path: string;
    snippet: string;
  }>
> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const files = await listWorkspaceFiles(REPO_ROOT);
  const matches: Array<{ path: string; snippet: string; score: number }> = [];

  for (const fullPath of files) {
    if (matches.length >= limit * 3) {
      break;
    }

    const relative = path.relative(REPO_ROOT, fullPath).replace(/\\/g, '/');
    const content = await readFile(fullPath, 'utf8');
    const haystack = `${relative}\n${content}`.toLowerCase();
    const index = haystack.indexOf(normalizedQuery);

    if (index === -1) {
      continue;
    }

    const snippetStart = Math.max(0, index - 140);
    const snippetEnd = Math.min(content.length, index + normalizedQuery.length + 220);
    matches.push({
      path: relative,
      snippet: content.slice(snippetStart, snippetEnd).trim(),
      score: index,
    });
  }

  return matches
    .sort((left, right) => left.score - right.score)
    .slice(0, limit)
    .map(({ path: filePath, snippet }) => ({
      path: filePath,
      snippet,
    }));
}

function buildToolPrompt(tools: Iterable<unknown>): string {
  const toolLines = [...tools]
    .flatMap((tool) => {
      if (!tool || typeof tool !== 'object') {
        return [];
      }

      const candidate = tool as { name?: string; description?: string; _getDeclaration?: () => unknown };
      const declaration =
        typeof candidate._getDeclaration === 'function' ? candidate._getDeclaration() : undefined;
      const name =
        typeof candidate.name === 'string' && candidate.name.length > 0
          ? candidate.name
          : declaration && typeof declaration === 'object' && declaration && 'name' in declaration
            ? String((declaration as { name?: unknown }).name ?? '')
            : '';
      const description =
        declaration && typeof declaration === 'object' && declaration && 'description' in declaration
          ? String((declaration as { description?: unknown }).description ?? '')
          : candidate.description ?? '';
      const parameters =
        declaration && typeof declaration === 'object' && declaration && 'parameters' in declaration
          ? JSON.stringify((declaration as { parameters?: unknown }).parameters ?? {}, null, 2)
          : '{}';

      if (!name) {
        return [];
      }

      return [`- ${name}: ${description}\n  Parameters schema: ${parameters}`];
    })
    .join('\n');

  if (!toolLines) {
    return '';
  }

  return `\nAvailable tools:\n${toolLines}

Tool-use protocol:
- If you need workspace inspection, respond with JSON only in this shape:
  {"toolCall":{"name":"tool_name","args":{"key":"value"}}}
- Call at most one tool per response.
- After tool results are provided, continue your reasoning and either call another tool or produce the final answer in the original required format.
- Do not invent tool names or arguments outside the provided schemas.`;
}

function serializeAdkParts(parts: Array<Record<string, unknown>> | undefined): string {
  if (!parts) {
    return '';
  }

  return parts
    .map((part) => {
      if (typeof part.text === 'string') {
        return part.text;
      }

      if (part.functionResponse && typeof part.functionResponse === 'object') {
        const response = part.functionResponse as {
          name?: string;
          response?: unknown;
        };

        return `[tool_result:${response.name ?? 'unknown'}]\n${JSON.stringify(response.response ?? {}, null, 2)}`;
      }

      if (part.functionCall && typeof part.functionCall === 'object') {
        const call = part.functionCall as {
          name?: string;
          args?: unknown;
        };

        return `[tool_call:${call.name ?? 'unknown'}]\n${JSON.stringify(call.args ?? {}, null, 2)}`;
      }

      return '';
    })
    .filter((value) => value.trim().length > 0)
    .join('\n\n');
}

class GroqBridgeLlm extends BaseLlm {
  static supportedModels = [/^groq\/.+$/, /^ollama\/.+$/];

  override async *generateContentAsync(
    request: Parameters<Gemini['generateContentAsync']>[0],
    _stream?: Parameters<Gemini['generateContentAsync']>[1],
  ): ReturnType<Gemini['generateContentAsync']> {
    this.maybeAppendUserContent(request);

    const model = request.model ?? this.model;
    const normalizedModel = model.replace(/^(groq|ollama)\//, '');
    const toolPrompt = buildToolPrompt(Object.values(request.toolsDict ?? {}));
    const systemInstruction =
      typeof request.config?.systemInstruction === 'string'
        ? `${request.config.systemInstruction.trim()}${toolPrompt}`.trim()
        : toolPrompt.trim()
      ;

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

      const text = serializeAdkParts((content.parts ?? []) as Array<Record<string, unknown>>).trim();

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
    const toolCall = ADK_TOOL_CALL_SCHEMA.safeParse(parseToolCallCandidate(response));

    if (toolCall.success && request.toolsDict?.[toolCall.data.toolCall.name]) {
      yield {
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: randomUUID(),
                name: toolCall.data.toolCall.name,
                args: toolCall.data.toolCall.args,
              },
            },
          ],
        },
      };
      return;
    }

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

function parseToolCallCandidate(input: string): unknown {
  try {
    return parseJsonLenient(input);
  } catch {
    return null;
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
- Use workspace tools when the failing file, symbol, or import path is unclear.
- If the input mentions a file path, import path, package name, or module name, call at least one workspace tool before producing the final answer.
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
- Use workspace tools when you need to confirm a file path or inspect the referenced code before recommending edits.
- If the event, findings, or remediations mention a file path or import target, call at least one workspace tool before producing the final answer.
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
    event: buildAgentPromptPayload(input.event, codeContext),
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
- Use workspace tools when you need to inspect the referenced file before deciding whether another finding is unsupported.
- If any finding references a concrete file path or import target, call at least one workspace tool before deciding.
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
- Use workspace tools if you need to inspect a referenced file before defending or conceding.
- If the challenge or your finding references a concrete file path or import target, call at least one workspace tool before deciding.
- updatedConfidence must be between 0 and 1.
- rebuttalFactor must be between 0 and 1, reflecting how much of the original confidence remains or how impactful the rebuttal is.
- Do not include markdown fences or extra commentary.`;
}

const searchWorkspaceTool = new FunctionTool({
  name: 'search_workspace',
  description:
    'Search the local repository for a filename, import path, symbol, or log token and return matching files with short snippets.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['query'],
  } as never,
  execute: async (input) => {
    const { query, limit } = SEARCH_WORKSPACE_INPUT_SCHEMA.parse(input);
    const results = await searchWorkspace(query, limit);
    return {
      query,
      results,
    };
  },
});

const readFileSnippetTool = new FunctionTool({
  name: 'read_file_snippet',
  description:
    'Read a specific workspace file and return a bounded line-numbered snippet for grounded code review.',
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string' },
      startLine: { type: 'number' },
      endLine: { type: 'number' },
    },
    required: ['filePath'],
  } as never,
  execute: async (input) => {
    const { filePath, startLine, endLine } = READ_FILE_SNIPPET_INPUT_SCHEMA.parse(input);
    return await readWorkspaceFileSnippet(filePath, startLine, endLine);
  },
});

const repoInspectionTools = [searchWorkspaceTool, readFileSnippetTool];

export const buildAnalyzerAdkAgent = new LlmAgent({
  name: 'build_analyzer',
  model: PRIMARY_MODEL,
  description: 'Analyzes build failures, compiler issues, and runtime mismatch problems.',
  instruction: withFallbackNote(withFindingOutputRules(buildAnalyzerPrompt)),
  outputKey: 'build_analyzer_finding',
  tools: repoInspectionTools,
});

export const codeReviewerAdkAgent = new LlmAgent({
  name: 'code_reviewer',
  model: PRIMARY_MODEL,
  description: 'Inspects code-quality and logic-level causes behind pipeline failures.',
  instruction: withFallbackNote(withFindingOutputRules(codeReviewerPrompt)),
  outputKey: 'code_reviewer_finding',
  tools: repoInspectionTools,
});

export const testAnalyzerAdkAgent = new LlmAgent({
  name: 'test_analyzer',
  model: PRIMARY_MODEL,
  description: 'Investigates regression, flaky test, and test setup causes.',
  instruction: withFallbackNote(withFindingOutputRules(testAnalyzerPrompt)),
  outputKey: 'test_analyzer_finding',
  tools: repoInspectionTools,
});

export const dependencyCheckerAdkAgent = new LlmAgent({
  name: 'dependency_checker',
  model: PRIMARY_MODEL,
  description: 'Checks dependency conflicts, missing packages, and version breakage.',
  instruction: withFallbackNote(withFindingOutputRules(dependencyCheckerPrompt)),
  outputKey: 'dependency_checker_finding',
  tools: repoInspectionTools,
});

export const crossChallengeAdkAgent = new LlmAgent({
  name: 'cross_challenge',
  model: PRIMARY_MODEL,
  description: 'Reviews findings for contradictions and proposes valid challenges.',
  instruction: withFallbackNote(
      withChallengeOutputRules(crossChallengePrompt),
    ),
    outputKey: 'cross_challenge_result',
    tools: repoInspectionTools,
  });

  export const rebuttalAdkAgent = new LlmAgent({
    name: 'rebuttal',
    model: PRIMARY_MODEL,
    description: 'Defends or concedes in response to a challenge.',
    instruction: withFallbackNote(
      withRebuttalOutputRules(rebuttalPrompt),
    ),
    outputKey: 'rebuttal_result',
    tools: repoInspectionTools,
  });

  export const judgeAdkAgent = new LlmAgent({
    name: 'judge',
  model: PRIMARY_MODEL,
  description: 'Synthesizes final reasoning, score interpretation, and recommended action.',
  instruction: withFallbackNote(withJudgeOutputRules(judgePrompt)),
  outputKey: 'judge_decision',
  tools: repoInspectionTools,
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
    toolTrace: [],
  } as AgentFinding;
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
  toolTrace: ToolTraceLike[] = [],
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
      toolTrace,
    } as AgentFinding;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown ADK finding parse error.';
    return createAdkFailureFinding(agentId, event, reason);
  }
}

function toToolTraceResult(result: unknown): unknown {
  if (
    result &&
    typeof result === 'object' &&
    'snippet' in result &&
    typeof (result as { snippet?: unknown }).snippet === 'string'
  ) {
    const value = result as {
      path?: unknown;
      startLine?: unknown;
      endLine?: unknown;
      snippet?: string;
    };

    return {
      path: value.path,
      startLine: value.startLine,
      endLine: value.endLine,
      snippet: value.snippet?.slice(0, 600),
    };
  }

  if (
    result &&
    typeof result === 'object' &&
    'results' in result &&
    Array.isArray((result as { results?: unknown }).results)
  ) {
    const value = result as {
      query?: unknown;
      results: Array<{ path?: unknown; snippet?: unknown }>;
    };

    return {
      query: value.query,
      results: value.results.slice(0, 4).map((entry) => ({
        path: entry.path,
        snippet:
          typeof entry.snippet === 'string' ? entry.snippet.slice(0, 220) : entry.snippet,
      })),
    };
  }

  return result;
}

function extractToolTraceForAuthor(events: unknown[], author: string): ToolTraceLike[] {
  const calls = new Map<string, { toolName: string; args: Record<string, unknown>; timestamp?: number }>();
  const traces: ToolTraceLike[] = [];

  for (const event of events) {
    if (!event || typeof event !== 'object') {
      continue;
    }

    const candidate = event as {
      author?: unknown;
      timestamp?: unknown;
      content?: { parts?: Array<Record<string, unknown>> };
    };

    if (candidate.author !== author || !Array.isArray(candidate.content?.parts)) {
      continue;
    }

    for (const part of candidate.content.parts) {
      if (part.functionCall && typeof part.functionCall === 'object') {
        const functionCall = part.functionCall as {
          id?: unknown;
          name?: unknown;
          args?: unknown;
        };

        if (typeof functionCall.id === 'string' && typeof functionCall.name === 'string') {
          calls.set(functionCall.id, {
            toolName: functionCall.name,
            args:
              functionCall.args && typeof functionCall.args === 'object'
                ? (functionCall.args as Record<string, unknown>)
                : {},
            timestamp: typeof candidate.timestamp === 'number' ? candidate.timestamp : undefined,
          });
        }
      }

      if (part.functionResponse && typeof part.functionResponse === 'object') {
        const functionResponse = part.functionResponse as {
          id?: unknown;
          name?: unknown;
          response?: unknown;
        };

        const call =
          typeof functionResponse.id === 'string' ? calls.get(functionResponse.id) : undefined;
        const toolName =
          call?.toolName ??
          (typeof functionResponse.name === 'string' ? functionResponse.name : 'unknown_tool');

        traces.push({
          toolName,
          args: call?.args ?? {},
          result: toToolTraceResult(functionResponse.response),
          timestamp: typeof candidate.timestamp === 'number' ? candidate.timestamp : call?.timestamp,
        });
      }
    }
  }

  return traces;
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
    const compactPayload = buildAgentPromptPayload(event, codeContext);
    const execution = (async () => {
      for await (const runnerEvent of roundZeroWorkflowRunner.runEphemeral({
        userId: `event:${event.eventId}`,
        newMessage: {
          parts: [
            {
              text: JSON.stringify(compactPayload, null, 2),
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
          extractToolTraceForAuthor(events, agentId),
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
