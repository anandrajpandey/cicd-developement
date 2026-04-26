import type { ExecutionMeta, RoundExecutionSource } from '../lib/orchestrator';
import { cn } from '../lib/utils';

const roundLabels: Array<{ key: keyof ExecutionMeta; label: string }> = [
  { key: 'round0', label: 'R0' },
  { key: 'round1', label: 'R1' },
  { key: 'round2', label: 'R2' },
  { key: 'round3', label: 'R3' },
];

function sourceClass(source: RoundExecutionSource) {
  return source === 'ADK'
    ? 'border-white/16 bg-white text-black'
    : 'border-white/12 bg-black text-white';
}

function labelClass(source: RoundExecutionSource) {
  return source === 'ADK' ? 'text-black/65' : 'text-white/65';
}

export function getAdkCoverage(meta: ExecutionMeta) {
  const adkRounds = Object.values(meta).filter((source) => source === 'ADK').length;

  return {
    adkRounds,
    totalRounds: roundLabels.length,
    ratio: adkRounds / roundLabels.length,
  };
}

export function ExecutionPathStrip({
  meta,
  compact = false,
}: {
  meta: ExecutionMeta;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', compact && 'gap-1.5')}>
      {roundLabels.map(({ key, label }) => (
        <span
          key={key}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]',
            compact ? 'px-2 py-0.5 text-[10px]' : '',
            sourceClass(meta[key]),
          )}
        >
          <span className={labelClass(meta[key])}>{label}</span>
          <span>{meta[key]}</span>
        </span>
      ))}
    </div>
  );
}
