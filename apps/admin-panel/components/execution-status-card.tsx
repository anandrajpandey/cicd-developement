import type { ExecutionMeta } from '../lib/orchestrator';

function getFallbackRounds(meta: ExecutionMeta) {
  return Object.entries(meta)
    .filter(([, source]) => source === 'NATIVE')
    .map(([round]) => round.toUpperCase());
}

function describeExecution(meta: ExecutionMeta) {
  const fallbackRounds = getFallbackRounds(meta);

  if (fallbackRounds.length === 0) {
    return {
      title: 'Full AI Path',
      body: 'All execution steps completed via the primary agentic network.',
      toneClass: 'border-mint/20 bg-mint/8 text-mint',
    };
  }

  return {
    title: 'Standard Safety Mode',
    body: `${fallbackRounds.join(', ')} used the standard deterministic path to assure resolution.`,
    toneClass: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  };
}

export function ExecutionStatusCard({ meta }: { meta: ExecutionMeta }) {
  const status = describeExecution(meta);

  return (
    <div className={`rounded-3xl border p-4 ${status.toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/70">{status.title}</p>
      <p className="mt-2 text-sm leading-6 text-white/90">{status.body}</p>
    </div>
  );
}
