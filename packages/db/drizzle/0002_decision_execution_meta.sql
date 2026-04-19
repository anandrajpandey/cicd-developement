ALTER TABLE "decisions"
ADD COLUMN IF NOT EXISTS "execution_meta" jsonb NOT NULL DEFAULT
'{"round0":"NATIVE","round1":"NATIVE","round2":"NATIVE","round3":"NATIVE"}'::jsonb;
