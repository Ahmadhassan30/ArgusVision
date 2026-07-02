"use client";

/**
 * DebateTranscript — Side-by-side split columns consensus log.
 *
 * Implements a split comparison layout:
 * - Center vertical line separator.
 * - Flat, borderless dialogue flow resembling ChatGPT message logs (sans-serif text).
 * - Stripped out all boxes and container card backgrounds for a clean, open layout.
 * - Text size is increased to text-base (16px) for optimal readability.
 * - Height expands naturally without internal scrollbars, conforming to a unified page scroll.
 */

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
  const turnsA = turns.filter((t) => t.agent === "A");
  const turnsB = turns.filter((t) => t.agent === "B");
  const lastIndex = turns.length - 1;

  const pct = Math.round(agreement * 100);

  return (
    <div className="flex flex-col bg-[#0a0a0c] p-4 select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-3 mb-3 shrink-0" style={{ borderColor: "#1a1a1f" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#8e9196]">
            CONSENSUS DEBATE LOG
          </span>
          <span className="font-mono text-[10px] text-[#6b7280]">
            {finished ? "Concluded" : active ? `Round ${round}` : "Standby"}
          </span>
        </div>

        {/* Agreement Meter */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#6b7280]">
            Agreement
          </span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#1a1a1f]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: pct > 80 ? "#059669" : "#3b82f6",
              }}
            />
          </div>
          <span className="font-mono text-[10px] font-semibold text-[#e5e7eb]">
            {pct}%
          </span>
        </div>
      </div>

      {/* Side-by-Side Dual Column Panels */}
      <div className="flex divide-x divide-[#1a1a1f]">

        {/* LEFT COLUMN: Agent A (CNN) */}
        <div className="flex-1 pr-3 space-y-2.5">
          {/* Sticky Header with ASCII Art */}
          <div className="sticky top-0 bg-[#0a0a0c] pb-3 pt-1 flex flex-col items-center gap-2 select-none border-b border-[#141417] z-10">
            <pre className="text-sky-400 font-mono font-bold leading-[1.1] text-center select-none text-[10px] tracking-tight">
              {`  ___ _  _ _  _ 
 / __| \\| | \\| |
| (__| .\` | .\` |
 \\___|_|\\_|_|\\_|`}
            </pre>
            <div className="flex flex-col items-center">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-sky-400">
                EFFICIENTNET-B4
              </span>
              <span className="font-mono text-[9px] text-[#4b5563]">CNN STRUCTURAL EXTRACTOR</span>
            </div>
          </div>

          {turnsA.length === 0 ? (
            <div className="h-28 flex flex-col items-center justify-center font-mono text-[10px] text-neutral-600 gap-1 select-none">
              <span>Awaiting agent-a readout...</span>
            </div>
          ) : (
            turnsA.map((turn) => {
              const meta = AGENTS.A;
              const isLast = turn.index === lastIndex;
              return (
                <div
                  key={turn.index}
                  className="flex flex-col gap-2 py-3 border-b border-neutral-900/60 last:border-b-0 w-full animate-fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-[#4b5563]">ROUND {turn.round}</span>
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
                  <div className="text-[19px] font-sans leading-relaxed text-neutral-200">
                    <ArgumentStream
                      text={turn.text}
                      agentId="A"
                      active={isLast && active}
                      className="font-sans text-[19px] leading-relaxed text-neutral-200"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: Agent B (ViT) */}
        <div className="flex-1 pl-3 space-y-2.5">
          {/* Sticky Header with ASCII Art */}
          <div className="sticky top-0 bg-[#0a0a0c] pb-3 pt-1 flex flex-col items-center gap-2 select-none border-b border-[#141417] z-10">
            <pre className="text-purple-400 font-mono font-bold leading-[1.1] text-center select-none text-[10px] tracking-tight">
              {`__   _____ _____ 
\\ \\ / /_ _|_   _|
 \\ V / | |  | |  
  \\_/ |___| |_|  `}
            </pre>
            <div className="flex flex-col items-center">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-purple-400">
                ViT-B/16
              </span>
              <span className="font-mono text-[9px] text-[#4b5563]">TRANSFORMER GLOBAL CONTEXT</span>
            </div>
          </div>

          {turnsB.length === 0 ? (
            <div className="h-28 flex flex-col items-center justify-center font-mono text-[10px] text-neutral-600 gap-1 select-none">
              <span>Awaiting agent-b response...</span>
            </div>
          ) : (
            turnsB.map((turn) => {
              const meta = AGENTS.B;
              const isLast = turn.index === lastIndex;
              return (
                <div
                  key={turn.index}
                  className="flex flex-col gap-2 py-3 border-b border-neutral-900/60 last:border-b-0 w-full animate-fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#4b5563]">ROUND {turn.round}</span>
                    <span
                      className="font-mono text-[9px] font-semibold tracking-wider rounded px-1.5 py-0.5"
                      style={{
                        backgroundColor: `${meta.color}12`,
                        color: meta.color,
                        border: `1px solid ${meta.color}25`,
                      }}
                    >
                      {MOVE_LABEL[turn.move]}
                    </span>
                  </div>
                  <div className="text-[19px] font-sans leading-relaxed text-neutral-200">
                    <ArgumentStream
                      text={turn.text}
                      agentId="B"
                      active={isLast && active}
                      className="font-sans text-[19px] leading-relaxed text-neutral-200"
                    />
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
          className="mt-3 flex items-center justify-between rounded border p-2.5 font-mono text-[10px] tracking-wide shrink-0 font-semibold"
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
