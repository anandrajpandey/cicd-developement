'use client';

import { AnimatePresence, motion } from 'framer-motion';

const ROUND_META = [
  { label: 'Round 0', sub: 'Parallel Analysis', color: 'text-sky-400', dot: 'bg-sky-400' },
  { label: 'Round 1', sub: 'Cross-Challenge', color: 'text-amber-400', dot: 'bg-amber-400' },
  { label: 'Round 2', sub: 'Rebuttals', color: 'text-violet-400', dot: 'bg-violet-400' },
  { label: 'Round 3', sub: 'Judge Synthesis', color: 'text-yellow-400', dot: 'bg-yellow-400' },
] as const;

export function RoundLabel({ round }: { round: number }) {
  const meta = ROUND_META[Math.max(0, Math.min(round, ROUND_META.length - 1))];

  return (
    <div className="overflow-hidden border-b border-white/5 pb-5">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${meta.label}-${meta.sub}`}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.28 }}
          className="flex items-center gap-3"
        >
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} />
          <div className="text-sm font-semibold uppercase tracking-[0.28em] text-white">
            <span className={meta.color}>{meta.label}</span>
            <span className="mx-2 text-mist/40">—</span>
            <span className="text-mist/70">{meta.sub}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
