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
      className="ghost-button rounded-2xl border px-3 py-2 text-xs font-medium"
    >
      {pending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
