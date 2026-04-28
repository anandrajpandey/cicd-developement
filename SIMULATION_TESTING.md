# Simulation Test Suite

This document describes the end-to-end simulation testing infrastructure for the agentic CI/CD debate pipeline.

## Overview

The simulation suite provides three risk tiers (LOW, MEDIUM, HIGH) to test the complete debate pipeline:

- **LOW Risk (EASY)**: Linter warnings that are safe and easy to resolve
- **MEDIUM Risk**: Unit test failures requiring schema/data fixes
- **HIGH Risk (HARD)**: Critical database constraint violations affecting multiple services

## Running Simulations

### Individual Test Scripts

Run specific simulation tiers from the CLI:

```bash
# EASY: Linter warnings
cd apps/orchestrator
node dist/src/scripts/test-low-risk.js

# MEDIUM: Unit test failure
node dist/src/scripts/test-medium-risk.js

# HIGH: Database constraint violation
node dist/src/scripts/test-high-risk.js
```

#### Force Deterministic Fallback Mode

To test deterministic fallback without calling AI (Groq):

```bash
# Run any script with --deterministic flag
node dist/src/scripts/test-low-risk.js --deterministic
node dist/src/scripts/test-medium-risk.js --deterministic
node dist/src/scripts/test-high-risk.js --deterministic
```

### End-to-End Test Runner

Run all three simulations sequentially with automatic rate limiting:

```bash
cd apps/orchestrator
node dist/src/scripts/test-e2e.js

# Or with deterministic fallback
node dist/src/scripts/test-e2e.js --deterministic
```

**Features:**
- Runs EASY → MEDIUM → HIGH in sequence
- 3-second delay between tests (rate limit buffer for Groq)
- Detailed execution report showing AI vs fallback for each round
- Summary table with pass/fail status and duration

**Example Output:**
```
╔════════════════════════════════════════════════════════════════════╗
║                 END-TO-END SIMULATION TEST SUITE                   ║
║ Mode: AI                                                           ║
╚════════════════════════════════════════════════════════════════════╝

[======================================================================]
[EASY RISK - AI MODE]
Repository: web-team/dashboard-app
Branch: chore/update-deps
Event ID: 12345678-...
[======================================================================]

[DEBATE] Starting pipeline for event 12345678-...
[DEBATE] Failure Type: simulation_easy
[ROUND 0] Initial Analysis: ADK (4 findings)
[ROUND 1] Cross Challenges: ADK (2 challenges)
[ROUND 2] Rebuttals: ADK (2 rebuttals)
[ROUND 3] Judge Synthesis: ADK
[DECISION] Risk Tier: LOW
[DECISION] Composite Score: 22.5

[EXECUTION REPORT]
ROUND 0 (Initial Analysis): ✓ AI
ROUND 1 (Challenges): ✓ AI
ROUND 2 (Rebuttals): ✓ AI
ROUND 3 (Judge): ✓ AI

✓ EASY simulation completed in 4.32s

Waiting 3 seconds before MEDIUM test (rate limit buffer)...

[... MEDIUM and HIGH tests follow ...]

╔════════════════════════════════════════════════════════════════════╗
║                    TEST EXECUTION SUMMARY                          ║
╠════════════════════════════════════════════════════════════════════╣
║ ✓ EASY      PASS  AI           web-team/dashboard-app      4.32s  ║
║ ✓ MEDIUM    PASS  AI           backend-team/api-service    5.18s  ║
║ ✓ HIGH      PASS  AI           data-platform/warehouse     6.45s  ║
╠════════════════════════════════════════════════════════════════════╣
║ Results: 3/3 passed (100%)                                        ║
║ Total Duration: 15.95s                                             ║
║ Execution Mode: AI                                                 ║
╚════════════════════════════════════════════════════════════════════╝
```

## Frontend UI

### Trigger Simulations from Admin Panel

Navigate to `http://localhost:3000/testcases` to see the test scenario cards:

