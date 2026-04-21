CREATE TABLE IF NOT EXISTS "agent_findings" (
	"finding_id" uuid PRIMARY KEY NOT NULL,
	"agent_id" varchar(64) NOT NULL,
	"event_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"proposed_remediation" text NOT NULL,
	"timed_out" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"approval_id" uuid PRIMARY KEY NOT NULL,
	"decision_id" uuid NOT NULL,
	"approver" varchar(255) NOT NULL,
	"action" varchar(16) NOT NULL,
	"justification" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mitigation_diff" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "challenges" (
	"challenge_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"challenger_agent_id" varchar(64) NOT NULL,
	"target_agent_id" varchar(64) NOT NULL,
	"counter_hypothesis" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"confidence" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decisions" (
	"decision_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"composite_score" double precision NOT NULL,
	"risk_tier" varchar(16) NOT NULL,
	"reasoning" text NOT NULL,
	"recommended_action" text NOT NULL,
	"execution_meta" jsonb DEFAULT '{"round0":"NATIVE","round1":"NATIVE","round2":"NATIVE","round3":"NATIVE"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rebuttals" (
	"rebuttal_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"responding_agent_id" varchar(64) NOT NULL,
	"position" varchar(16) NOT NULL,
	"updated_confidence" double precision NOT NULL,
	"rebuttal_factor" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(32) DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_event_id_pipeline_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pipeline_events"("event_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decision_id_decisions_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("decision_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "challenges" ADD CONSTRAINT "challenges_event_id_pipeline_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pipeline_events"("event_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "decisions" ADD CONSTRAINT "decisions_event_id_pipeline_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pipeline_events"("event_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rebuttals" ADD CONSTRAINT "rebuttals_event_id_pipeline_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."pipeline_events"("event_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rebuttals" ADD CONSTRAINT "rebuttals_challenge_id_challenges_challenge_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("challenge_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_findings_event_agent_idx" ON "agent_findings" USING btree ("event_id","agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_decision_idx" ON "approvals" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "challenges_event_target_idx" ON "challenges" USING btree ("event_id","target_agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decisions_event_idx" ON "decisions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_events_repository_idx" ON "pipeline_events" USING btree ("repository");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pipeline_events_failure_type_idx" ON "pipeline_events" USING btree ("failure_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rebuttals_challenge_idx" ON "rebuttals" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" USING btree ("email");