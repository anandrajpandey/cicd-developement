'use client';

import { useEffect, useMemo, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import type { AgentFinding, Challenge, Decision, Rebuttal } from './debate.types';

type ChatEvent =
  | { type: 'finding'; data: AgentFinding }
  | { type: 'challenge'; data: Challenge }
  | { type: 'rebuttal'; data: Rebuttal }
  | { type: 'decision'; data: Decision };

type BubbleContent = {
  align: 'left' | 'right';
  label: string;
  title: string;
  body: string;
  meta: string;
  accent: string;
  labelClass: string;
  bodyClass: string;
  avatarLabel: string;
  panelClass: string;
  evidence: string[];
  note: string;
  noteValue: string;
};

export function DebateChatFeed({
  findings,
  challenges,
  rebuttals,
  decision,
}: {
  findings: AgentFinding[];
  challenges: Challenge[];
  rebuttals: Partial<Record<string, Rebuttal>>;
  decision: Decision | null;
}) {
  const events = useMemo<ChatEvent[]>(
    () => [
      ...findings.map((finding) => ({ type: 'finding' as const, data: finding })),
      ...challenges.map((challenge) => ({ type: 'challenge' as const, data: challenge })),
      ...Object.values(rebuttals)
        .filter(Boolean)
        .map((rebuttal) => ({ type: 'rebuttal' as const, data: rebuttal! })),
      ...(decision ? [{ type: 'decision' as const, data: decision }] : []),
    ],
    [challenges, decision, findings, rebuttals],
  );

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false} mode="popLayout">
        {events.map((event, index) => (
          <ChatBubble key={`${event.type}-${index}`} event={event} index={index} />
        ))}
      </AnimatePresence>
      {events.length === 0 && (
        <div className="rounded-[28px] border border-white/5 bg-white/5 px-4 py-5 text-center text-xs text-mist/55">
          Waiting for agent comms...
        </div>
      )}
    </div>
  );
}

function ChatBubble({ event, index }: { event: ChatEvent; index: number }) {
  const content = useMemo(() => buildBubbleContent(event), [event]);
  const displayedText = useTypewriter(content.body);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.24, delay: Math.min(index * 0.02, 0.12) }}
      className={`flex gap-3 ${content.align === 'right' ? 'justify-end' : 'justify-start'}`}
    >
      {content.align !== 'right' && <Avatar accent={content.accent} label={content.avatarLabel} />}
      <div className={`max-w-[90%] sm:max-w-[84%] ${content.align === 'right' ? 'items-end' : ''}`}>
        <div
          className={`rounded-[28px] border px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.2)] ${content.panelClass}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.26em] ${content.labelClass}`}>
                {content.label}
              </p>
              <p className="mt-1 text-sm font-medium text-white/92">{content.title}</p>
            </div>
            <p className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-mist/45">
              {content.meta}
            </p>
          </div>

          <div className="mt-3 space-y-3">
            <TypewriterLine text={displayedText} toneClass={content.bodyClass} />
            {content.evidence.length > 0 && (
              <div className="space-y-2 border-l border-white/10 pl-3">
                {content.evidence.map((item) => (
                  <p key={item} className="text-xs leading-6 text-mist/70">
                    {item}
                  </p>
                ))}
              </div>
            )}
            {content.note ? (
              <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-mist/50">{content.note}</p>
                <p className="mt-1 font-mono text-xs leading-6 text-white/90 whitespace-pre-wrap">
                  {content.noteValue}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {content.align === 'right' && <Avatar accent={content.accent} label={content.avatarLabel} />}
    </motion.article>
  );
}