1. **Low Risk: Linter Warnings** - Click "Trigger Debate" to submit
2. **Medium Risk: Test Failure (Migration Mismatch)** - Click "Trigger Debate" to submit
3. **High Risk: Database Schema Constraint Violation** - Click "Trigger Debate" to submit

Each card shows:
- Risk tier and color coding (lime/yellow/red)
- Scenario description
- Simulated error payload preview
- "Trigger Debate" button

After clicking, you'll be redirected to `/events/[id]` to watch the live debate stream with:
- Real-time animated chat bubbles showing each round
- Agent findings with confidence scores and evidence
- Challenges and rebuttals flowing through the debate
- Final decision with reasoning and recommended action

## Understanding AI vs Fallback Decisions

### Execution Report Format

Each round displays the execution source:

```
[ROUND 0] Initial Analysis: ADK (4 findings)        # ✓ AI used
[ROUND 1] Cross Challenges: NATIVE (2 challenges)   # ✗ Fallback used
```

**ADK = AI Execution**: Agent used Groq LLM via @google/adk framework

**NATIVE = Fallback**: When ADK is unavailable, switched to deterministic heuristics

### Why Fallback Happens

1. **ADK timeout**: Orchestration took too long (default 5000ms)
2. **LLM Error**: Groq API failed (rate limit, network, quota)
3. **SIMULATION_FORCE_FALLBACK=true**: Explicitly forced for testing
4. **JSON Parse Error**: Response format invalid (rare after sanitization)

### Per-Agent Rate Limiting

Groq API has free tier rate limits (~30 req/min). The test suite:
- Uses per-agent API keys from `.env`: `BUILD_ANALYZER_GROQ_API_KEY`, etc.
- Spaces tests 3+ seconds apart
- Falls back gracefully if rate limited (429 error)

See `.env` configuration:
```
BUILD_ANALYZER_GROQ_API_KEY=gsk_...
BUILD_ANALYZER_GROQ_MODEL=llama-3.3-70b-versatile
CODE_REVIEWER_GROQ_API_KEY=gsk_...
TEST_ANALYZER_GROQ_API_KEY=gsk_...
DEBATE_REASONER_GROQ_API_KEY=gsk_...
GROQ_API_KEY=gsk_...        # Global fallback
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_FALLBACK_MODEL=mistral:7b
```

## Test Scenarios Breakdown

### LOW Risk: Linter Warnings (`simulation_easy`)

**Error Scenario:**
```
ESLint Report: Lint warnings detected in the build.
  File: src/components/Header.tsx:14:32
    Warning: Multiple trailing spaces found. (no-trailing-spaces)
  File: src/utils/helpers.ts:42:1
    Warning: Unused variable 'tempVar' declared. (no-unused-vars)
```

**Expected Decision:** `LOW`  
**Recommended Action:** Fix formatting issues before merging  
**Auto-Mitigation:** YES - Auto-fixer can clean up linter violations

---

### MEDIUM Risk: Test Failure with Schema Mismatch (`simulation_medium`)

**Error Scenario:**
```
FAIL  src/__tests__/userService.test.ts
  X should fetch user profile correctly (234ms)
    AssertionError: expected null to equal Object { ... }
    
  Schema mismatch detected: expected 'profile' field but got 'user_profile' in database.
```

**Expected Decision:** `MEDIUM`  
**Recommended Action:** Run migration script and sync schema before merge  
**Auto-Mitigation:** NO - Requires manual intervention

---

### HIGH Risk: Database Constraint Violation (`simulation_hard`)

**Error Scenario:**
```
CRITICAL BUILD FAILURE: Database Migration Failed.

Error in migration 20260427_drop_legacy_tables.sql:
  CONSTRAINT VIOLATION: Cannot drop table 'invoices_v1' - 8 active foreign key constraints depend on it.
  Dependent objects: batch_jobs.reference_invoice_id, reports.invoice_source, webhooks.payload

CRITICAL: This PR drops critical table 'invoices_v1' that 5 microservices depend on.
3 background workers will crash on deployment.
```

**Expected Decision:** `HIGH`  
**Recommended Action:** Revert migration or update all dependent services first  
**Auto-Mitigation:** NO - Requires architectural review

