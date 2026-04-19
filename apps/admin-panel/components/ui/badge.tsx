import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'low' | 'medium' | 'high';

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'border-line bg-white/5 text-mist',
  low: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  medium: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  high: 'border-rose-400/25 bg-rose-400/10 text-rose-100',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
        badgeVariantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
