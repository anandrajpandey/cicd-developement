import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="panel p-8">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Event not found</h1>
      <p className="mt-3 text-sm text-mist/70">
        The requested debate record is not available yet or the decision has not been created.
      </p>
      <Link href="/" className="mt-6 inline-flex rounded-2xl bg-mint px-5 py-3 text-sm font-semibold text-ink">
        Return to dashboard
      </Link>
    </div>
  );
}
