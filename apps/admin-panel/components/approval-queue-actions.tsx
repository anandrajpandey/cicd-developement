'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { trpcClient } from '../lib/trpc/client';
import { Button } from './ui/button';

export function ApprovalQueueActions({
  decisionId,
  approvedLabel,
}: {
  decisionId: string;
  approvedLabel: string;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handle(action: 'APPROVE' | 'REJECT') {
    setPendingAction(action);
    setStatus(null);

    try {
      await trpcClient.submitApproval.mutate({
        decisionId,
        approver: 'admin@local.dev',
        action,
        justification:
          action === 'APPROVE'
            ? `Approved from the approvals queue for ${approvedLabel}`
            : `Rejected from the approvals queue for ${approvedLabel}`,
        timestamp: new Date().toISOString(),
      });
      setStatus(`${action} recorded.`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Approval request failed.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="glow-button border-0 text-black hover:text-emerald-950"
          onClick={() => void handle('APPROVE')}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'APPROVE' ? 'Approving...' : 'Approve'}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="border border-rose-500/20 bg-rose-900/30 text-rose-300 hover:bg-rose-900/50"
          onClick={() => void handle('REJECT')}
          disabled={pendingAction !== null}
        >
          {pendingAction === 'REJECT' ? 'Rejecting...' : 'Reject'}
        </Button>
      </div>
      {status ? <p className="text-xs text-mist/70">{status}</p> : null}
    </div>
  );
}