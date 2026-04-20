'use client'
import { motion } from 'framer-motion'
import { type Decision, type RiskTier } from './debate.types'

const TIER_STYLE: Record<RiskTier, { ring: string; bg: string; text: string }> = {
  LOW:    { ring: 'border-green-400',  bg: 'bg-green-50 dark:bg-green-950',  text: 'text-green-500'  },
  MEDIUM: { ring: 'border-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950',  text: 'text-amber-500'  },
  HIGH:   { ring: 'border-red-400',    bg: 'bg-red-50 dark:bg-red-950',      text: 'text-red-500'    },
}

export function JudgeCard({ decision }: { decision: Decision }) {
  const style = TIER_STYLE[decision.riskTier] || TIER_STYLE.LOW;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', delay: 0.3 }}
      className={`mx-auto w-full max-w-2xl rounded-xl border p-6 shadow-xl ${style.ring} ${style.bg}`}
    >
      <div className="mb-4 flex items-center justify-between border-b border-zinc-500/20 pb-4">
        <h2 className="text-xl font-extrabold text-zinc-800 dark:text-zinc-100 flex items-center">
          <span className="mr-2 text-2xl">⚖</span> Judge decision
        </h2>
        <span className={`px-3 py-1 rounded-full font-bold text-sm ${style.text} bg-zinc-900/10 dark:bg-black/20`}>
          {decision.riskTier} RISK
        </span>
      </div>

      {/* Score meter */}
      <div className="mb-6 flex flex-col space-y-2">
        <div className="flex justify-between text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <span>composite score</span>
          <span className="font-bold">{(decision.compositeScore * 100).toFixed(1)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-black/30">
          <motion.div 
            className="h-full bg-yellow-500" 
            initial={{ width: 0 }}
            animate={{ width: `${decision.compositeScore * 100}%` }}
            transition={{ duration: 0.8 }}
          />
        </div>
      </div>

      <div className="mb-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {decision.reasoning}
      </div>

      <div className="rounded-lg bg-white/50 p-4 dark:bg-black/20 border border-zinc-500/10">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Recommended action
        </h3>
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {decision.recommendedAction}
        </p>
      </div>
    </motion.div>
  )
}
