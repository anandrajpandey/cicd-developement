import { Badge } from './ui/badge';

export function RiskBadge({ tier }: { tier: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const variant = tier === 'LOW' ? 'low' : tier === 'MEDIUM' ? 'medium' : 'high';

  return <Badge variant={variant}>{tier}</Badge>;
}
