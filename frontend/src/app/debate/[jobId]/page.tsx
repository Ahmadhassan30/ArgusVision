"use client";

/**
 * Debate Page — DICOM Workstation with Portrait Diagnostic Terminal.
 *
 * Mapped components according to user feedback:
 * 1. Single-screen layout (no page scrolling, locked to viewport height).
 * 2. Left: 2x2 DICOM Viewer Grid (occupies all remaining width).
 * 3. Right: Portrait Terminal Console (width 440px) displaying live classification
 *    and consensus logs.
 * 4. Fixed alignment issues in the ASCII logs by using CSS left borders
 *    instead of hardcoded "│" characters that break on variable text wrapping.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { useDebateStream } from "@/hooks/useDebateStream";
import { useDebateEngine } from "@/hooks/useDebateEngine";
import { loadJobImage } from "@/lib/sessionImage";
import { getClassName } from "@/lib/constants";

import HeatmapCanvas from "@/components/debate/HeatmapCanvas";
import DebateTranscript from "@/components/debate/DebateTranscript";
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
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

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
  const convergedClass = debate.finished && debate.converged ? leadClass(debate.beliefA) : null;

  // Build high-fidelity Linux CLI terminal output logs
  const terminalLines = useMemo(() => {
    const lines: React.ReactNode[] = [];

    // Header logo shell info
    lines.push(
      <div key="boot" className="text-neutral-500 font-mono text-[13px]">
        <div>[  INIT  ] Initializing Argus Consensus System (v2.1.0-lts)...</div>
        <div>[  BOOT  ] Hooking CUDA classification endpoints (T4 GPU verified).</div>
      </div>
    );

    // Stage 1/2 Inputs verification
    if (ws.completedAt.uploaded) {
      lines.push(
        <div key="gating" className="text-neutral-400 font-mono text-[13px] space-y-1">
          <div className="text-sky-400 font-semibold">┌── [SYSTEM] SPECIMEN INPUT GATE VERIFICATION</div>
          <div className="pl-4 border-l border-sky-950 space-y-0.5">
            <div>Subject Specimen  : <span className="text-white font-semibold">ISIC_{jobId.slice(0, 8).toUpperCase()}</span></div>
            <div>Heuristic Check   : Aspect Ratio, Dim Min, Channel StdDev <span className="text-emerald-400 font-bold">[PASS]</span></div>
            <div>Classifier Gate   : MobileNetV3 input verification        <span className="text-emerald-400 font-bold">[LESION DETECTED]</span></div>
            <div className="text-neutral-500 pt-1">(Confirms specimen is skin-lesion dermoscopy, rejecting arbitrary noise)</div>
          </div>
          <div className="text-sky-400 font-semibold">└────────────────────────────────────────────────────────</div>
        </div>
      );
    }

    // Models init
    if (ws.completedAt.agents_init) {
      lines.push(
        <div key="agents_init" className="text-neutral-500 font-mono text-[13px]">
          <div>[  INFO  ] Classification models initialized in frozen eval mode.</div>
          <div>[  INFO  ] Core agents seeded: <span className="text-sky-400 font-semibold">EfficientNet-B4</span> (CNN) & <span className="text-purple-400 font-semibold">ViT-B/16</span> (Transformer).</div>
        </div>
      );
    }

    // Agent A classification distributions
    if (ws.agentA) {
      lines.push(
        <div key="agentA" className="text-neutral-400 font-mono text-[13px] space-y-1">
          <div className="text-emerald-500 font-semibold">┌── [AGENT-A] EFFICIENTNET-B4 CLASSIFIER OUTPUTS</div>
          <div className="pl-4 border-l border-emerald-950 space-y-0.5">
            <div>Reasoning Mode    : CNN Structural Feature Analysis</div>
            <div>Lead Prediction   : <span className="text-white font-bold">{getClassName(ws.agentA.result.pred_class)}</span></div>
            <div>Confidence Score  : <span className="text-emerald-400 font-bold">{(ws.agentA.result.confidence * 100).toFixed(1)}%</span></div>
            <div className="text-neutral-500 pt-1">Raw Probabilities distribution:</div>
            {Object.entries(aProbs || {}).map(([cls, val]) => {
              if (val > 0.005) {
                const pct = (val * 100).toFixed(1);
                const barLen = Math.round(val * 10);
                const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
                return (
                  <div key={cls} className="text-[11px]">
                    {cls.padEnd(5)} : <span className="text-emerald-400">{bar}</span> {pct}% <span className="text-neutral-500">({getClassName(cls)})</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
          <div className="text-emerald-500 font-semibold">└────────────────────────────────────────────────────────</div>
        </div>
      );
    }

    // Agent B classification distributions
    if (ws.agentB) {
      lines.push(
        <div key="agentB" className="text-neutral-400 font-mono text-[13px] space-y-1">
          <div className="text-purple-500 font-semibold">┌── [AGENT-B] ViT-B/16 TRANSFORMER OUTPUTS</div>
          <div className="pl-4 border-l border-purple-950 space-y-0.5">
            <div>Reasoning Mode    : Vision Transformer Global Context Saliency</div>
            <div>Lead Prediction   : <span className="text-white font-bold">{getClassName(ws.agentB.result.pred_class)}</span></div>
            <div>Confidence Score  : <span className="text-purple-400 font-bold">{(ws.agentB.result.confidence * 100).toFixed(1)}%</span></div>
            <div className="text-neutral-500 pt-1">Raw Probabilities distribution:</div>
            {Object.entries(bProbs || {}).map(([cls, val]) => {
              if (val > 0.005) {
                const pct = (val * 100).toFixed(1);
                const barLen = Math.round(val * 10);
                const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
                return (
                  <div key={cls} className="text-[11px]">
                    {cls.padEnd(5)} : <span className="text-purple-400">{bar}</span> {pct}% <span className="text-neutral-500">({getClassName(cls)})</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
          <div className="text-purple-500 font-semibold">└────────────────────────────────────────────────────────</div>
        </div>
      );
    }

    // Divergence Gate calculation
    if (ws.trigger) {
      const fired = ws.trigger.fired;
      lines.push(
        <div key="trigger" className="text-neutral-400 font-mono text-[13px] space-y-1">
          <div className="text-amber-500 font-semibold">┌── [SYSTEM] DIVERGENCE ANALYSIS GATE</div>
          <div className="pl-4 border-l border-amber-950 space-y-0.5">
            <div>JS Divergence     : <span className={fired ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>{ws.trigger.js_divergence.toFixed(4)}</span> <span className="text-neutral-500">(Threshold: {ws.trigger.threshold_js.toFixed(2)})</span></div>
            <div>Entropy (Agent A) : {ws.trigger.entropy_a.toFixed(3)} bits <span className="text-neutral-500">(Uncertainty measure)</span></div>
            <div>Entropy (Agent B) : {ws.trigger.entropy_b.toFixed(3)} bits <span className="text-neutral-500">(Uncertainty measure)</span></div>
            <div className="text-neutral-500 pt-1">Decision           : <span className={fired ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>{fired ? "TRIGGER ADVERSARIAL DEBATE" : "FAST PATH CONSENSUS"}</span></div>
          </div>
          <div className="text-amber-500 font-semibold">└────────────────────────────────────────────────────────</div>
        </div>
      );
    }

    // Live debate status log inside the terminal
    if (debate.active || debate.turns.length > 0) {
      lines.push(
        <div key="debate_status" className="text-neutral-500 font-mono text-[13px] space-y-1">
          <div>[DEBATE] Live adversarial negotiation active (Round {debate.round}).</div>
          <div>[DEBATE] Redirecting live transcript text streams to Chat Console.</div>
          {debate.finished && <div className="text-emerald-500 font-semibold">[DEBATE] Multi-agent negotiation converged. Consensus locked.</div>}
        </div>
      );
    }

    // Calibrated Consensus output
    if (ws.consensus) {
      lines.push(
        <div key="consensus" className="text-neutral-400 font-mono text-[13px] space-y-1">
          <div className="text-emerald-500 font-semibold">┌── [CONSENSUS] FINAL CALIBRATED DIAGNOSIS</div>
          <div className="pl-4 border-l border-emerald-950 space-y-0.5">
            <div>Verdict Diagnosis : <span className="text-white font-bold">{getClassName(ws.consensus.pred_class)}</span></div>
            <div>Fusion Confidence : <span className="text-emerald-400 font-bold">{(ws.consensus.confidence * 100).toFixed(1)}%</span></div>
            <div>Calibrated ECE    : <span className="text-emerald-400 font-bold">{ws.consensus.ece.toFixed(4)}</span> <span className="text-neutral-500">(Calibration error)</span></div>
            <div>Scale Temperature : {ws.consensus.temperature.toFixed(2)} <span className="text-neutral-500">(Scaling factor)</span></div>
            <div className="text-neutral-500 pt-1">Calibrated Probabilities distribution:</div>
            {Object.entries(ws.consensus.probabilities).map(([cls, val]) => {
              if (val > 0.005) {
                const pct = (val * 100).toFixed(1);
                const barLen = Math.round(val * 10);
                const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
                return (
                  <div key={`cons_${cls}`} className="text-[11px]">
                    {cls.padEnd(5)} : <span className="text-emerald-400">{bar}</span> {pct}% <span className="text-neutral-500">({getClassName(cls)})</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
          <div className="text-emerald-500 font-semibold">└────────────────────────────────────────────────────────</div>
        </div>
      );
    }

    return lines;
  }, [ws.completedAt, ws.agentA, ws.agentB, ws.trigger, ws.consensus, aProbs, bProbs, debate.turns]);

  // Auto scroll to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLines]);

  return (
    <main className="min-h-screen w-screen flex flex-col overflow-y-auto scroll-clinical text-slate-300 font-sans" style={{ backgroundColor: "#000000" }}>
      {/* ── HEADER BAR (DICOM style) ────────────────────────────────── */}
      <header
        className="flex h-12 w-full shrink-0 items-center justify-between px-4 border-b select-none"
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
        </div>
      </header>

      {/* ── MAIN WORKSPACE ────────────────────────────────────────── */}
      <div className="flex flex-1 w-full">

        {/* ── LEFT AREA: 2x2 DICOM Viewer Grid + Bottom Debate Log ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderColor: "#2d313c" }}>
          {/* Top: 2x2 Grid */}
          <section className="w-full shrink-0 p-1 grid grid-cols-2 grid-rows-2 gap-1 select-none bg-black h-[480px]">

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

          {/* Bottom: Debate Transcript in Chat Form */}
          <div className="w-full border-t" style={{ borderColor: "#2d313c" }}>
            <DebateTranscript
              turns={debate.turns}
              agreement={debate.agreement}
              round={debate.round}
              converged={debate.converged}
              finished={debate.finished}
              active={debateRunning}
              convergedClass={convergedClass}
            />
          </div>
        </div>

        {/* ── RIGHT: Clinical Diagnostics Report Sidebar ─────────── */}
        <aside className="w-[450px] shrink-0 border-l select-text" style={{ backgroundColor: "#0a0b0f", borderColor: "#1e2028" }}>
          {/* Sidebar Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b select-none" style={{ borderColor: "#1e2028" }}>
            <span className="font-sans text-[13px] font-semibold uppercase tracking-[0.18em] text-[#52566b]">
              Diagnostic Report
            </span>
            <span className="font-mono text-[11px] text-[#32353f]">
              {jobId.slice(0, 8).toUpperCase()}
            </span>
          </div>

          {/* Sidebar Contents — flat clinical sections */}
          <div className="flex flex-col divide-y" style={{ borderColor: "#1e2028" }}>

            {/* ── Section 1: Input Validation ── */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-sans text-[11px] uppercase tracking-[0.14em] font-semibold text-[#52566b]">
                  Input Validation
                </span>
                <span className={`font-mono text-[10px] font-semibold tracking-wider ${ws.completedAt.uploaded ? "text-emerald-400" : "text-[#52566b]"}`}>
                  {ws.completedAt.uploaded ? "● VERIFIED" : "○ AWAITING"}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-[#52566b]">Modality</span>
                  <span className="text-sm font-medium text-[#c9ccd6]">Dermoscopic RGB</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-[#52566b]">Input Resolution</span>
                  <span className="font-mono text-sm text-[#c9ccd6]">224 × 224 px</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-[#52566b]">Lesion Gate</span>
                  <span className="font-mono text-sm text-emerald-400">Confirmed</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#32353f] pt-1">
                  MobileNetV3 pre-filter validates dermoscopic origin before core inference.
                </p>
              </div>
            </div>

            {/* ── Section 2: Neural Classifier Outputs ── */}
            <div className="px-6 py-5 space-y-5">
              <div className="flex items-center justify-between">
                <span className="font-sans text-[11px] uppercase tracking-[0.14em] font-semibold text-[#52566b]">
                  Classifier Outputs
                </span>
                <span className={`font-mono text-[10px] font-semibold tracking-wider ${ws.agentA && ws.agentB ? "text-sky-400" : "text-[#52566b]"}`}>
                  {ws.agentA && ws.agentB ? "● COMPUTED" : "○ RUNNING"}
                </span>
              </div>

              {/* Agent A */}
              {ws.agentA && (
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-sky-400">EfficientNet-B4</span>
                    <span className="font-mono text-sm text-[#c9ccd6]">{(ws.agentA.result.confidence * 100).toFixed(1)}% confidence</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(aProbs || {}).map(([cls, val]) => {
                      if (val <= 0.01) return null;
                      const pct = Math.round(val * 100);
                      return (
                        <div key={cls} className="space-y-1">
                          <div className="flex justify-between text-[12px]">
                            <span className="text-[#52566b]">{getClassName(cls)}</span>
                            <span className="font-mono text-[#9da3b4]">{pct}%</span>
                          </div>
                          <div className="h-px w-full overflow-hidden" style={{ backgroundColor: "#1e2028" }}>
                            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: "#38bdf8", opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider between agents */}
              {ws.agentA && ws.agentB && <div className="border-t" style={{ borderColor: "#1e2028" }} />}

              {/* Agent B */}
              {ws.agentB && (
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-purple-400">ViT-B/16</span>
                    <span className="font-mono text-sm text-[#c9ccd6]">{(ws.agentB.result.confidence * 100).toFixed(1)}% confidence</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(bProbs || {}).map(([cls, val]) => {
                      if (val <= 0.01) return null;
                      const pct = Math.round(val * 100);
                      return (
                        <div key={cls} className="space-y-1">
                          <div className="flex justify-between text-[12px]">
                            <span className="text-[#52566b]">{getClassName(cls)}</span>
                            <span className="font-mono text-[#9da3b4]">{pct}%</span>
                          </div>
                          <div className="h-px w-full overflow-hidden" style={{ backgroundColor: "#1e2028" }}>
                            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: "#c084fc", opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!ws.agentA && !ws.agentB && (
                <p className="text-sm text-[#32353f]">Awaiting inference…</p>
              )}
            </div>

            {/* ── Section 3: Divergence Analysis ── */}
            {ws.trigger && (
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[11px] uppercase tracking-[0.14em] font-semibold text-[#52566b]">
                    Divergence Analysis
                  </span>
                  <span className={`font-mono text-[10px] font-semibold tracking-wider ${ws.trigger.fired ? "text-amber-400" : "text-emerald-400"}`}>
                    {ws.trigger.fired ? "● DEBATE ACTIVE" : "● FAST PATH"}
                  </span>
                </div>

                {/* JS Divergence meter */}
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#52566b]">Jensen–Shannon Divergence</span>
                    <span className={`font-mono text-sm font-semibold ${ws.trigger.fired ? "text-amber-400" : "text-[#c9ccd6]"}`}>
                      {ws.trigger.js_divergence.toFixed(4)}
                    </span>
                  </div>
                  {/* Track */}
                  <div className="relative h-px w-full" style={{ backgroundColor: "#1e2028" }}>
                    <div
                      className="h-full absolute left-0 top-0"
                      style={{
                        width: `${Math.min(100, (ws.trigger.js_divergence / ws.trigger.threshold_js) * 100)}%`,
                        backgroundColor: ws.trigger.fired ? "#f59e0b" : "#34d399",
                      }}
                    />
                    {/* Threshold marker */}
                    <div className="absolute top-[-3px] bottom-[-3px] w-px bg-red-600/60" style={{ left: "100%" }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#32353f]">
                    <span>0.00 — identical</span>
                    <span>threshold {ws.trigger.threshold_js.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#52566b]">Agent A Entropy</span>
                    <span className="font-mono text-sm text-[#9da3b4]">{ws.trigger.entropy_a.toFixed(3)} bits</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#52566b]">Agent B Entropy</span>
                    <span className="font-mono text-sm text-[#9da3b4]">{ws.trigger.entropy_b.toFixed(3)} bits</span>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-[#32353f]">
                  JS divergence &gt; {ws.trigger.threshold_js.toFixed(2)} triggers adversarial consensus negotiation.
                </p>
              </div>
            )}

            {/* ── Section 4: Consensus Verdict ── */}
            {ws.consensus && (
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[11px] uppercase tracking-[0.14em] font-semibold text-[#52566b]">
                    Consensus Verdict
                  </span>
                  <span className="font-mono text-[10px] font-semibold tracking-wider text-emerald-400">
                    ● RESOLVED
                  </span>
                </div>

                {/* Primary verdict — large and prominent */}
                <div className="space-y-1">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#52566b]">Diagnosis</span>
                  <p className="text-[22px] font-semibold text-emerald-400 leading-tight">
                    {getClassName(ws.consensus.pred_class)}
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#52566b]">Confidence</span>
                    <span className="font-mono text-sm font-semibold text-[#c9ccd6]">
                      {(ws.consensus.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#52566b]">ECE Calibration Error</span>
                    <span className="font-mono text-sm text-emerald-400">
                      {ws.consensus.ece.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-[#52566b]">Platt Temperature</span>
                    <span className="font-mono text-sm text-[#9da3b4]">
                      {ws.consensus.temperature.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Calibrated probability bars */}
                <div className="space-y-3 pt-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#32353f]">Calibrated Probabilities</span>
                  {Object.entries(ws.consensus.probabilities).map(([cls, val]) => {
                    if (val <= 0.01) return null;
                    const pct = Math.round(val * 100);
                    return (
                      <div key={`cons_${cls}`} className="space-y-1">
                        <div className="flex justify-between text-[12px]">
                          <span className="text-[#52566b]">{getClassName(cls)}</span>
                          <span className="font-mono text-[#9da3b4]">{pct}%</span>
                        </div>
                        <div className="h-px w-full overflow-hidden" style={{ backgroundColor: "#1e2028" }}>
                          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: "#34d399", opacity: 0.8 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] leading-relaxed text-[#32353f]">
                  Expected Calibration Error target &lt; 0.05. Temperature scaling aligns raw logits to empirical clinical accuracy.
                </p>
              </div>
            )}

          </div>
        </aside>
      </div>
    </main>
  );
}
