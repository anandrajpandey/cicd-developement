import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';

import { auth, signIn } from '../../auth';

async function loginAction(formData: FormData) {
  'use server';

  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect('/login');
    }

    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const { error } = await searchParams;

  if (session?.user) {
    redirect('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel grid w-full max-w-5xl overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative hidden min-h-[620px] border-r border-line bg-black/20 p-10 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(109,242,163,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(51,196,108,0.16),transparent_28%)]" />
          <div className="relative space-y-6">
            <p className="eyebrow">Secure Access</p>
            <h1 className="max-w-md text-4xl font-semibold tracking-tight text-white">
              Professional debate operations, gated behind a single admin login.
            </h1>
            <p className="max-w-md text-sm leading-7 text-mist/70">
              Review live agent reasoning, audit risk decisions, and only approve remediation when
              the debate outcome warrants a human gate.
            </p>
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <p className="eyebrow">Admin Login</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Enter the control plane</h2>
          <p className="mt-3 text-sm text-mist/68">
            Use the seeded admin credentials from your environment.
          </p>

          <form action={loginAction} className="mt-8 space-y-5">
            <label className="block space-y-2 text-sm text-mist/80">
              <span>Email</span>
              <input
                name="email"
                type="email"
                defaultValue="admin@local.dev"
                className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50"
              />
            </label>

            <label className="block space-y-2 text-sm text-mist/80">
              <span>Password</span>
              <input
                name="password"
                type="password"
                className="w-full rounded-2xl border bg-black/20 px-4 py-3 text-white outline-none focus:border-mint/50"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                Invalid credentials. Check your `.env` admin settings and try again.
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-2xl bg-mint px-5 py-3 text-sm font-semibold text-ink"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
