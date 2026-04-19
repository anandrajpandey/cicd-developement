import { Badge } from './ui/badge';

export function getSlaState(createdAt: string) {
  const ageHours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 36e5);

  if (ageHours >= 4) {
    return { label: 'Overdue', variant: 'high' as const, ageHours };
  }

  if (ageHours >= 1) {
    return { label: 'Attention', variant: 'medium' as const, ageHours };
  }

  return { label: 'Fresh', variant: 'low' as const, ageHours };
}

export function SlaBadge({ createdAt }: { createdAt: string }) {
  const state = getSlaState(createdAt);

  return <Badge variant={state.variant}>{state.label}</Badge>;
}
