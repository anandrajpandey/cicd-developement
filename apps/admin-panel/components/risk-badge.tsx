import { cn } from '../lib/utils';

export function RiskBadge({ tier }: { tier: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  return (
    <span
      className={cn(
        'badge',
        tier === 'LOW' && 'badge-low',
        tier === 'MEDIUM' && 'badge-medium',
        tier === 'HIGH' && 'badge-high',
      )}
    >
      {tier}
    </span>
  );
}
