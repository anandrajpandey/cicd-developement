import type { LabelHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('space-y-2 text-sm text-mist/80', className)} {...props} />;
}
