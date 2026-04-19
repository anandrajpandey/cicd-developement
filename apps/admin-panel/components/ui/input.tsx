import type { InputHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-2xl border bg-black/20 px-4 py-3 text-sm text-white outline-none transition',
        'placeholder:text-mist/35 focus:border-mint/50 focus:ring-2 focus:ring-mint/20',
        className,
      )}
      {...props}
    />
  );
}
