import type { TextareaHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-[120px] w-full rounded-3xl border bg-black/25 px-4 py-4 text-sm text-mist outline-none transition',
        'placeholder:text-mist/35 focus:border-mint/50 focus:ring-2 focus:ring-mint/20',
        className,
      )}
      {...props}
    />
  );
}
