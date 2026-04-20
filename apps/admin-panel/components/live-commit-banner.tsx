'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { io } from 'socket.io-client';

type LiveCommitState = {
  eventId: string;
  repository: string;
  branch: string;
  failureType: string;
} | null;

export function LiveCommitBanner() {
  const [liveCommit, setLiveCommit] = useState<LiveCommitState>(null);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? 'http://127.0.0.1:4000');

    socket.on(
      'debate:started',
      (payload: { eventId: string; repository: string; branch: string; failureType: string }) => {
        setLiveCommit(payload);
      },
    );

    socket.on('decision:ready', (payload: { decision: { eventId?: string } }) => {
      setLiveCommit((current) =>
        payload.decision.eventId && payload.decision.eventId === current?.eventId ? null : current,
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <AnimatePresence>
      {liveCommit ? (
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="mb-6 border-y border-[rgba(93,255,178,0.18)] bg-[linear-gradient(90deg,rgba(7,32,29,0.96),rgba(9,18,31,0.96))] px-5 py-4"
        >
          <Link
            href={`/debate?eventId=${liveCommit.eventId}`}
            className="flex items-center justify-between gap-4"
          >
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-mint/75">
                Live Commit In Progress
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {liveCommit.repository} / {liveCommit.branch}
              </div>
              <div className="mt-1 text-sm text-mist/68">
                Debate started for {liveCommit.failureType}. Open live proceedings.
              </div>
            </div>
            <motion.div
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="text-xs uppercase tracking-[0.24em] text-mint/78"
            >
              Open Debate
            </motion.div>
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
