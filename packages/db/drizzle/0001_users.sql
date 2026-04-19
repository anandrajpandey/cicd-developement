CREATE TABLE IF NOT EXISTS "users" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "password_hash" text NOT NULL,
  "role" varchar(32) DEFAULT 'admin' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" ("email");
