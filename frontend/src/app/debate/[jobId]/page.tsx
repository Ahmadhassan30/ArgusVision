"use client";

/**
 * Debate Page — Spacious Clinical Workstation (Scrollable Layout).
 *
 * Mapped components according to user feedback:
 * 1. Removed the locked h-screen viewport and enabled natural vertical scrolling.
 * 2. 2x2 DICOM Viewer Grid is placed at the top with generous spacing (680px height).
 * 3. Trigger/Divergence panel acts as a full-width metrics banner below the grid.
 * 4. A clean three-column console below the grid displays Consensus Verdict,
 *    Agent Classifiers, and the scrolling Live Debate Transcript.
 * 5. This removes the clutter and allows all elements to scale and breathe.
 */

import { useEffect, useMemo, useState } from "react";

import { useDebateStream } from "@/hooks/useDebateStream";
import { useDebateEngine } from "@/hooks/useDebateEngine";
import { loadJobImage } from "@/lib/sessionImage";

import AgentScoreboard, { type AgentStatus } from "@/components/debate/AgentScoreboard";
import DebateTranscript from "@/components/debate/DebateTranscript";
import TriggerPanel from "@/components/debate/TriggerPanel";
import ConsensusVerdict from "@/components/debate/ConsensusVerdict";
import HeatmapCanvas from "@/components/debate/HeatmapCanvas";
import { AGENT_A, AGENT_B } from "@/lib/constants";

interface DebatePageProps {
  params: { jobId: string };
}

