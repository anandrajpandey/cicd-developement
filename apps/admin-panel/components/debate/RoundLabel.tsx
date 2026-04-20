'use client'
import { AnimatePresence, motion } from 'framer-motion'

const ROUND_META = [
  { label: 'Round 0', sub: 'Parallel Analysis', color: 'text-blue-500',  dot: 'bg-blue-400' },
  { label: 'Round 1', sub: 'Cross-Challenge',   color: 'text-amber-500', dot: 'bg-amber-400' },
  { label: 'Round 2', sub: 'Rebuttals',         color: 'text-purple-500',dot: 'bg-purple-400' },
  { label: 'Round 3', sub: 'Judge Synthesis',   color: 'text-yellow-500',dot: 'bg-yellow-400' },
]

export function RoundLabel({ round }: { round: number }) {
  const meta = ROUND_META[round] || ROUND_META[0];
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={round}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="flex items-center space-x-2 text-lg font-bold"
      >
        <span className={`w-3 h-3 rounded-full ${meta.dot}`} />
        <span className={meta.color}>{meta.label}</span>
        <span className="text-zinc-500">— {meta.sub}</span>
      </motion.div>
    </AnimatePresence>
  )
}
