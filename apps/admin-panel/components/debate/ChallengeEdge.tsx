'use client';

import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { motion } from 'framer-motion';

export interface ChallengeEdgeData extends Record<string, unknown> {
  label?: string;
  resolved?: boolean;
  position?: 'DEFEND' | 'CONCEDE';
}

export function ChallengeEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as ChallengeEdgeData;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor = !edgeData.resolved
    ? '#f59e0b'
    : edgeData.position === 'DEFEND'
      ? '#3b82f6'
      : '#ef4444';

  return (
    <>
      <motion.path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeDasharray="8 8"
        initial={{ pathLength: 0, opacity: 0.2 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      />
      <motion.path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeDasharray="10 14"
        animate={{ strokeDashoffset: [24, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
      />
      <BaseEdge path={edgePath} style={{ opacity: 0 }} />

      {edgeData.label ? (
        <EdgeLabelRenderer>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none absolute rounded-full border border-white/10 bg-[rgba(7,16,28,0.92)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-mist/80"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edgeData.label}
          </motion.div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
