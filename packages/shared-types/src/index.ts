import { z } from 'zod';

export const agentIdSchema = z.enum([
  'build_analyzer',
  'code_reviewer',
  'test_analyzer',
  'dependency_checker',
]);

export const rebuttalPositionSchema = z.enum(['DEFEND', 'CONCEDE']);

export const riskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const approvalActionSchema = z.enum(['APPROVE', 'REJECT']);
export const roundExecutionSourceSchema = z.enum(['ADK', 'NATIVE']);

export const executionMetaSchema = z.object({
  round0: roundExecutionSourceSchema,
  round1: roundExecutionSourceSchema,
  round2: roundExecutionSourceSchema,
  round3: roundExecutionSourceSchema,
});

export const pipelineEventSchema = z.object({
  eventId: z.string().uuid(),
  repository: z.string().min(1),
  commitSha: z.string().min(1),
  branch: z.string().min(1),
  failureType: z.string().min(1),
  errorLog: z.string(),
  timestamp: z.coerce.date(),
});

export const agentFindingSchema = z.object({
  findingId: z.string().min(1),
  agentId: agentIdSchema,
  eventId: z.string().uuid(),
  hypothesis: z.string().min(1),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  proposedRemediation: z.string().min(1),
});

export const challengeSchema = z.object({
  challengeId: z.string().min(1),
  challengerAgentId: agentIdSchema,
  targetAgentId: agentIdSchema,
  counterHypothesis: z.string().min(1),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const rebuttalSchema = z.object({
  rebuttalId: z.string().min(1),
  respondingAgentId: agentIdSchema,
  challengeId: z.string().min(1),
  position: rebuttalPositionSchema,
  updatedConfidence: z.number().min(0).max(1),
  rebuttalFactor: z.union([z.literal(0.85), z.literal(0.7)]),
});

export const decisionSchema = z.object({
  decisionId: z.string().min(1),
  eventId: z.string().uuid(),
  compositeScore: z.number(),
  riskTier: riskTierSchema,
  reasoning: z.string().min(1),
  recommendedAction: z.string().min(1),
  executionMeta: executionMetaSchema.optional(),
});

export const approvalSchema = z.object({
  approver: z.string().min(1),
  action: approvalActionSchema,
  justification: z.string().min(1),
  timestamp: z.coerce.date(),
});

export type AgentId = z.infer<typeof agentIdSchema>;
export type RebuttalPosition = z.infer<typeof rebuttalPositionSchema>;
export type RiskTier = z.infer<typeof riskTierSchema>;
export type ApprovalAction = z.infer<typeof approvalActionSchema>;
export type RoundExecutionSource = z.infer<typeof roundExecutionSourceSchema>;
export type PipelineEvent = z.infer<typeof pipelineEventSchema>;
export type AgentFinding = z.infer<typeof agentFindingSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Rebuttal = z.infer<typeof rebuttalSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type ExecutionMeta = z.infer<typeof executionMetaSchema>;
