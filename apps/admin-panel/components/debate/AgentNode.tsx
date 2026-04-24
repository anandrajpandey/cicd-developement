'use client'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { motion, AnimatePresence } from 'framer-motion'
import { type AgentId, type AgentStatus } from './debate.types'

export type AgentNodeData = {
  agentId: AgentId
  label: string
  status: AgentStatus
  confidence?: number
  confidenceDelta?: number
  rebuttalPosition?: 'DEFEND' | 'CONCEDE' | 'COMPROMISE'
}

const STATUS_RING: Record<AgentStatus, string> = {
  idle:          'border-white/5 shadow-none',
  analyzing:     'border-[#3b82f6]/30 shadow-none',
  finding_ready: 'border-[#10b981]/30 shadow-none',
  challenging:   'border-[#f59e0b]/30 shadow-none',
  defending:     'border-[#6366f1]/30 shadow-none',
  conceding:     'border-[#ef4444]/30 shadow-none',
  judging:       'border-[#a855f7]/30 shadow-none',
}

const STATUS_BG: Record<AgentStatus, string> = {
  idle:          'bg-[#0f1115]/50',
  analyzing:     'bg-[#0f172a]/50',
  finding_ready: 'bg-[#0f1f18]/50',
  challenging:   'bg-[#1f160e]/50',
  defending:     'bg-[#121029]/50',
  conceding:     'bg-[#211111]/50',
  judging:       'bg-[#1b1126]/50',
}

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle:          'text-white/50',
  analyzing:     'text-blue-400',
  finding_ready: 'text-green-400',
  challenging:   'text-amber-400',
  defending:     'text-indigo-400',
  conceding:     'text-red-400',
  judging:       'text-fuchsia-400',
}

const ICONS: Record<AgentId, string> = {
  build_analyzer: '🔧',
  code_reviewer: '🔎',
  test_analyzer: '🧪',
  dependency_checker: '📦',
  judge: '⚖️',
  root_event: '⚠️',
}

export function AgentNode({ data }: NodeProps) {
  const { agentId, label, status, confidence, confidenceDelta, rebuttalPosition } = data as AgentNodeData
  const Icon = ICONS[agentId]
  const pulse = status === 'analyzing' || status === 'judging' || status === 'challenging'

  return (
    <div className={`relative px-4 py-3 rounded-lg border transition-all duration-500 backdrop-blur-md min-w-[200px] ${STATUS_RING[status]} ${STATUS_BG[status]} group hover:border-white/20`}>
      <Handle type="target" position={Position.Left} className="w-1 h-3 rounded-full bg-white/20 border-none -ml-1 transition-opacity opacity-0 group-hover:opacity-100" />
      <Handle type="source" position={Position.Right} className="w-1 h-3 rounded-full bg-white/20 border-none -mr-1 transition-opacity opacity-0 group-hover:opacity-100" />

      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-8 h-8 rounded-md bg-white/5 border border-white/5 text-sm ${pulse ? 'animate-pulse' : ''} shadow-inner`}>
            {Icon}
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-[11px] uppercase tracking-widest text-mist/40 font-semibold">{label}</span>
          <span className={`text-[12px] font-mono tracking-tight capitalize mt-0.5 ${STATUS_TEXT[status]}`}>
            {status.replace('_', ' ')}
            {pulse && <motion.span initial={{opacity:0}} animate={{opacity:1}} transition={{repeat: Infinity, duration: 0.8, ease: 'easeInOut', repeatType: 'reverse'}}>...</motion.span>}
          </span>
        </div>
      </div>
      
      <AnimatePresence>
        {confidence !== undefined && (
          <motion.div key="confidence" initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0, height: 0}} className="mt-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] uppercase tracking-widest text-mist/60">Confidence</span>
              <div className="flex items-center gap-2">
                {typeof confidenceDelta === 'number' && confidenceDelta < 0 ? (
                  <span className="text-[9px] font-mono text-red-300">
                    {Math.round(confidenceDelta * 100)}%
                  </span>
                ) : null}
                <span className="text-[9px] font-mono text-white/90">{Math.round(confidence * 100)}%</span>
              </div>
            </div>
            <div className="h-1 bg-black/50 rounded-full overflow-hidden w-full backdrop-blur-sm border border-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${confidence * 100}%` }}
                className="h-full bg-gradient-to-r from-blue-500/50 to-blue-400 rounded-full"
              />
            </div>
          </motion.div>
        )}
        
        {rebuttalPosition && (
          <motion.div key="rebuttal" initial={{opacity:0, y:-5}} animate={{opacity:1, y:0}} className="absolute -top-3 -right-2">
            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-full shadow-lg ${rebuttalPosition === 'DEFEND' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : rebuttalPosition === 'COMPROMISE' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
              {rebuttalPosition}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

