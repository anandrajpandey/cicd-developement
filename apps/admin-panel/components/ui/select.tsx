import type { SelectHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-11 w-full rounded-2xl border bg-black/20 px-4 py-3 text-sm text-white outline-none transition',
        'focus:border-mint/50 focus:ring-2 focus:ring-mint/20',
        className,
      )}
      {...props}
    />
  );
}