---

## Configuration

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `GROQ_API_KEY` | Global Groq fallback | `gsk_...` |
| `BUILD_ANALYZER_GROQ_API_KEY` | Build analyzer Groq key | `gsk_...` |
| `BUILD_ANALYZER_GROQ_MODEL` | Build analyzer model name | `llama-3.3-70b-versatile` |
| `SIMULATION_FORCE_FALLBACK` | Force deterministic path | `true` or unset |
| `OLLAMA_BASE_URL` | Local Ollama server | `http://localhost:11434` |
| `OLLAMA_FALLBACK_MODEL` | Ollama model name | `mistral:7b` |
| `ADK_BASE_URL` | ADK orchestrator endpoint | `http://127.0.0.1:59999` |

### Database

All simulation events are persisted to the `pipelineEvents` table:

```sql
INSERT INTO pipelineEvents (
  eventId, repository, commitSha, branch, failureType, errorLog, timestamp
) VALUES (...)
```

Results stored in: `agentFindings`, `challenges`, `rebuttals`, `decisions`, `approvals`

## Debugging

### View Live Debate Stream

1. Run test script and note the event ID
2. Navigate to `http://localhost:3000/debate?eventId=<id>`
3. Watch real-time Socket.IO events:
   - `round:0:finding` - Agent findings stream
   - `round:0:complete` - Analysis round done
   - `round:1:challenge` - Challenges appear
   - `round:1:complete` - Challenge round done
   - `round:2:rebuttal` - Rebuttals flow
   - `round:2:complete` - Rebuttal round done
   - `decision:ready` - Final decision ready
   - `debate:ended` - Debate complete

### Check Logs

```bash
# View orchestrator logs
tail -f ~/.agentic-cicd/logs/orchestrator.log

# Or from Node.js console during test
node dist/src/scripts/test-low-risk.js 2>&1 | grep -E '\[DEBATE\]|\[ROUND\]|\[DECISION\]'
```

### Force Groq API to Fallback

```bash
# Disable Groq, force Ollama/deterministic
GROQ_API_KEY="" node dist/src/scripts/test-low-risk.js

# Or force deterministic
node dist/src/scripts/test-low-risk.js --deterministic
```

## Troubleshooting

### "429 Too Many Requests"

**Cause:** Groq rate limit exceeded  
**Solution:**  
- Run with `--deterministic` flag
- Increase delay between tests (modify `delayMs(3000)` in test-e2e.ts)
- Use different Groq API keys per agent

### "ADK execution timed out"

**Cause:** LLM took >5s to respond  
**Solution:**  
- Check Groq API status
- Run with `--deterministic` to bypass ADK
- Increase `ADK_EXECUTION_TIMEOUT_MS` in workflow.ts

### "Query failed: relation 'X' does not exist"

**Cause:** Database schema mismatch  
**Solution:**  
- Run migrations: `pnpm --filter db migrate`
- Ensure PostgreSQL is running
- Check database connection in `.env`

---

## Performance Benchmarks

Typical execution times (AI mode, fresh LLM cache):

| Scenario | Round 0 | Round 1 | Round 2 | Round 3 | Total |
|----------|---------|---------|---------|---------|-------|
| EASY | 0.8s | 1.2s | 1.1s | 0.9s | ~4.0s |
| MEDIUM | 1.2s | 1.5s | 1.3s | 1.0s | ~5.0s |
| HIGH | 1.5s | 1.8s | 1.6s | 1.2s | ~6.1s |

Deterministic mode (fallback):
- All scenarios: 50-100ms (instant heuristics)

---

## Next Steps

1. **Run EASY simulation**: `node dist/src/scripts/test-low-risk.js`
2. **Watch in browser**: Open `http://localhost:3000/debate` 
3. **Run end-to-end**: `node dist/src/scripts/test-e2e.js`
4. **Test fallback path**: `node dist/src/scripts/test-e2e.js --deterministic`
5. **View UI**: Navigate to `http://localhost:3000/testcases` for card-based triggers
