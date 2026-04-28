# Agentic CI/CD Debate MVP

Agentic CI/CD Debate MVP is a pnpm monorepo that turns a failing pipeline event into a structured multi-agent review. Instead of surfacing only a static failure summary, it runs the event through specialist analyzers, lets them challenge each other, and produces a final risk-scored decision with a recommended action.

## About The Project

The system is built around one idea: CI/CD failures should be investigated like a debate, not just logged like an alert. A failure enters the orchestrator, is persisted to Postgres, analyzed by specialist agents, published live over Socket.IO, and displayed in the admin panel as a step-by-step workflow.

The monorepo is split into:

- `apps/orchestrator`: Fastify API, debate worker, Redis pub/sub realtime bus, GitHub diff intake, approvals API
- `apps/admin-panel`: Next.js 15 operator dashboard, event submission flow, live debate console, workflow monitoring, approvals queue
- `packages/db`: Drizzle schema, client, migrations, and seed script for Postgres
- `packages/llm-client`: shared LLM client with Groq primary inference and Ollama fallback
- `packages/shared-types`: shared Zod schemas and TypeScript types for pipeline events, findings, challenges, rebuttals, decisions, and approvals

## How It Works

1. An operator submits a pipeline failure event through the admin panel or directly to `POST /api/events` on the orchestrator.
2. The orchestrator stores the event in Postgres and starts a debate worker for that event.
3. Round 0 runs four specialist analyzers in parallel: build, code, test, and dependency analysis.
4. Round 1 lets the agents challenge weak or contradictory findings.
5. Round 2 lets the challenged agent defend, concede, or partially compromise.
6. Round 3 synthesizes the final decision, risk tier, and recommended action.
7. Every stage is persisted and streamed live to the admin panel through Redis-backed Socket.IO events.

The main UI reads that state back from the orchestrator and renders it in a dashboard, a live workflow monitor, a debate viewer, and an approvals queue for medium and high risk outcomes.

## What Makes It Different

This project differs from a conventional CI/CD dashboard in a few important ways:

- It uses multiple domain-specific agents instead of a single classifier or log summary.
- It models failure analysis as a debate with findings, challenges, rebuttals, and a judge step.
- It keeps the workflow live and inspectable, so you can watch each round complete in real time.
- It is hybrid by design: the orchestrator prefers ADK-based execution, but falls back to native agent logic when needed.
- It records execution provenance per round, so the UI can show whether a round was handled by ADK or the native path.
- It adds a decision and approval layer, which makes the output closer to an operator workflow than a passive observability tool.

Most existing CI/CD systems stop at failure detection, test reporting, or a single suggested fix. This system goes further by creating a structured review loop that explains why one hypothesis wins over another and what action should happen next.

## Runtime Flow

- `apps/admin-panel/lib/orchestrator.ts` is the client-side gateway for listing workflows, decisions, approvals, and submitting new events or approvals.
- `apps/orchestrator/src/routes/events.ts` accepts pipeline events, stores them, and starts the debate worker.
- `apps/orchestrator/src/debate/run-debate.ts` coordinates the round-based analysis, challenge, rebuttal, scoring, and persistence.
- `apps/orchestrator/src/realtime.ts` and `apps/orchestrator/src/redis.ts` fan out debate updates to connected clients.
- `apps/orchestrator/src/routes/decisions.ts` serves the dashboard data, approval queue, mitigations, and event/decision detail view.
- `apps/orchestrator/src/adk/workflow.ts` defines the ADK-backed execution path and its native fallback behavior.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Start Postgres, Redis, and Ollama.
3. Run `corepack pnpm install`.
4. Run database migrations with `corepack pnpm db:migrate`.
5. Start the orchestrator with `corepack pnpm --filter @agentic-cicd/orchestrator dev`.
6. Start the admin panel with `corepack pnpm --filter @agentic-cicd/admin-panel dev`.

## Notes

- The orchestrator expects `DATABASE_URL`, `REDIS_URL`, and LLM-related environment variables such as `GROQ_API_KEY` and `OLLAMA_BASE_URL` when you want the full debate pipeline to run.
- The admin panel expects `NEXT_PUBLIC_ORCHESTRATOR_URL` to point at the orchestrator API.
- The dashboard also relies on the live Socket.IO stream, so both services should be running together for the realtime experience.
