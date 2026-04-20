'use client';

import { motion } from 'framer-motion';

import type { AgentFinding } from './debate.types';

const AGENT_COLOR: Record<AgentFinding['agentId'], string> = {
  build_analyzer: 'border-l-sky-400',
  code_reviewer: 'border-l-emerald-400',
  test_analyzer: 'border-l-cyan-400',
  dependency_checker: 'border-l-amber-400',
  judge: 'border-l-yellow-400',
};

export function FindingCard({ finding, index }: { finding: AgentFinding; index: number }) {
  return (
    <motion.article
      id={`finding-${finding.agentId}`}
      initial={{ opacity: 0, x: -26 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 180, damping: 20 }}
      className={`border-l-2 bg-[rgba(7,16,28,0.78)] px-4 py-4 ${AGENT_COLOR[finding.agentId]}`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white">
          {finding.agentId.replace(/_/g, ' ')}
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-mint/75">
          {Math.round(finding.confidence * 100)}% confidence
        </div>
      </div>

      <p className="mt-4 text-base leading-7 text-white">{finding.hypothesis}</p>

      <div className="mt-4 space-y-2 text-sm leading-6 text-mist/75">
        {finding.evidence.map((e, i) => (
          <div key={`${finding.findingId}-${i}`} className="flex gap-3">
            <span className="text-mint/80">—</span>
            <span>{e}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-white/5 pt-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-mist/55">proposed change</div>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white">
          {finding.proposedRemediation}
        </pre>
      </div>
    </motion.article>
  );
}
