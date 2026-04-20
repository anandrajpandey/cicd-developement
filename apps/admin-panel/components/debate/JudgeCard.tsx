'use client';

import { motion } from 'framer-motion';

import type { Decision } from './debate.types';

const TIER_STYLE = {
  LOW: {
    ring: 'border-emerald-400/30',
    bg: 'bg-[rgba(8,31,22,0.86)]',
    text: 'text-emerald-300',
  },
  MEDIUM: {
    ring: 'border-amber-400/30',
    bg: 'bg-[rgba(36,24,8,0.86)]',
    text: 'text-amber-300',
  },
  HIGH: {
    ring: 'border-rose-400/30',
    bg: 'bg-[rgba(43,13,24,0.86)]',
    text: 'text-rose-300',
  },
} as const;

export function JudgeCard({ decision }: { decision: Decision }) {
  const style = TIER_STYLE[decision.riskTier];

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.94, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 170, damping: 18 }}
      className={`border-l-2 ${style.ring} ${style.bg} px-5 py-5`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-mist/55">Judge Decision</div>
          <div className="mt-2 text-2xl font-semibold text-white">Risk: {decision.riskTier}</div>
        </div>
        <div className={`text-sm font-semibold uppercase tracking-[0.22em] ${style.text}`}>
          {(decision.compositeScore * 100).toFixed(1)} score
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 w-full bg-[rgba(255,255,255,0.06)]">
          <motion.div
            className="h-2 bg-gradient-to-r from-[#36d399] via-[#5dffb2] to-[#8affc6]"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(6, decision.compositeScore * 100)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </div>
      </div>

      <p className="mt-5 text-sm leading-7 text-mist/82">{decision.reasoning}</p>

      <div className="mt-6 border-t border-white/5 pt-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-mist/55">recommended action</div>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white">
          {decision.recommendedAction}
        </pre>
      </div>
    </motion.section>
  );
}