function Avatar({ accent, label }: { accent: string; label: string }) {
  return (
    <div
      className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-semibold uppercase tracking-[0.24em] ${accent}`}
    >
      {label}
    </div>
  );
}

function TypewriterLine({ text, toneClass }: { text: string; toneClass: string }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');

    if (!text) {
      return;
    }

    let index = 0;
    const timer = window.setInterval(() => {
      index += 2;
      setDisplayed(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <p className={`min-h-[1.5rem] text-sm leading-7 ${toneClass}`}>
      {displayed}
      <Caret isVisible={displayed.length < text.length} />
    </p>
  );
}

function Caret({ isVisible }: { isVisible: boolean }) {
  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="ml-1 inline-block h-4 w-2 translate-y-[2px] rounded-sm bg-mint/70 align-middle"
        />
      ) : null}
    </AnimatePresence>
  );
}

function buildBubbleContent(event: ChatEvent): BubbleContent {
  if (event.type === 'finding') {
    const finding = event.data;
    return {
      align: 'left' as const,
      label: 'Round 0 analysis',
      title: finding.agentId.replace(/_/g, ' '),
      body: finding.hypothesis,
      meta: `${Math.round(finding.confidence * 100)}% confidence`,
      accent: 'border-[#3B82F6]/20 bg-[#07111f] text-[#93c5fd]',
      labelClass: 'text-[#60a5fa]',
      bodyClass: 'text-white/90',
      avatarLabel: finding.agentId.slice(0, 3),
      panelClass: 'border-[#3B82F6]/15 bg-[rgba(10,18,34,0.84)]',
      evidence: finding.evidence.slice(0, 4),
      note: finding.proposedRemediation ? 'Proposed remediation' : '',
      noteValue: finding.proposedRemediation,
    };
  }

  if (event.type === 'challenge') {
    const challenge = event.data;
    return {
      align: 'left' as const,
      label: 'Round 1 challenge',
      title: `${challenge.challengerAgentId.replace(/_/g, ' ')} challenges ${challenge.targetAgentId.replace(/_/g, ' ')}`,
      body: challenge.counterHypothesis,
      meta: 'round 1 challenge',
      accent: 'border-orange-400/20 bg-[rgba(39,24,8,0.9)] text-orange-200',
      labelClass: 'text-orange-300',
      bodyClass: 'text-orange-50',
      avatarLabel: challenge.challengerAgentId.slice(0, 3),
      panelClass: 'border-orange-400/15 bg-[rgba(33,20,7,0.84)]',
      evidence: [],
      note: '',
      noteValue: '',
    };
  }

  if (event.type === 'rebuttal') {
    const rebuttal = event.data;
    const isDefend = rebuttal.position === 'DEFEND';

    return {
      align: 'right' as const,
      label: 'Round 2 rebuttal',
      title: `${rebuttal.respondingAgentId.replace(/_/g, ' ')} ${rebuttal.position.toLowerCase()}`,
      body:
        rebuttal.position === 'DEFEND'
          ? 'I maintain the original finding and the confidence still holds.'
          : 'I concede the challenge and lower confidence accordingly.',
      meta: `${Math.round(rebuttal.updatedConfidence * 100)}% confidence`,
      accent: isDefend
        ? 'border-indigo-400/20 bg-[rgba(20,18,42,0.92)] text-indigo-100'
        : 'border-rose-400/20 bg-[rgba(40,12,18,0.9)] text-rose-100',
      labelClass: isDefend ? 'text-indigo-300' : 'text-rose-300',
      bodyClass: isDefend ? 'text-indigo-50' : 'text-rose-50',
      avatarLabel: rebuttal.respondingAgentId.slice(0, 3),
      panelClass: isDefend
        ? 'border-indigo-400/15 bg-[rgba(17,20,38,0.9)]'
        : 'border-rose-400/15 bg-[rgba(35,13,18,0.9)]',
      evidence: [],
      note: 'Rebuttal factor',
      noteValue: `${Math.round(rebuttal.rebuttalFactor * 100)}%`,
    };
  }

  return {
    align: 'left' as const,
    label: 'Judge verdict',
    title: 'Final decision',
    body: event.data.reasoning,
    meta: `${event.data.riskTier} risk`,
    accent: 'border-violet-400/20 bg-[rgba(26,13,39,0.92)] text-violet-100',
    labelClass: 'text-violet-300',
    bodyClass: 'text-violet-50',
    avatarLabel: 'JDG',
    panelClass: 'border-violet-400/15 bg-[rgba(25,13,38,0.9)]',
    evidence: [],
    note: 'Recommended action',
    noteValue: event.data.recommendedAction,
  };
}

function useTypewriter(text: string): string {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');

    if (!text) {
      return;
    }

    let index = 0;
    const timer = window.setInterval(() => {
      index += 3;
      setDisplayed(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 12);

    return () => window.clearInterval(timer);
  }, [text]);

  return displayed;
}
