export type AgentId =
  | 'build_analyzer'
  | 'code_reviewer'
  | 'test_analyzer'
  | 'dependency_checker'
  | 'judge'

export type AgentStatus =
  | 'idle'
  | 'analyzing'
  | 'finding_ready'
  | 'challenging'
  | 'defending'
  | 'conceding'
  | 'judging'

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH'

export interface AgentFinding {
  findingId: string
  agentId: AgentId
  hypothesis: string
  evidence: string[]
  confidence: number        // 0.0 - 1.0
  proposedRemediation: string
}

export interface Challenge {
  challengeId: string
  challengerAgentId: AgentId
  targetAgentId: AgentId
  counterHypothesis: string
}

export interface Rebuttal {
  rebuttalId: string
  respondingAgentId: AgentId
  position: 'DEFEND' | 'CONCEDE'
  updatedConfidence: number
  rebuttalFactor: number
}

export interface Decision {
  decisionId: string
  compositeScore: number
  riskTier: RiskTier
  reasoning: string
  recommendedAction: string
}
