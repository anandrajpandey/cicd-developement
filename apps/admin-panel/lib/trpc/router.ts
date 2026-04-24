import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import {
  cancelEvent,
  fetchGitHubDiff,
  getDecision,
  listApprovalQueue,
  listAutoMitigations,
  listDecisions,
  listWorkflows,
  submitApproval,
  submitEvent,
} from '../orchestrator';
import type { TrpcContext } from './context';

const t = initTRPC.context<TrpcContext>().create();

const submitEventSchema = z.object({
  eventId: z.string().uuid(),
  repository: z.string().min(1),
  commitSha: z.string().min(1),
  branch: z.string().min(1),
  failureType: z.string().min(1),
  errorLog: z.string(),
  timestamp: z.string().datetime(),
});

const submitApprovalSchema = z.object({
  decisionId: z.string().uuid(),
  approver: z.string().email(),
  action: z.enum(['APPROVE', 'REJECT']),
  justification: z.string().min(1),
  timestamp: z.string().datetime(),
});

const githubDiffSchema = z.object({
  repo: z.string().min(3),
  pr: z.number().int().positive(),
});

export const appRouter = t.router({
  health: t.procedure.query(() => ({
    status: 'ok',
    service: 'admin-panel-trpc',
    timestamp: new Date().toISOString(),
  })),
  dashboardSummary: t.procedure.query(async () => {
    const [decisions, approvals, workflows] = await Promise.all([
      listDecisions(),
      listApprovalQueue(),
      listWorkflows(),
    ]);

    const totalEvents = decisions.length;
    const low = decisions.filter((item) => item.riskTier === 'LOW').length;
    const medium = decisions.filter((item) => item.riskTier === 'MEDIUM').length;
    const high = decisions.filter((item) => item.riskTier === 'HIGH').length;
    const activeWorkflows = workflows.filter(
      (item) => item.status !== 'JUDGED' && item.status !== 'CANCELLED',
    ).length;
    const contestedDebates = workflows.filter((item) => (item.counts?.challenges ?? 0) > 0).length;
    const avgCompositeScore =
      totalEvents === 0
        ? 0
        : decisions.reduce((sum, item) => sum + item.compositeScore, 0) / totalEvents;

    return {
      totalEvents,
      pendingApprovals: approvals.length,
      avgCompositeScore,
      low,
      medium,
      high,
      activeWorkflows,
      contestedDebates,
    };
  }),
  decisionByEventId: t.procedure.input(z.string().uuid()).query(async ({ input }) => {
    return getDecision(input);
  }),
  approvals: t.procedure.query(async () => {
    return listApprovalQueue();
  }),
  autoMitigations: t.procedure.query(async () => {
    return listAutoMitigations();
  }),
  recentDecisions: t.procedure.query(async () => {
    return listDecisions();
  }),
  workflows: t.procedure.query(async () => {
    return listWorkflows();
  }),
  submitEvent: t.procedure.input(submitEventSchema).mutation(async ({ input }) => {
    return submitEvent(input);
  }),
  submitApproval: t.procedure.input(submitApprovalSchema).mutation(async ({ input }) => {
    return submitApproval(input);
  }),
  cancelEvent: t.procedure.input(z.string().uuid()).mutation(async ({ input }) => {
    return cancelEvent(input);
  }),
  githubDiff: t.procedure.input(githubDiffSchema).query(async ({ input }) => {
    return fetchGitHubDiff(input.repo, input.pr);
  }),
});

export type AppRouter = typeof appRouter;
