import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-mint text-ink hover:bg-[#84f7b1] shadow-[0_10px_30px_rgba(109,242,163,0.18)]',
  secondary: 'border border-line bg-black/20 text-mist hover:bg-white/5 hover:text-white',
  destructive: 'border border-rose-400/25 bg-rose-400/10 text-rose-100 hover:bg-rose-400/16',
  ghost: 'text-mist hover:bg-white/5 hover:text-white',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-11 rounded-2xl px-5 py-3 text-sm',
  sm: 'h-9 rounded-xl px-3 text-sm',
  lg: 'h-12 rounded-2xl px-6 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/45 focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
        'disabled:pointer-events-none disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
