'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';

import type { AgentId, AgentStatus } from './debate.types';

export interface AgentNodeData extends Record<string, unknown> {
  agentId: AgentId;
  label: string;
  status: AgentStatus;
  confidence?: number;
  rebuttalPosition?: 'DEFEND' | 'CONCEDE';
}

const STATUS_RING: Record<AgentStatus, string> = {
  idle: 'border-[rgba(120,147,172,0.28)]',
  analyzing: 'border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.22)]',
  finding_ready: 'border-emerald-400 shadow-[0_0_34px_rgba(16,185,129,0.22)]',
  challenging: 'border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.22)]',
  defending: 'border-blue-500 shadow-[0_0_32px_rgba(59,130,246,0.22)]',
  conceding: 'border-rose-400 shadow-[0_0_32px_rgba(244,63,94,0.22)]',
  judging: 'border-yellow-400 shadow-[0_0_38px_rgba(250,204,21,0.22)]',
};

const STATUS_BG: Record<AgentStatus, string> = {
  idle: 'bg-[rgba(8,18,31,0.92)]',
  analyzing: 'bg-[rgba(7,28,49,0.96)]',
  finding_ready: 'bg-[rgba(7,31,25,0.96)]',
  challenging: 'bg-[rgba(36,25,8,0.96)]',
  defending: 'bg-[rgba(9,22,48,0.96)]',
  conceding: 'bg-[rgba(43,13,24,0.96)]',
  judging: 'bg-[rgba(48,39,8,0.96)]',
};

const STATUS_DOT: Record<AgentStatus, string> = {
  idle: 'bg-zinc-500',
  analyzing: 'bg-sky-400',
  finding_ready: 'bg-emerald-400',
  challenging: 'bg-amber-400',
  defending: 'bg-blue-500',
  conceding: 'bg-rose-400',
  judging: 'bg-yellow-400',
};

const AGENT_ICON: Record<AgentId, string> = {
  build_analyzer: 'BA',
  code_reviewer: 'CR',
  test_analyzer: 'TA',
  dependency_checker: 'DC',
  judge: 'JG',
};

export function AgentNode({ data }: NodeProps) {
  const { agentId, label, status, confidence, rebuttalPosition } = data as unknown as AgentNodeData;
  const isPulsing = status === 'analyzing' || status === 'judging';

  return (
    <motion.div
      initial={{ opacity: 0.7, scale: 0.96 }}
      animate={{
        opacity: 1,
        scale: status === 'judging' ? 1.08 : status === 'challenging' ? 1.03 : 1,
      }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className={`min-w-[188px] rounded-[26px] border px-4 py-4 ${STATUS_RING[status]} ${STATUS_BG[status]}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-0 !bg-mint" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-0 !bg-mint" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            animate={isPulsing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={isPulsing ? { duration: 1.3, repeat: Infinity } : { duration: 0.2 }}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] text-xs font-semibold tracking-[0.18em] text-white"
          >
            {AGENT_ICON[agentId]}
          </motion.div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-mist/55">{agentId.replaceAll('_', ' ')}</div>
            <div className="mt-1 text-sm font-semibold text-white">{label}</div>
          </div>
        </div>

        <motion.span
          animate={isPulsing ? { scale: [1, 1.2, 1] } : { scale: 1 }}
          transition={isPulsing ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
          className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`}
        />
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-mist/55">
        <span>{status.replace('_', ' ')}</span>
        {confidence !== undefined ? <span>{Math.round(confidence * 100)}%</span> : null}
      </div>

      <div className="mt-3 h-2 rounded-full bg-[rgba(255,255,255,0.06)]">
        <motion.div
          className="h-2 rounded-full bg-gradient-to-r from-[#36d399] via-[#5dffb2] to-[#8affc6]"
          initial={{ width: confidence !== undefined ? `${Math.max(6, Math.round(confidence * 100))}%` : '6%' }}
          animate={{ width: confidence !== undefined ? `${Math.max(6, Math.round(confidence * 100))}%` : '6%' }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        />
      </div>

      {rebuttalPosition ? (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`mt-4 inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ${
            rebuttalPosition === 'DEFEND'
              ? 'border-blue-400/30 bg-blue-400/12 text-blue-200'
              : 'border-rose-400/30 bg-rose-400/12 text-rose-200'
          }`}
        >
          {rebuttalPosition}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
