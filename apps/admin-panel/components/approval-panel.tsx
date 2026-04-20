'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

import { trpcClient } from '../lib/trpc/client';

export function ApprovalPanel({ decisionId, isAutoMitigated }: { decisionId: string; isAutoMitigated?: boolean }) {
  const [justification, setJustification] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  if (isAutoMitigated) {
    return (
      <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6 backdrop-blur-xl">
        <p className="eyebrow !text-emerald-300">Action Automatically Mitigated</p>
        <p className="mt-2 text-sm leading-6 text-emerald-100/90">
          This low risk failure was automatically patched, committed, and pushed back to the branch by the Agentic CICD service. No human approval is required.
        </p>
      </div>
    );
  }

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
    <div className="panel p-6">
      <div className="pb-5">
        <p className="eyebrow">Human Gate</p>
        <h3 className="mt-2 font-semibold text-lg">Approval Required</h3>
      </div>
      <div className="pt-2">
        <Textarea
          className="bg-[rgba(5,13,23,0.62)] border-line-soft focus:border-emerald-400/50"
          rows={5}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="Explain why this remediation should be approved or rejected."
        />
        <div className="mt-5 flex gap-3">
          <Button type="button" className="glow-button border-0 text-black hover:text-emerald-950" onClick={() => void handle('APPROVE')}>
            Approve
          </Button>
          <Button type="button" variant="destructive" className="bg-rose-900/30 text-rose-300 border border-rose-500/20 hover:bg-rose-900/50" onClick={() => void handle('REJECT')}>
            Reject
          </Button>
        </div>
        {status ? <p className="mt-4 text-sm text-mist/70">{status}</p> : null}
      </div>
    </div>
  );
}
