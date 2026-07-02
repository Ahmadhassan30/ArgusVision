"use client";

import { AGENTS, getClassName } from "@/lib/constants";
import type { DebateTurn } from "@/lib/debate/engine";
import type { Move } from "@/lib/debate/beliefs";
import ArgumentStream from "@/components/debate/ArgumentStream";

interface DebateTranscriptProps {
  turns: DebateTurn[];
  agreement: number;
  round: number;
  converged: boolean;
  finished: boolean;
  active: boolean;
  convergedClass?: string | null;
}

const MOVE_LABEL: Record<Move, string> = {
  open: "OPENS",
  press: "REINFORCES",
  rebut: "REBUTS",
  soften: "ADJUSTS",
  concede: "CONCEDES",
  agree: "CONVERGES",
};

export default function DebateTranscript({
  turns,
  agreement,
  round,
  converged,
  finished,
  active,
  convergedClass,
}: DebateTranscriptProps): React.JSX.Element {
  const turnsA = turns.filter((t) => t.agent === "A");
  const turnsB = turns.filter((t) => t.agent === "B");
  const lastIndex = turns.length - 1;
  const pct = Math.round(agreement * 100);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "#080a0e" }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: "#1c1f26" }}
      >
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="tracking-widest uppercase font-bold" style={{ color: "#a1a1aa" }}>Debate Log</span>
          <span style={{ color: "#52525b" }}>
            {finished ? "Concluded" : active ? `Round ${round}` : "Standby"}
          </span>
        </div>

        {/* Agreement meter */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px]" style={{ color: "#52525b" }}>Agreement</span>
          <div className="h-1 w-16 overflow-hidden rounded-full" style={{ backgroundColor: "#18191f" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct > 80 ? "#10b981" : "#f59e0b" }}
            />
          </div>
          <span className="font-mono text-[9px]" style={{ color: "#71717a" }}>{pct}%</span>
        </div>
      </div>

      {/* Agent column headers */}
      <div className="grid grid-cols-2 border-b shrink-0" style={{ borderColor: "#1c1f26" }}>
        {[
          { name: "EfficientNet-B4", sub: "CNN STRUCTURAL EXTRACTOR", color: "#3b82f6" },
          { name: "ViT-B/16", sub: "TRANSFORMER GLOBAL CONTEXT", color: "#a855f7", right: true },
        ].map(({ name, sub, color, right }) => (
          <div
            key={name}
            className={`px-5 py-3 flex flex-col items-center gap-0.5 ${right ? "border-l" : ""}`}
            style={{ borderColor: "#1c1f26" }}
          >
            <span className="font-mono text-[11px] font-bold" style={{ color }}>{name}</span>
            <span className="font-mono text-[9px]" style={{ color: "#52525b" }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Turn columns */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-[#1c1f26]">

        {/* Agent A */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 scroll-clinical">
          {turnsA.length === 0 ? (
            <div className="font-mono text-[10px] py-4 text-center" style={{ color: "#3f3f46" }}>
              Awaiting agent-a…
            </div>
          ) : turnsA.map((turn) => {
            const isLast = turn.index === lastIndex;
            return (
              <div key={turn.index} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px]" style={{ color: "#52525b" }}>R{turn.round}</span>
                  <span className="font-mono text-[8px] font-bold tracking-wider rounded px-1.5 py-0.5 bg-[#3b82f6]/10" style={{ color: "#3b82f6" }}>
                    {MOVE_LABEL[turn.move]}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed" style={{ color: "#a1a1aa" }}>
                  <ArgumentStream
                    text={turn.text}
                    agentId="A"
                    active={isLast && active}
                    className="text-[13px] leading-relaxed"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Agent B */}
        <div className="overflow-y-auto px-5 py-4 space-y-4 scroll-clinical">
          {turnsB.length === 0 ? (
            <div className="font-mono text-[10px] py-4 text-center" style={{ color: "#3f3f46" }}>
              Awaiting agent-b…
            </div>
          ) : turnsB.map((turn) => {
            const isLast = turn.index === lastIndex;
            return (
              <div key={turn.index} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px]" style={{ color: "#52525b" }}>R{turn.round}</span>
                  <span className="font-mono text-[8px] font-bold tracking-wider rounded px-1.5 py-0.5 bg-[#a855f7]/10" style={{ color: "#a855f7" }}>
                    {MOVE_LABEL[turn.move]}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed" style={{ color: "#a1a1aa" }}>
                  <ArgumentStream
                    text={turn.text}
                    agentId="B"
                    active={isLast && active}
                    className="text-[13px] leading-relaxed"
                  />
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Verdict footer */}
      {finished && (
        <div
          className="flex items-center justify-between px-5 py-2.5 border-t shrink-0 font-mono text-[10px]"
          style={{
            borderColor: "#1c1f26",
            color: converged ? "#10b981" : "#f59e0b",
          }}
        >
          <span>{converged ? "CONVERGED" : "NO CONVERGENCE"}</span>
          {converged && convergedClass && (
            <span>Consensus: {getClassName(convergedClass)}</span>
          )}
        </div>
      )}
    </div>
  );
}
