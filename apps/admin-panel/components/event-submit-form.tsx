'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useState } from 'react';

import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';
import { trpcClient } from '../lib/trpc/client';

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

        const diff = await trpcClient.githubDiff.query({
          repo: match[1],
          pr: Number(match[2]),
        });
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

      const response = await trpcClient.submitEvent.mutate(payload);

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
    <Card>
      <CardContent className="space-y-6 p-6">
        <form action={onSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Label>
              <span>Repository</span>
              <Input name="repository" defaultValue="anandrajpandey/cicd-developement" />
            </Label>
            <Label>
              <span>Commit SHA</span>
              <Input name="commitSha" defaultValue="HEAD" />
            </Label>
            <Label>
              <span>Branch</span>
              <Input name="branch" defaultValue="main" />
            </Label>
            <Label>
              <span>Failure Type</span>
              <Select name="failureType" defaultValue="build_failure">
                <option value="build_failure">build_failure</option>
                <option value="test_failure">test_failure</option>
                <option value="lint_error">lint_error</option>
              </Select>
            </Label>
          </div>

          <Label className="block">
            <span>Optional GitHub PR URL</span>
            <Input
              value={prUrl}
              onChange={(event) => setPrUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/pull/123"
            />
          </Label>

          <Label className="block">
            <span>Error Log</span>
            <Textarea
              rows={12}
              value={errorLog}
              onChange={(event) => setErrorLog(event.target.value)}
              className="font-mono"
            />
          </Label>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-mist/60">
              Submitting triggers the debate loop and redirects to the live event view.
            </p>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Launching debate...' : 'Submit Event'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
