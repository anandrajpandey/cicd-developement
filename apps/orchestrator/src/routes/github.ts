import type { FastifyPluginAsync } from 'fastify';

import { fetchPullRequestDiff, parseGitHubDiffQuery } from '../github.js';

export const githubRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/github/diff',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['repo', 'pr'],
          properties: {
            repo: { type: 'string' },
            pr: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['repo', 'pr', 'diff'],
            properties: {
              repo: { type: 'string' },
              pr: { type: 'number' },
              diff: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const query = parseGitHubDiffQuery(request.query);
      const diff = await fetchPullRequestDiff(query.repo, query.pr);

      return {
        repo: query.repo,
        pr: query.pr,
        diff,
      };
    },
  );
};
