'use client';

import { useTransition } from 'react';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          void signOut({ callbackUrl: '/login' });
        });
      }}
      className="rounded-2xl border border-line px-3 py-2 text-xs font-medium text-mist/72 transition hover:border-mint/35 hover:text-white"
    >
      {pending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
