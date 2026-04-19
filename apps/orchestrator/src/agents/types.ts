import type { AgentFinding, AgentId, Challenge, PipelineEvent, Rebuttal } from '@agentic-cicd/shared-types';

export interface DebateAgent {
  agentId: AgentId;
  analyze(event: PipelineEvent): Promise<AgentFinding>;
  challenge(myFinding: AgentFinding, otherFindings: AgentFinding[]): Promise<Challenge | null>;
  rebuttal(myFinding: AgentFinding, challenge: Challenge): Promise<Rebuttal>;
}
