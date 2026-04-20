'use client'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'
import { type AgentId, type AgentStatus } from './debate.types'

export type AgentNodeData = {
  agentId: AgentId
  label: string
  status: AgentStatus
  confidence?: number
  rebuttalPosition?: 'DEFEND' | 'CONCEDE'
}

const STATUS_RING: Record<AgentStatus, string> = {
  idle:          'border-zinc-300 dark:border-zinc-600',
  analyzing:     'border-blue-400 animate-pulse',
  finding_ready: 'border-green-400',
  challenging:   'border-amber-400',
  defending:     'border-blue-500',
  conceding:     'border-red-400',
  judging:       'border-yellow-400 animate-pulse',
}

const STATUS_BG: Record<AgentStatus, string> = {
  idle:          'bg-zinc-50 dark:bg-zinc-800',
  analyzing:     'bg-blue-50 dark:bg-blue-950',
  finding_ready: 'bg-green-50 dark:bg-green-950',
  challenging:   'bg-amber-50 dark:bg-amber-950',
  defending:     'bg-blue-50 dark:bg-blue-950',
  conceding:     'bg-red-50 dark:bg-red-950',
  judging:       'bg-yellow-50 dark:bg-yellow-950',
}

const STATUS_DOT: Record<AgentStatus, string> = {
  idle:          'bg-zinc-400',
  analyzing:     'bg-blue-400 animate-ping',
  finding_ready: 'bg-green-400',
  challenging:   'bg-amber-400',
  defending:     'bg-blue-500',
  conceding:     'bg-red-400',
  judging:       'bg-yellow-400 animate-ping',
}

const AGENT_ICON: Record<AgentId, string> = {
  build_analyzer:      '🔨',
  code_reviewer:       '🔍',
  test_analyzer:       '🧪',
  dependency_checker:  '📦',
  judge:               '⚖',
}

export function AgentNode({ data }: NodeProps) {
  const agentId = data.agentId as AgentId;
  const label = data.label as string;
  const status = (data.status as AgentStatus) || 'idle';
  const confidence = data.confidence as number | undefined;
  const rebuttalPosition = data.rebuttalPosition as 'DEFEND' | 'CONCEDE' | undefined;

  return (
    <motion.div 
      className={`relative rounded-xl border-2 p-3 w-48 shadow-lg transition-colors ${STATUS_RING[status]} ${STATUS_BG[status]}`}
      animate={status === 'judging' ? { scale: 1.05 } : { scale: 1 }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
      <Handle type="target" position={Position.Left} className="opacity-0" id="left" />
      <Handle type="source" position={Position.Right} className="opacity-0" id="right" />

      {/* Status dot */}
      <span className={`absolute -right-1 -top-1 block h-3 w-3 rounded-full ${STATUS_DOT[status]}`} />

      {/* Icon + label */}
      <div className="flex items-center space-x-2 font-medium">
        <span>{AGENT_ICON[agentId]}</span>
        <span className="text-sm dark:text-zinc-200">{label}</span>
      </div>

      {/* Status pill */}
      <div className="mt-2 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {status.replace('_', ' ')}
      </div>

      {/* Confidence bar */}
      {confidence !== undefined && (
        <div className="mt-3 flex flex-col space-y-1">
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>confidence</span>
            <span>{Math.round(confidence * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <motion.div 
              className="h-full bg-blue-500" 
              initial={{ width: 0 }}
              animate={{ width: `${confidence * 100}%` }}
              transition={{ type: 'spring', bounce: 0.2 }}
            />
          </div>
        </div>
      )}

      {/* Rebuttal badge */}
      {rebuttalPosition && (
        <motion.div 
          initial={{ opacity: 0, y: 5 }} 
          animate={{ opacity: 1, y: 0 }} 
          className={`mt-2 rounded-md px-2 py-1 text-[10px] font-bold ${rebuttalPosition === 'DEFEND' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}
        >
            {rebuttalPosition}
        </motion.div>
      )}
    </motion.div>
  )
}
