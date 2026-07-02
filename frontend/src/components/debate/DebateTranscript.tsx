"use client";

/**
 * DebateTranscript — Side-by-side multi-agent debate stream.
 *
 * Implements a split comparison layout:
 * - Left column displays CNN (Agent A) arguments.
 * - Right column displays ViT (Agent B) arguments.
 * - A clean vertical separator line splits the panels.
 * - Scrolling is synchronized to keep turns aligned.
 */

import { useEffect, useRef } from "react";

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
  open: "OPENS DEBATE",
  press: "REINFORCES READ",
  rebut: "REBUTS COUNTER",
  soften: "ADJUSTS BELIEF",
  concede: "CONCEDES READ",
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
  const scrollRefA = useRef<HTMLDivElement | null>(null);
  const scrollRefB = useRef<HTMLDivElement | null>(null);
  
  const turnsA = turns.filter((t) => t.agent === "A");
  const turnsB = turns.filter((t) => t.agent === "B");
  const lastIndex = turns.length - 1;

  useEffect(() => {
    const elA = scrollRefA.current;
    if (elA) elA.scrollTo({ top: elA.scrollHeight, behavior: "smooth" });
    const elB = scrollRefB.current;
    if (elB) elB.scrollTo({ top: elB.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const pct = Math.round(agreement * 100);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] p-4 select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0" style={{ borderColor: "#1a1a1f" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8e9196]">
            CONSENSUS DEBATE LOG
          </span>
          <span className="font-mono text-[9px] text-[#6b7280]">
            {finished ? "Concluded" : active ? `Round ${round}` : "Standby"}
          </span>
        </div>

        {/* Agreement Meter */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#6b7280]">
            Agreement
          </span>
          <div className="h-1 w-16 overflow-hidden rounded-full bg-[#1a1a1f]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: pct > 80 ? "#059669" : "#3b82f6",
              }}
            />
          </div>
          <span className="font-mono text-[9px] font-semibold text-[#e5e7eb]">
            {pct}%
          </span>
        </div>
      </div>

      {/* Side-by-Side Dual Column Panels */}
      <div className="flex-1 flex min-h-0 divide-x divide-[#1a1a1f]">
        
        {/* LEFT COLUMN: Agent A (CNN) */}
        <div
          ref={scrollRefA}
          className="flex-1 overflow-y-auto pr-3 space-y-3 scroll-clinical"
        >
          <div className="sticky top-0 bg-[#0a0a0c] pb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-sky-400 select-none border-b border-[#141417]">
            [AGENT-A] EFFICIENTNET-B4 (CNN STRUCTURAL)
          </div>
          
          {turnsA.length === 0 ? (
            <div className="h-28 flex flex-col items-center justify-center font-mono text-[9px] text-neutral-600 gap-1 select-none">
              <span>Awaiting agent-a readout...</span>
            </div>
          ) : (
            turnsA.map((turn) => {
              const meta = AGENTS.A;
              const isLast = turn.index === lastIndex;
              return (
                <div
                  key={turn.index}
                  className="rounded border p-3 flex gap-3 transition-all duration-300"
                  style={{
                    backgroundColor: "#0d0d0f",
                    borderColor: isLast && active ? meta.color : "#1a1a1f",
                    boxShadow: isLast && active ? `inset 2px 0 0 ${meta.color}` : "none",
                  }}
                >
                  <div className="shrink-0">
                    <img
                      src="/effnet.png"
                      alt="EfficientNet"
                      className="h-7 w-7 rounded-full border bg-slate-800 object-cover"
                      style={{ borderColor: meta.color }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: "#141417" }}>
                      <span className="font-mono text-[8px] text-[#4b5563]">ROUND {turn.round}</span>
                      <span
                        className="font-mono text-[8px] font-semibold tracking-wider rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: `${meta.color}12`,
                          color: meta.color,
                          border: `1px solid ${meta.color}25`,
                        }}
                      >
                        {MOVE_LABEL[turn.move]}
                      </span>
                    </div>
                    <div className="text-[11px] leading-relaxed" style={{ color: isLast && active ? "#e5e7eb" : "#a1a1a6" }}>
                      <ArgumentStream
                        text={turn.text}
                        agentId="A"
                        active={isLast && active}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: Agent B (ViT) */}
        <div
          ref={scrollRefB}
          className="flex-1 overflow-y-auto pl-3 space-y-3 scroll-clinical"
        >
          <div className="sticky top-0 bg-[#0a0a0c] pb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-purple-400 select-none border-b border-[#141417]">
            [AGENT-B] ViT-B/16 (TRANSFORMER GLOBAL)
          </div>

          {turnsB.length === 0 ? (
            <div className="h-28 flex flex-col items-center justify-center font-mono text-[9px] text-neutral-600 gap-1 select-none">
              <span>Awaiting agent-b response...</span>
            </div>
          ) : (
            turnsB.map((turn) => {
              const meta = AGENTS.B;
              const isLast = turn.index === lastIndex;
              return (
                <div
                  key={turn.index}
                  className="rounded border p-3 flex gap-3 transition-all duration-300"
                  style={{
                    backgroundColor: "#0d0d0f",
                    borderColor: isLast && active ? meta.color : "#1a1a1f",
                    boxShadow: isLast && active ? `inset 2px 0 0 ${meta.color}` : "none",
                  }}
                >
                  <div className="shrink-0">
                    <img
                      src="/vit.png"
                      alt="ViT"
                      className="h-7 w-7 rounded-full border bg-slate-800 object-cover"
                      style={{ borderColor: meta.color }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: "#141417" }}>
                      <span className="font-mono text-[8px] text-[#4b5563]">ROUND {turn.round}</span>
                      <span
                        className="font-mono text-[8px] font-semibold tracking-wider rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: `${meta.color}12`,
                          color: meta.color,
                          border: `1px solid ${meta.color}25`,
                        }}
                      >
                        {MOVE_LABEL[turn.move]}
                      </span>
                    </div>
                    <div className="text-[11px] leading-relaxed" style={{ color: isLast && active ? "#e5e7eb" : "#a1a1a6" }}>
                      <ArgumentStream
                        text={turn.text}
                        agentId="B"
                        active={isLast && active}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Audit Verdict Banner */}
      {finished && (
        <div
          className="mt-3 flex items-center justify-between rounded border p-2.5 font-mono text-[9px] tracking-wide shrink-0 font-semibold"
          style={{
            backgroundColor: converged ? "#081c15" : "#141417",
            borderColor: converged ? "#0f3d2a" : "#1f1f23",
            color: converged ? "#34d399" : "#9ca3af",
          }}
        >
          <span>VERDICT STATUS: AGENTS CONVERGED</span>
          <span>
            {converged && convergedClass
              ? `CONSENSUS: ${getClassName(convergedClass)}`
              : "TERMINATED — NO CONVERGENCE"}
          </span>
        </div>
      )}
    </div>
  );
}
