const defaultOrchestratorUrls = [
  process.env.ORCHESTRATOR_URL,
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL,
  'http://127.0.0.1:4000',
  'http://localhost:4000',
].filter((value): value is string => Boolean(value));

const orchestratorUrls = [...new Set(defaultOrchestratorUrls)];

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH';
export type RoundExecutionSource = 'ADK' | 'NATIVE';
export interface ExecutionMeta {
  round0: RoundExecutionSource;
  round1: RoundExecutionSource;
  round2: RoundExecutionSource;
  round3: RoundExecutionSource;
}

export interface DecisionListItem {
  decisionId: string;
  eventId: string;
  compositeScore: number;
  riskTier: RiskTier;
  reasoning: string;
  recommendedAction: string;
  executionMeta: ExecutionMeta;
  createdAt: string;
  repository: string;
  failureType: string;
  branch: string;
}

export type WorkflowStatus =
  | 'STARTED'
  | 'ANALYZING'
  | 'CHALLENGING'
  | 'REBUTTING'
  | 'JUDGED'
  | 'CANCELLED';

export type WorkflowAgentId =
  | 'build_analyzer'
  | 'code_reviewer'
  | 'test_analyzer'
  | 'dependency_checker'
  | 'judge';

export interface WorkflowAgentSnapshot {
  agentId: WorkflowAgentId;
  confidence: number | null;
  previousConfidence?: number | null;
  status:
    | 'idle'
    | 'analyzing'
    | 'finding_ready'
    | 'challenging'
    | 'defending'
    | 'conceding'
    | 'judging';
  rebuttalPosition?: 'DEFEND' | 'CONCEDE' | null;
}

export interface WorkflowListItem {
  eventId: string;
  repository: string;
  branch: string;
  commitSha: string;
  failureType: string;
  status: WorkflowStatus;
  createdAt: string;
  runtimeStatus?: 'RUNNING' | 'CANCELLED' | 'COMPLETED' | null;
  timestamps: {
    startedAt: string;
    round0At: string | null;
    round1At: string | null;
    round2At: string | null;
    round3At: string | null;
  };
  counts?: {
    findings: number;
    challenges: number;
    rebuttals: number;
  };
  agents?: WorkflowAgentSnapshot[];
  decision: {
    decisionId: string;
    riskTier: RiskTier;
    compositeScore: number;
  } | null;
}

export interface DecisionDetail {
  decision: {
    decisionId: string;
    eventId: string;
    compositeScore: number;
    riskTier: RiskTier;
    reasoning: string;
    recommendedAction: string;
    executionMeta: ExecutionMeta;
    createdAt: string;
  } | null;
  event: {
    eventId: string;
    repository: string;
    commitSha: string;
    branch: string;
    failureType: string;
    errorLog: string;
    timestamp: string;
  } | null;
  runtimeStatus?: 'RUNNING' | 'CANCELLED' | 'COMPLETED' | null;
  findings: Array<{
    findingId: string;
    agentId: string;
    eventId: string;
    hypothesis: string;
    evidence: string[];
    confidence: number;
    proposedRemediation: string;
    toolTrace?: Array<{
      toolName: string;
      args?: Record<string, unknown>;
      result?: unknown;
      timestamp?: number;
    }>;
    timedOut?: boolean;
  }>;
  challenges: Array<{
    challengeId: string;
    challengerAgentId: string;
    targetAgentId: string;
    counterHypothesis: string;
    evidence: string[];
    confidence: number;
  }>;
  rebuttals: Array<{
    rebuttalId: string;
    respondingAgentId: string;
    challengeId: string;
    position: 'DEFEND' | 'CONCEDE';
    updatedConfidence: number;
    rebuttalFactor: number;
  }>;
  approvals: Array<{
    approvalId: string;
    approver: string;
    action: 'APPROVE' | 'REJECT';
    justification: string;
    timestamp: string;
  }>;
}

export interface EventSubmissionInput {
  eventId: string;
  repository: string;
  commitSha: string;
  branch: string;
  failureType: string;
  errorLog: string;
  timestamp: string;
}

export interface ApprovalSubmissionInput {
  decisionId: string;
  approver: string;
  action: 'APPROVE' | 'REJECT';
  justification: string;
  timestamp: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: unknown;

  for (const baseUrl of orchestratorUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} via ${baseUrl}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to reach orchestrator.');
}

export async function listDecisions(): Promise<DecisionListItem[]> {
  try {
    return await requestJson<DecisionListItem[]>('/api/decisions');
  } catch {
    return [];
  }
}

export async function listWorkflows(): Promise<WorkflowListItem[]> {
  try {
    return await requestJson<WorkflowListItem[]>('/api/workflows');
  } catch {
    return [];
  }
}

export async function getDecision(id: string): Promise<DecisionDetail | null> {
  try {
    return await requestJson<DecisionDetail>(`/api/decisions/${id}`);
  } catch (e) {
    console.error('getDecision fetch failed:', e);
    return null;
  }
}

export async function listApprovalQueue(): Promise<DecisionListItem[]> {
  try {
    return await requestJson<DecisionListItem[]>('/api/approvals');
  } catch {
    return [];
  }
}

export interface AutoMitigationItem {
  approvalId: string;
  eventId: string;
  repository: string;
  branch: string;
  failureType: string;
  errorLog: string;
  justification: string;
  mitigationDiff: string | null;
  recommendedAction: string;
  createdAt: string;
}

export async function listAutoMitigations(): Promise<AutoMitigationItem[]> {
  try {
    return await requestJson<AutoMitigationItem[]>('/api/mitigations');
  } catch {
    return [];
  }
}

export async function submitEvent(payload: EventSubmissionInput) {
  return requestJson<{ eventId: string; status: string }>('/api/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitApproval(payload: ApprovalSubmissionInput) {
  return requestJson<{ status: string; decisionId: string }>('/api/approvals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function cancelEvent(eventId: string) {
  return requestJson<{ eventId: string; status: string }>(`/api/events/${eventId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchGitHubDiff(repo: string, pr: number) {
  return requestJson<{ repo: string; pr: number; diff: string }>(
    `/api/github/diff?repo=${encodeURIComponent(repo)}&pr=${pr}`,
  );
}
