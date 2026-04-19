import { z } from 'zod';

const githubDiffQuerySchema = z.object({
  repo: z
    .string()
    .min(3)
    .regex(/^[^/]+\/[^/]+$/, 'Repository must be in owner/repo format.'),
  pr: z.coerce.number().int().positive(),
});

export type GitHubDiffQuery = z.infer<typeof githubDiffQuerySchema>;

export function parseGitHubDiffQuery(query: unknown): GitHubDiffQuery {
  return githubDiffQuerySchema.parse(query);
}

export async function fetchPullRequestDiff(repo: string, pr: number): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const [owner, repoName] = repo.split('/');

  const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${pr}`, {
    headers: {
      Accept: 'application/vnd.github.diff',
      'User-Agent': 'agentic-cicd-mvp',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub diff request failed with status ${response.status}.`);
  }

  return response.text();
}
