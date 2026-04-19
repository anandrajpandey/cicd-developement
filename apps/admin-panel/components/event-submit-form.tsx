'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { fetchGitHubDiff, submitEvent } from '../lib/orchestrator';

const defaultErrorLog = `Build failed during bundling.
Module not found: Can't resolve '@agentic-cicd/shared-types'
Import trace:
./src/app/page.tsx`;

export function EventSubmitForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState('');
  const [errorLog, setErrorLog] = useState(defaultErrorLog);

  async function onSubmit(formData: FormData) {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let finalErrorLog = errorLog;

      if (prUrl.trim()) {
        const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/i);
        if (!match) {
          throw new Error('GitHub PR URL must look like github.com/owner/repo/pull/123');
        }

        const diff = await fetchGitHubDiff(match[1], Number(match[2]));
        finalErrorLog = diff.diff;
      }

      const payload = {
        eventId: crypto.randomUUID(),
        repository: String(formData.get('repository') ?? ''),
        commitSha: String(formData.get('commitSha') ?? ''),
        branch: String(formData.get('branch') ?? ''),
        failureType: String(formData.get('failureType') ?? ''),
        errorLog: finalErrorLog,
        timestamp: new Date().toISOString(),
      };

      const response = await submitEvent(payload);

      startTransition(() => {
        router.push(`/events/${response.eventId}`);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form action={onSubmit} className="panel space-y-6 p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-mist/80">
          <span>Repository</span>
          <input name="repository" defaultValue="anandrajpandey/cicd-developement" className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50" />
        </label>
        <label className="space-y-2 text-sm text-mist/80">
          <span>Commit SHA</span>
          <input name="commitSha" defaultValue="HEAD" className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50" />
        </label>
        <label className="space-y-2 text-sm text-mist/80">
          <span>Branch</span>
          <input name="branch" defaultValue="main" className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50" />
        </label>
        <label className="space-y-2 text-sm text-mist/80">
          <span>Failure Type</span>
          <select name="failureType" defaultValue="build_failure" className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50">
            <option value="build_failure">build_failure</option>
            <option value="test_failure">test_failure</option>
            <option value="lint_error">lint_error</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2 text-sm text-mist/80">
        <span>Optional GitHub PR URL</span>
        <input
          value={prUrl}
          onChange={(event) => setPrUrl(event.target.value)}
          placeholder="https://github.com/owner/repo/pull/123"
          className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50"
        />
      </label>

      <label className="block space-y-2 text-sm text-mist/80">
        <span>Error Log</span>
        <textarea
          rows={12}
          value={errorLog}
          onChange={(event) => setErrorLog(event.target.value)}
          className="w-full rounded-3xl border bg-black/25 px-4 py-4 font-mono text-sm text-mist outline-none focus:border-mint/50"
        />
      </label>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-mist/60">
          Submitting triggers the debate loop and redirects to the live event view.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-2xl bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#84f7b1] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Launching debate...' : 'Submit Event'}
        </button>
      </div>
    </form>
  );
}