function leadClass(probs: Record<string, number> | null): string | null {
  if (!probs) return null;
  let best: string | null = null;
  let bv = -Infinity;
  for (const [k, v] of Object.entries(probs)) {
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}

export default function DebatePage({ params }: DebatePageProps): React.JSX.Element {
  const { jobId } = params;
  const ws = useDebateStream(jobId);
  const debate = useDebateEngine(ws, jobId);

  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [selectedViewport, setSelectedViewport] = useState<1 | 2 | 3 | 4>(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSourceImage(loadJobImage(jobId));
  }, [jobId]);

  const formattedDate = useMemo(() => {
    if (!mounted) return "";
    return new Date().toLocaleDateString();
  }, [mounted]);

  const formattedTime = useMemo(() => {
    if (!mounted) return "";
    return new Date().toLocaleTimeString();
  }, [mounted]);

  const debateRunning = debate.active && !debate.finished;
  const showConsensus = debate.finished && ws.consensus !== null;

  // Header status colors.
  const status = useMemo(() => {
    if (ws.phase === "error") return { label: "Error", color: "#DC2626" };
    if (showConsensus) return { label: "Resolved", color: "#059669" };
    if (debateRunning) return { label: `Debating · R${debate.round || 1}`, color: "#f97316" };
    if (ws.agentA && ws.agentB) return { label: "Agents ready", color: "#3b82f6" };
    if (ws.phase === "running") return { label: "Processing", color: "#3b82f6" };
    return { label: "Awaiting", color: "#6b7280" };
  }, [ws.phase, ws.agentA, ws.agentB, debateRunning, debate.round, showConsensus]);

  // Per-agent scoreboard inputs.
  const aProbs = debate.turns.length > 0 ? debate.beliefA : ws.agentA?.result.probabilities ?? null;
  const bProbs = debate.turns.length > 0 ? debate.beliefB : ws.agentB?.result.probabilities ?? null;
  const aConf = debate.turns.length > 0 ? debate.confA : ws.agentA?.result.confidence ?? 0;
  const bConf = debate.turns.length > 0 ? debate.confB : ws.agentB?.result.confidence ?? 0;

  const statusFor = (agent: "A" | "B", has: boolean): AgentStatus => {
    if (!has) return "thinking";
    if (debate.finished) return "settled";
    if (debateRunning && debate.speaker === agent) return "speaking";
    if (debateRunning) return "listening";
    return "thinking";
  };

  const convergedClass = debate.finished && debate.converged ? leadClass(debate.beliefA) : null;
  const recap = ws.consensus
    ? `After ${debate.round} rounds the agents reconciled their reading to ${ws.consensus.pred_class}. Calibrated head confidence: ${(ws.consensus.confidence * 100).toFixed(0)}%.`
    : "";

  return (
    <main className="min-h-screen w-full flex flex-col text-slate-300 font-sans pb-12" style={{ backgroundColor: "#000000" }}>
      {/* ── HEADER BAR (DICOM style) ────────────────────────────────── */}
      <header
        className="flex h-12 w-full shrink-0 items-center justify-between px-4 border-b select-none sticky top-0 z-50"
        style={{ backgroundColor: "#1e222b", borderColor: "#2d313c" }}
      >
        {/* Left: Specimen ID tags */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[#a1a1a6] font-semibold">SUBJECT:</span>
              <span className="text-[#fbbf24]">ISIC_SPECIMEN_{jobId.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="h-3 w-px bg-[#2d313c]" />
            <div className="flex items-center gap-2">
              <span className="text-[#a1a1a6] font-semibold">STUDY DATE:</span>
              <span className="text-[#e5e7eb]">{formattedDate} {formattedTime}</span>
            </div>
          </div>
        </div>

        {/* Right: Actions / Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded px-2.5 py-0.5" style={{ backgroundColor: `${status.color}15`, border: `1px solid ${status.color}40` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: status.color }}>
              {status.label}
            </span>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-75" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.02 6.02 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-75" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
          </div>
        </div>
      </header>

      {/* ── WORKSPACE WRAPPER ────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 flex flex-col gap-6">

        {/* ── TOP SECTION: 2x2 DICOM Viewer Grid (Generous 650px height) ── */}
        <section className="h-[650px] w-full grid grid-cols-2 grid-rows-2 gap-1 border select-none bg-black" style={{ borderColor: "#2d313c" }}>
          
          {/* Quadrant 1: Localizer Specimen */}
          <div
            onClick={() => setSelectedViewport(1)}
            className="relative flex flex-col items-stretch overflow-hidden border cursor-pointer"
            style={{
              borderColor: selectedViewport === 1 ? "#fbbf24" : "#1a1a1f",
              backgroundColor: "#050505"
            }}
          >
            <div className="absolute top-2 left-2 z-10 font-mono text-[9px] text-[#9ca3af] leading-tight pointer-events-none">
              <div>{formattedDate}</div>
              <div>STUDY: LOCALIZER</div>
              <div>3PLAN SCAN</div>
            </div>
            <div className="absolute top-2 right-2 z-10 font-mono text-[9px] text-[#fbbf24] font-bold pointer-events-none">SR</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 font-mono text-[10px] text-[#9ca3af] tracking-wider pointer-events-none">CORONAL</div>
            <div className="flex-1 flex items-center justify-center p-6 min-h-0">
              {sourceImage ? (
                <img src={sourceImage} alt="Source Specimen" className="max-h-full max-w-full object-contain border" style={{ borderColor: "#1f1f23" }} />
              ) : (
                <span className="font-mono text-[10px] text-slate-600">NO LOCALIZER TARGET</span>
              )}
            </div>
            <div className="absolute bottom-2 left-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight pointer-events-none">
              <div>Images: 1/1</div>
              <div>Wt: 256 / ww: 256</div>
              <div>Zoom: 100%</div>
            </div>
            <div className="absolute bottom-2 right-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight text-right pointer-events-none">
              <div>Size: 224 x 224</div>
              <div>Thick: 7.00 mm</div>
            </div>
          </div>

          {/* Quadrant 2: Agent A Attention */}
          <div
            onClick={() => setSelectedViewport(2)}
            className="relative flex flex-col items-stretch overflow-hidden border cursor-pointer"
            style={{
              borderColor: selectedViewport === 2 ? "#fbbf24" : "#1a1a1f",
              backgroundColor: "#050505"
            }}
          >
            <div className="absolute top-2 left-2 z-10 font-mono text-[9px] text-[#9ca3af] leading-tight pointer-events-none">
              <div>AGENT A: CNN ANALYSIS</div>
              <div>SALIENCY: GRAD-CAM++</div>
              <div>LAYER: features.16</div>
            </div>
            <div className="absolute top-2 right-2 z-10 font-mono text-[9px] text-blue-500 font-bold pointer-events-none">AL</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 font-mono text-[10px] text-[#9ca3af] tracking-wider pointer-events-none">SAGITTAL</div>
            <div className="flex-1 flex items-center justify-center p-6 min-h-0">
              {ws.attention ? (
                <HeatmapCanvas b64={ws.attention.heatmap_a_b64} accent={AGENT_A.color} showOverlay={false} alt="Agent A Heatmap" />
              ) : (
                <span className="font-mono text-[10px] text-slate-600">AWAITING ATTENTION MATRIX</span>
              )}
            </div>
            <div className="absolute bottom-2 left-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight pointer-events-none">
              <div>Target: {leadClass(aProbs) || "N/A"}</div>
              <div>Confidence: {(aConf * 100).toFixed(0)}%</div>
            </div>
            <div className="absolute bottom-2 right-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight text-right pointer-events-none">
              <div>Size: 224 x 224</div>
              <div>Zoom: 100%</div>
            </div>
          </div>

          {/* Quadrant 3: Agent B Attention */}
          <div
            onClick={() => setSelectedViewport(3)}
            className="relative flex flex-col items-stretch overflow-hidden border cursor-pointer"
            style={{
              borderColor: selectedViewport === 3 ? "#fbbf24" : "#1a1a1f",
              backgroundColor: "#050505"
            }}
          >
            <div className="absolute top-2 left-2 z-10 font-mono text-[9px] text-[#9ca3af] leading-tight pointer-events-none">
              <div>AGENT B: ViT ANALYSIS</div>
              <div>SALIENCY: ATTN ROLLOUT</div>
              <div>LAYER: cls_self_attn</div>
            </div>
            <div className="absolute top-2 right-2 z-10 font-mono text-[9px] text-purple-400 font-bold pointer-events-none">PF</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 font-mono text-[10px] text-[#9ca3af] tracking-wider pointer-events-none">AXIAL</div>
            <div className="flex-1 flex items-center justify-center p-6 min-h-0">
              {ws.attention ? (
                <HeatmapCanvas b64={ws.attention.heatmap_b_b64} accent={AGENT_B.color} showOverlay={false} alt="Agent B Heatmap" />
              ) : (
                <span className="font-mono text-[10px] text-slate-600">AWAITING ATTENTION MATRIX</span>
              )}
            </div>
            <div className="absolute bottom-2 left-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight pointer-events-none">
              <div>Target: {leadClass(bProbs) || "N/A"}</div>
              <div>Confidence: {(bConf * 100).toFixed(0)}%</div>
            </div>
            <div className="absolute bottom-2 right-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight text-right pointer-events-none">
              <div>Size: 224 x 224</div>
              <div>Zoom: 100%</div>
            </div>
          </div>

          {/* Quadrant 4: Disagreement / Alignment */}
          <div
            onClick={() => setSelectedViewport(4)}
            className="relative flex flex-col items-stretch overflow-hidden border cursor-pointer"
            style={{
              borderColor: selectedViewport === 4 ? "#fbbf24" : "#1a1a1f",
              backgroundColor: "#050505"
            }}
          >
            <div className="absolute top-2 left-2 z-10 font-mono text-[9px] text-[#9ca3af] leading-tight pointer-events-none">
              <div>CROSS-ALIGNMENT DETECTOR</div>
              <div>METHOD: ANOMALY DIFF</div>
              <div>TRIGGER: JS COMPUTE</div>
            </div>
            <div className="absolute top-2 right-2 z-10 font-mono text-[9px] text-[#dc2626] font-bold pointer-events-none">LH</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 font-mono text-[10px] text-[#9ca3af] tracking-wider pointer-events-none">3D RECON</div>
            <div className="flex-1 flex items-center justify-center p-6 min-h-0">
              {ws.attention ? (
                <HeatmapCanvas b64={ws.attention.disagreement_b64} bbox={ws.attention.bbox} accent="#dc2626" showOverlay={true} alt="Disagreement Alignment" />
              ) : (
                <span className="font-mono text-[10px] text-slate-600">AWAITING CROSS-ALIGNMENT MATRIX</span>
              )}
            </div>
            <div className="absolute bottom-2 left-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight pointer-events-none">
              <div>Divergence: {ws.trigger ? ws.trigger.js_divergence.toFixed(4) : "0.0000"}</div>
              <div>Status: {ws.trigger?.fired ? "DEBATE TRIGGERED" : "FAST PATH"}</div>
            </div>
            <div className="absolute bottom-2 right-2 z-10 font-mono text-[9px] text-[#6b7280] leading-tight text-right pointer-events-none">
              <div>Size: 224 x 224</div>
              <div>Zoom: 100%</div>
            </div>
          </div>
        </section>

        {/* ── MIDDLE ROW: Computation Gate Parameters ────────────────── */}
        <section className="rounded border bg-[#13161c] p-2" style={{ borderColor: "#2d313c" }}>
          <TriggerPanel trigger={ws.trigger} />
        </section>

        {/* ── BOTTOM SECTION: Three-Column Computational Deliberation Console ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch select-none">
          
          {/* Column 1: Agent Classifiers */}
          <div className="rounded border flex flex-col gap-px" style={{ backgroundColor: "#2d313c", borderColor: "#2d313c" }}>
            <div className="bg-[#13161c]">
              <AgentScoreboard agentId="A" probs={aProbs} confidence={aConf} topClass={leadClass(aProbs)} status={statusFor("A", ws.agentA !== null)} />
            </div>
            <div className="bg-[#13161c] flex-1">
              <AgentScoreboard agentId="B" probs={bProbs} confidence={bConf} topClass={leadClass(bProbs)} status={statusFor("B", ws.agentB !== null)} />
            </div>
          </div>

          {/* Column 2: Calibrated Consensus Verdict Details */}
          <div className="rounded border p-4 bg-[#13161c]" style={{ borderColor: "#2d313c" }}>
            {showConsensus && ws.consensus ? (
              <ConsensusVerdict consensus={ws.consensus} trigger={ws.trigger} synthesis={recap} synthesisActive={false} />
            ) : (
              <div className="h-full flex flex-col justify-center items-center font-mono text-[10px] text-slate-500 gap-2">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-600 animate-pulse" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>AWAITING FINAL RESOLUTION DECISION</span>
                <span className="text-[8px] text-slate-600">ECE calibration metrics pending</span>
              </div>
            )}
          </div>

          {/* Column 3: Live Debate Audit Log (Scrolling panel) */}
          <div className="rounded border bg-[#13161c]" style={{ borderColor: "#2d313c" }}>
            {(debate.active || debate.turns.length > 0) ? (
              <DebateTranscript
                turns={debate.turns}
                agreement={debate.agreement}
                round={debate.round}
                converged={debate.converged}
                finished={debate.finished}
                active={debateRunning}
                convergedClass={convergedClass}
              />
            ) : (
              <div className="h-full flex flex-col justify-center items-center font-mono text-[10px] text-slate-500 gap-2 p-10">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-600" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>LOG TRANSCRIPTION BUFFER EMPTY</span>
                <span className="text-[8px] text-slate-600">Awaiting multi-agent debate trigger</span>
              </div>
            )}
          </div>

        </section>

      </div>
    </main>
  );
}
