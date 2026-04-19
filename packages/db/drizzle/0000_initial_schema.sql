CREATE TABLE IF NOT EXISTS "pipeline_events" (
  "event_id" uuid PRIMARY KEY NOT NULL,
  "repository" varchar(255) NOT NULL,
  "commit_sha" varchar(255) NOT NULL,
  "branch" varchar(255) NOT NULL,
  "failure_type" varchar(100) NOT NULL,
  "error_log" text NOT NULL,
  "timestamp" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_findings" (
  "finding_id" uuid PRIMARY KEY NOT NULL,
  "agent_id" varchar(64) NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "pipeline_events"("event_id") ON DELETE cascade,
  "hypothesis" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "confidence" double precision NOT NULL,
  "proposed_remediation" text NOT NULL,
  "timed_out" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "challenges" (
  "challenge_id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "pipeline_events"("event_id") ON DELETE cascade,
  "challenger_agent_id" varchar(64) NOT NULL,
  "target_agent_id" varchar(64) NOT NULL,
  "counter_hypothesis" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "confidence" double precision NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rebuttals" (
  "rebuttal_id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "pipeline_events"("event_id") ON DELETE cascade,
  "challenge_id" uuid NOT NULL REFERENCES "challenges"("challenge_id") ON DELETE cascade,
  "responding_agent_id" varchar(64) NOT NULL,
  "position" varchar(16) NOT NULL,
  "updated_confidence" double precision NOT NULL,
  "rebuttal_factor" double precision NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "decisions" (
  "decision_id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "pipeline_events"("event_id") ON DELETE cascade,
  "composite_score" double precision NOT NULL,
  "risk_tier" varchar(16) NOT NULL,
  "reasoning" text NOT NULL,
  "recommended_action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "approvals" (
  "approval_id" uuid PRIMARY KEY NOT NULL,
  "decision_id" uuid NOT NULL REFERENCES "decisions"("decision_id") ON DELETE cascade,
  "approver" varchar(255) NOT NULL,
  "action" varchar(16) NOT NULL,
  "justification" text NOT NULL,
  "timestamp" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pipeline_events_repository_idx" ON "pipeline_events" ("repository");
CREATE INDEX IF NOT EXISTS "pipeline_events_failure_type_idx" ON "pipeline_events" ("failure_type");
CREATE INDEX IF NOT EXISTS "agent_findings_event_agent_idx" ON "agent_findings" ("event_id", "agent_id");
CREATE INDEX IF NOT EXISTS "challenges_event_target_idx" ON "challenges" ("event_id", "target_agent_id");
CREATE INDEX IF NOT EXISTS "rebuttals_challenge_idx" ON "rebuttals" ("challenge_id");
CREATE INDEX IF NOT EXISTS "decisions_event_idx" ON "decisions" ("event_id");
CREATE INDEX IF NOT EXISTS "approvals_decision_idx" ON "approvals" ("decision_id");
