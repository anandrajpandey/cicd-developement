import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const agentIdValues = [
  'build_analyzer',
  'code_reviewer',
  'test_analyzer',
  'dependency_checker',
] as const;

const rebuttalPositionValues = ['DEFEND', 'CONCEDE'] as const;
const riskTierValues = ['LOW', 'MEDIUM', 'HIGH'] as const;
const approvalActionValues = ['APPROVE', 'REJECT'] as const;

export const pipelineEvents = pgTable(
  'pipeline_events',
  {
    eventId: uuid('event_id').primaryKey(),
    repository: varchar('repository', { length: 255 }).notNull(),
    commitSha: varchar('commit_sha', { length: 255 }).notNull(),
    branch: varchar('branch', { length: 255 }).notNull(),
    failureType: varchar('failure_type', { length: 100 }).notNull(),
    errorLog: text('error_log').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    repositoryIdx: index('pipeline_events_repository_idx').on(table.repository),
    failureTypeIdx: index('pipeline_events_failure_type_idx').on(table.failureType),
  }),
);

export const agentFindings = pgTable(
  'agent_findings',
  {
    findingId: uuid('finding_id').primaryKey(),
    agentId: varchar('agent_id', { length: 64, enum: agentIdValues }).notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => pipelineEvents.eventId, { onDelete: 'cascade' }),
    hypothesis: text('hypothesis').notNull(),
    evidence: jsonb('evidence').$type<string[]>().notNull(),
    confidence: doublePrecision('confidence').notNull(),
    proposedRemediation: text('proposed_remediation').notNull(),
    timedOut: boolean('timed_out').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventAgentIdx: index('agent_findings_event_agent_idx').on(table.eventId, table.agentId),
  }),
);

export const challenges = pgTable(
  'challenges',
  {
    challengeId: uuid('challenge_id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => pipelineEvents.eventId, { onDelete: 'cascade' }),
    challengerAgentId: varchar('challenger_agent_id', {
      length: 64,
      enum: agentIdValues,
    }).notNull(),
    targetAgentId: varchar('target_agent_id', {
      length: 64,
      enum: agentIdValues,
    }).notNull(),
    counterHypothesis: text('counter_hypothesis').notNull(),
    evidence: jsonb('evidence').$type<string[]>().notNull(),
    confidence: doublePrecision('confidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventTargetIdx: index('challenges_event_target_idx').on(table.eventId, table.targetAgentId),
  }),
);

export const rebuttals = pgTable(
  'rebuttals',
  {
    rebuttalId: uuid('rebuttal_id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => pipelineEvents.eventId, { onDelete: 'cascade' }),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.challengeId, { onDelete: 'cascade' }),
    respondingAgentId: varchar('responding_agent_id', {
      length: 64,
      enum: agentIdValues,
    }).notNull(),
    position: varchar('position', { length: 16, enum: rebuttalPositionValues }).notNull(),
    updatedConfidence: doublePrecision('updated_confidence').notNull(),
    rebuttalFactor: doublePrecision('rebuttal_factor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    challengeIdx: index('rebuttals_challenge_idx').on(table.challengeId),
  }),
);

export const decisions = pgTable(
  'decisions',
  {
    decisionId: uuid('decision_id').primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => pipelineEvents.eventId, { onDelete: 'cascade' }),
    compositeScore: doublePrecision('composite_score').notNull(),
    riskTier: varchar('risk_tier', { length: 16, enum: riskTierValues }).notNull(),
    reasoning: text('reasoning').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventIdx: index('decisions_event_idx').on(table.eventId),
  }),
);

export const approvals = pgTable(
  'approvals',
  {
    approvalId: uuid('approval_id').primaryKey(),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => decisions.decisionId, { onDelete: 'cascade' }),
    approver: varchar('approver', { length: 255 }).notNull(),
    action: varchar('action', { length: 16, enum: approvalActionValues }).notNull(),
    justification: text('justification').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    decisionIdx: index('approvals_decision_idx').on(table.decisionId),
  }),
);

export const pipelineEventsRelations = relations(pipelineEvents, ({ many }) => ({
  findings: many(agentFindings),
  challenges: many(challenges),
  rebuttals: many(rebuttals),
  decisions: many(decisions),
}));

export const agentFindingsRelations = relations(agentFindings, ({ one }) => ({
  event: one(pipelineEvents, {
    fields: [agentFindings.eventId],
    references: [pipelineEvents.eventId],
  }),
}));

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  event: one(pipelineEvents, {
    fields: [challenges.eventId],
    references: [pipelineEvents.eventId],
  }),
  rebuttals: many(rebuttals),
}));

export const rebuttalsRelations = relations(rebuttals, ({ one }) => ({
  event: one(pipelineEvents, {
    fields: [rebuttals.eventId],
    references: [pipelineEvents.eventId],
  }),
  challenge: one(challenges, {
    fields: [rebuttals.challengeId],
    references: [challenges.challengeId],
  }),
}));

export const decisionsRelations = relations(decisions, ({ one, many }) => ({
  event: one(pipelineEvents, {
    fields: [decisions.eventId],
    references: [pipelineEvents.eventId],
  }),
  approvals: many(approvals),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  decision: one(decisions, {
    fields: [approvals.decisionId],
    references: [decisions.decisionId],
  }),
}));

export type AgentId = (typeof agentIdValues)[number];
export type RebuttalPosition = (typeof rebuttalPositionValues)[number];
export type RiskTier = (typeof riskTierValues)[number];
export type ApprovalAction = (typeof approvalActionValues)[number];
