import type { FastifyPluginAsync } from 'fastify';

import { db } from '@agentic-cicd/db';

import { getEventRuntimeStatus } from '../debate/runtime-state.js';

export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/workflows', async () => {
    const rows = await db.query.pipelineEvents.findMany({
      with: {
        findings: true,
        challenges: true,
        rebuttals: true,
        decisions: true,
      },
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    return rows.map((row) => {
      let status: 'STARTED' | 'ANALYZING' | 'CHALLENGING' | 'REBUTTING' | 'JUDGED' | 'CANCELLED' =
        'STARTED';
      const hasFindings = row.findings.length > 0;
      const hasChallenges = row.challenges.length > 0;
      const hasRebuttals = row.rebuttals.length > 0;
      const hasDecisions = row.decisions.length > 0;

      if (hasDecisions) {
        status = 'JUDGED';
      } else if (hasRebuttals) {
        status = 'REBUTTING';
      } else if (hasChallenges) {
        status = 'CHALLENGING';
      } else if (hasFindings) {
        status = 'ANALYZING';
      }

      const runtimeStatus = getEventRuntimeStatus(row.eventId);
      if (runtimeStatus === 'CANCELLED') {
        status = 'CANCELLED';
      }

      return {
        eventId: row.eventId,
        repository: row.repository,
        branch: row.branch,
        commitSha: row.commitSha,
        failureType: row.failureType,
        status,
        createdAt: row.createdAt.toISOString(),
        runtimeStatus,
        timestamps: {
          startedAt: row.createdAt.toISOString(),
          round0At: hasFindings ? row.findings[0].createdAt.toISOString() : null,
          round1At: hasChallenges ? row.challenges[0].createdAt.toISOString() : null,
          round2At: hasRebuttals ? row.rebuttals[0].createdAt.toISOString() : null,
          round3At: hasDecisions ? row.decisions[0].createdAt.toISOString() : null,
        },
      };
    });
  });
};
