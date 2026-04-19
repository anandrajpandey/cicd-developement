'use client';

import { useState } from 'react';

import { trpcClient } from '../lib/trpc/client';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';

export function ApprovalPanel({ decisionId }: { decisionId: string }) {
  const [justification, setJustification] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function handle(action: 'APPROVE' | 'REJECT') {
    try {
      await trpcClient.submitApproval.mutate({
        decisionId,
        approver: 'admin@local.dev',
        action,
        justification: justification || `${action.toLowerCase()}d from admin panel`,
        timestamp: new Date().toISOString(),
      });
      setStatus(`${action} recorded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Approval request failed.');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-5">
        <p className="eyebrow">Human Gate</p>
        <CardTitle className="mt-2">Approval Required</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          rows={5}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="Explain why this remediation should be approved or rejected."
        />
        <div className="mt-5 flex gap-3">
          <Button type="button" onClick={() => void handle('APPROVE')}>
            Approve
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handle('REJECT')}>
            Reject
          </Button>
        </div>
        {status ? <p className="mt-4 text-sm text-mist/70">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
