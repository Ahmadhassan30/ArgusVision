"use client";

/**
 * DebateTranscript — live terminal-like consensus debate log.
 *
 * Implements a pure command-line interface look matching the user's terminal UI:
 * - Gray header bar with red, yellow, green window actions on top.
 * - Monospace console logs with standard terminal colors (emerald, sky, neutral).
 * - Custom prompt identifiers for agents (agent-a, agent-b) replaying turns.
 * - Eliminates all graphic icons, avatars, and badge backgrounds for a raw terminal feel.
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
  press: "REINFORCES",
  rebut: "REBUTS",
  soften: "SOFTENS",
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastIndex = turns.length - 1;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  const pct = Math.round(agreement * 100);

  return (
    <div className="w-full flex flex-col font-mono text-xs overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl h-full">
      {/* ── Terminal Title Bar ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-neutral-900 px-4 py-2 border-b border-neutral-800 select-none">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 text-center font-mono text-[10px] text-neutral-400">
          argus-live-debate.sh — bash — {pct}% agreement
        </div>
        <div className="w-9" />
      </div>

      {/* ── Terminal Console Logs ───────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto leading-relaxed space-y-3 scroll-clinical max-h-[190px]"
      >
        {/* Startup banner */}
        <div className="text-neutral-500 select-none">
          <div>[SYS] Connection established with classification engines.</div>
          <div>[SYS] agreement_threshold_js = 0.23 | round_cap = 6</div>
          <div>[SYS] starting multi-agent consensus debate...</div>
        </div>

        {turns.length === 0 ? (
          <div className="flex items-center gap-2 text-neutral-500 select-none">
            <span className="text-sky-500">consensus-scheduler:~$</span>
            <span className="text-neutral-300 animate-pulse">awaiting agent-a opening...</span>
          </div>
        ) : (
          turns.map((turn) => {
            const isLast = turn.index === lastIndex;
            const agentName = turn.agent === "A" ? "agent-a" : "agent-b";
            const agentPromptColor = turn.agent === "A" ? "text-sky-400" : "text-purple-400";
            
            return (
              <div key={turn.index} className="whitespace-pre-wrap">
                {/* Bash Prompt Line */}
                <div className="flex items-center gap-1.5 select-none font-semibold text-[10px]">
                  <span className={agentPromptColor}>{agentName}</span>
                  <span className="text-neutral-600">:~#</span>
                  <span className="text-neutral-500">[{MOVE_LABEL[turn.move]} · R{turn.round}]</span>
                </div>

                {/* Typed Command Value (Speech/Argument) */}
                <div className="mt-0.5 text-neutral-300 pl-4 border-l border-neutral-800">
                  <ArgumentStream
                    text={turn.text}
                    agentId={turn.agent}
                    active={isLast && active}
                  />
                </div>
              </div>
            );
          })
        )}

        {/* Live typing indicator */}
        {active && !finished && turns.length > 0 && (
          <div className="text-neutral-600 animate-pulse select-none text-[10px] pl-4">
            [executing next round evaluation...]
          </div>
        )}

        {/* Convergence locks */}
        {finished && (
          <div className="space-y-1 text-[#059669] select-none font-semibold text-[10px] pt-2 border-t border-neutral-900">
            {converged && convergedClass ? (
              <>
                <div>✔ Preflight convergence checks completed.</div>
                <div>✔ Consensus outcome locked on classification: {getClassName(convergedClass)}</div>
                <div>✔ Calibrated confidence maps processed successfully.</div>
              </>
            ) : (
              <div className="text-red-500">✖ DEBATE TERMINATED — FAILED TO REACH CONVERGENCE IN ROUNDS LIMIT</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
