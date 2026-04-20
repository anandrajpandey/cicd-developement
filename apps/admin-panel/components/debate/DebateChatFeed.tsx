import { AgentFinding, Challenge, Rebuttal, Decision } from './debate.types';

type ChatEvent = 
  | { type: 'finding', data: AgentFinding }
  | { type: 'challenge', data: Challenge }
  | { type: 'rebuttal', data: Rebuttal }
  | { type: 'decision', data: Decision };

export function DebateChatFeed({ 
  findings, 
  challenges, 
  rebuttals, 
  decision 
}: {
  findings: AgentFinding[];
  challenges: Challenge[];
  rebuttals: Partial<Record<string, Rebuttal>>;
  decision: Decision | null;
}) {
  const events: ChatEvent[] = [
    ...findings.map(f => ({ type: 'finding' as const, data: f })),
    ...challenges.map(c => ({ type: 'challenge' as const, data: c })),
    ...Object.values(rebuttals).filter(Boolean).map(r => ({ type: 'rebuttal' as const, data: r! })),
    ...(decision ? [{ type: 'decision' as const, data: decision }] : [])
  ];

  return (
    <div className="flex flex-col gap-4">
      {events.map((ev, i) => (
        <ChatMessage key={`${ev.type}-${i}`} event={ev} />
      ))}
      {events.length === 0 && (
        <p className="text-mist/50 text-xs italic text-center py-4">Waiting for agent comms...</p>
      )}
    </div>
  );
}

function ChatMessage({ event }: { event: ChatEvent }) {
  if (event.type === 'finding') {
    const f = event.data;
    return (
      <div className="flex flex-col gap-2 bg-white/5 p-4 rounded-xl border border-white/5 shadow-sm relative hover:bg-white/10 transition-colors">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase font-bold tracking-widest text-[#3B82F6]">{f.agentId.replace('_', ' ')}</span>
          <span className="text-[10px] text-white/50 bg-black/30 px-2 py-1 rounded font-mono">{Math.round(f.confidence * 100)}% Conf</span>
        </div>
        <p className="text-sm text-white/90 leading-relaxed font-medium">
          {f.hypothesis}
        </p>
        {f.evidence && f.evidence.length > 0 && (
          <ul className="mt-2 space-y-1.5 pl-3 border-l-2 border-[#3B82F6]/30 py-1">
            {f.evidence.map((e, i) => (
              <li key={i} className="text-xs text-mist/80 block break-words leading-relaxed">{e}</li>
            ))}
          </ul>
        )}
        {f.proposedRemediation && (
          <div className="mt-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
            <p className="text-[10px] uppercase font-bold tracking-widest text-[#10B981] mb-1">Proposed Fix</p>
            <p className="text-xs text-mist/90 font-mono whitespace-pre-wrap leading-relaxed">{f.proposedRemediation}</p>
          </div>
        )}
      </div>
    );
  }

  if (event.type === 'challenge') {
    const c = event.data;
    return (
      <div className="flex flex-col gap-2 bg-orange-500/10 p-4 rounded-xl border border-orange-500/20 shadow-sm ml-8 relative hover:bg-orange-500/20 transition-colors">
        <div className="absolute -left-4 top-6 w-4 h-[1px] bg-orange-500/30" />
        <div className="absolute -left-[17px] top-[22px] w-2 h-2 rounded-full bg-orange-500/50" />
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase font-bold tracking-widest text-orange-400 flex items-center gap-2">
            {c.challengerAgentId.replace('_', ' ')}
            <span className="text-orange-400/50 text-[10px] normal-case font-medium tracking-normal italic">&#8594; challenges {c.targetAgentId.replace('_', ' ')}</span>
          </span>
        </div>
        <p className="text-sm text-white/90 leading-relaxed font-medium">{c.counterHypothesis}</p>
      </div>
    );
  }

  if (event.type === 'rebuttal') {
    const r = event.data;
    const isDefend = r.position === 'DEFEND';
    return (
      <div className={`flex flex-col gap-2 p-4 rounded-xl border shadow-sm ml-16 relative transition-colors ${isDefend ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'}`}>
        <div className={`absolute -left-4 top-5 w-4 h-[1px] ${isDefend ? 'bg-indigo-500/30' : 'bg-red-500/30'}`} />
        <div className={`absolute -left-[17px] top-[18px] w-2 h-2 rounded-full ${isDefend ? 'bg-indigo-500/50' : 'bg-red-500/50'}`} />
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[11px] uppercase font-bold tracking-widest flex items-center gap-2 ${isDefend ? 'text-indigo-400' : 'text-red-400'}`}>
            {r.respondingAgentId.replace('_', ' ')}
          </span>
          <span className="text-[9px] text-white/90 px-2 py-1 rounded bg-black/30 font-bold tracking-widest">{r.position}</span>
        </div>
        <p className={`text-sm font-medium leading-relaxed ${isDefend ? 'text-indigo-100' : 'text-red-100'}`}>
          {isDefend ? "I maintain my hypothesis given the evidence." : "I concede to the challenge's points."}
        </p>
        <div className="mt-2 bg-black/20 p-2 rounded-lg inline-block self-start">
            <p className="text-xs text-mist/80">Updated confidence: <span className="font-mono text-white/90">{Math.round(r.updatedConfidence * 100)}%</span></p>
        </div>
      </div>
    );
  }

  if (event.type === 'decision') {
    const d = event.data;
    const isHigh = d.riskTier === 'HIGH';
    const isMed = d.riskTier === 'MEDIUM';
    return (
      <div className="flex flex-col gap-3 bg-[#1b1126] p-5 rounded-xl border-2 border-[#a855f7]/30 shadow-[0_0_30px_-5px_rgba(168,85,247,0.2)] mt-6">
        <div className="flex items-center justify-between pb-3 border-b border-[#a855f7]/20">
          <span className="text-[13px] uppercase font-black tracking-widest text-[#a855f7] flex items-center gap-2">
            <span className="bg-[#a855f7]/20 p-1.5 rounded-md">âš–ï¸</span> JUDGE VERDICT
          </span>
          <div className="flex gap-2">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider ${isHigh ? 'bg-red-500/20 text-red-400' : isMed ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                {d.riskTier} RISK
            </span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wider bg-white/10 text-white/90 font-mono">
                SCORE: {Math.round(d.compositeScore * 100)}
            </span>
          </div>
        </div>
        <div className="space-y-4 mt-1">
            <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-mist/50 mb-1.5">Reasoning</p>
                <p className="text-sm text-white/90 leading-relaxed italic border-l-2 border-white/10 pl-3">"{d.reasoning}"</p>
            </div>
            <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                <p className="text-[10px] uppercase font-bold tracking-widest text-mist/50 mb-1.5">Recommended Action</p>
                <p className="text-[13px] text-[#10B981] font-mono leading-relaxed">&gt; {d.recommendedAction}</p>
            </div>
        </div>
      </div>
    );
  }

  return null;
}
