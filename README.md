# Agentic CI/CD Debate MVP

Multi-agent CI/CD debate system MVP built as a pnpm monorepo.

## Included

- `apps/orchestrator`: Fastify debate engine, GitHub diff intake, approvals API, Socket.io updates
- `apps/admin-panel`: Next.js 15 dashboard, event submission flow, live debate viewer, approvals queue
- `packages/shared-types`: shared Zod schemas
- `packages/llm-client`: Groq primary client with Ollama fallback
- `packages/db`: Drizzle schema, client, migration, and seed script

## Local setup

1. Copy `.env.example` to `.env`
2. Start Postgres, Redis, and Ollama
3. Run `corepack pnpm install`
4. Run `corepack pnpm --filter @agentic-cicd/orchestrator dev`
5. Run `corepack pnpm --filter @agentic-cicd/admin-panel dev`
