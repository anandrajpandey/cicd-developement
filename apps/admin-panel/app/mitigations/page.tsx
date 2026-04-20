import Link from 'next/link';

import { getTrpcCaller } from '../../lib/trpc/server';

export default async function AutoMitigationsPage() {
  const caller = await getTrpcCaller();
  const items = await caller.autoMitigations();

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <p className="eyebrow">Mitigations</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Auto-Mitigations History</h1>
        <p className="mt-3 text-sm leading-7 text-mist/70">
          A log of all LOW risk events automatically mitigated by the Agentic CI/CD framework.
        </p>
      </section>

      <section className="space-y-4">
        {items.length === 0 ? (
          <div className="panel p-8 text-center text-sm text-mist/60">
            No automatic mitigations recorded yet.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.approvalId} className="panel p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    {item.repository} <span className="text-mist/70 font-normal">on branch</span> {item.branch}
                  </h2>
                  <p className="text-sm font-medium text-emerald-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  href={`/events/${item.eventId}`}
                  className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/20"
                >
                  View Debate
                </Link>
              </div>

              <div className="mb-6 rounded-3xl border border-line-soft bg-black/20 p-4">
                <p className="eyebrow !text-red-400 mb-2">Original Error ({item.failureType})</p>
                <div className="max-h-32 overflow-y-auto font-mono text-[11px] text-red-200/80 scrollbar-thin">
                  {item.errorLog || 'No error log recorded.'}
                </div>
              </div>

              <div className="mb-6 rounded-3xl border border-line-soft bg-[rgba(10,35,30,0.4)] p-4">
                <p className="eyebrow !text-emerald-400 mb-2">Mitigation Action</p>
                <p className="text-sm text-emerald-100/90 leading-relaxed">
                  {item.recommendedAction}
                </p>
              </div>

              {item.mitigationDiff && item.mitigationDiff.trim().length > 0 && (
                <div className="rounded-3xl border border-line-soft overflow-hidden">
                  <div className="border-b border-line-soft bg-black/40 px-4 py-2 flex items-center justify-between">
                    <p className="eyebrow !text-mist/70 mb-0">Applied Code Diff</p>
                  </div>
                  <div className="bg-[#050C14] max-h-96 overflow-y-auto p-4 font-mono text-xs scrollbar-thin">
                    {item.mitigationDiff.split('\n').map((line, idx) => {
                      let colorClass = 'text-mist/80';
                      let bgClass = '';
                      
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        colorClass = 'text-emerald-400';
                        bgClass = 'bg-emerald-400/10 block w-full px-1';
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        colorClass = 'text-red-400';
                        bgClass = 'bg-red-400/10 block w-full px-1';
                      } else if (line.startsWith('@')) {
                        colorClass = 'text-blue-400 opacity-80';
                      }

                      return (
                        <div key={idx} className={`${colorClass} ${bgClass} whitespace-pre`}>
                          {line || ' '}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}