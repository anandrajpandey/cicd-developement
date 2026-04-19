'use client';

import { useState } from 'react';

import { submitApproval } from '../lib/orchestrator';

export function ApprovalPanel({ decisionId }: { decisionId: string }) {
  const [justification, setJustification] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function handle(action: 'APPROVE' | 'REJECT') {
    try {
      await submitApproval({
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
      <p className="eyebrow">Human Gate</p>
      <h3 className="mt-2 text-xl font-semibold text-white">Approval Required</h3>
      <textarea
        rows={5}
        value={justification}
        onChange={(event) => setJustification(event.target.value)}
        placeholder="Explain why this remediation should be approved or rejected."
        className="mt-5 w-full rounded-3xl border bg-black/25 px-4 py-4 text-sm text-mist outline-none focus:border-mint/50"
      />
      <div className="mt-5 flex gap-3">
        <button type="button" onClick={() => void handle('APPROVE')} className="rounded-2xl bg-mint px-4 py-3 text-sm font-semibold text-ink">
          Approve
        </button>
        <button type="button" onClick={() => void handle('REJECT')} className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100">
          Reject
        </button>
      </div>
      {status ? <p className="mt-4 text-sm text-mist/70">{status}</p> : null}
    </div>
  );
}
