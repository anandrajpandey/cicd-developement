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
      className="ghost-button w-full justify-center rounded-2xl border px-4 py-3 text-sm font-semibold"
    >
      {pending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
