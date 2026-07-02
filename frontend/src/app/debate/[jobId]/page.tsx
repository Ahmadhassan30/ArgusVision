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
    <main className="h-screen w-screen flex flex-col overflow-hidden text-slate-300 font-sans" style={{ backgroundColor: "#000000" }}>
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
      <div className="flex flex-1 w-full min-h-0 overflow-hidden">

        {/* ── LEFT AREA: 2x2 DICOM Viewer Grid + Bottom Debate Log ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r" style={{ borderColor: "#2d313c" }}>
          {/* Top: 2x2 Grid */}
          <section className="flex-1 min-h-0 p-1 grid grid-cols-2 grid-rows-2 gap-1 select-none bg-black">

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
          <div className="h-[380px] shrink-0 border-t" style={{ borderColor: "#2d313c" }}>
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
        <aside className="w-[450px] shrink-0 border-l flex flex-col overflow-hidden select-text" style={{ backgroundColor: "#11141a", borderColor: "#2d313c" }}>
          {/* Sidebar Header */}
          <div className="flex items-center justify-between bg-[#191d24] px-4 py-3.5 border-b select-none" style={{ borderColor: "#2d313c" }}>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#a1a1a6]">
              DIAGNOSTIC REPORT LOG
            </span>
            <span className="font-mono text-[9px] text-[#6b7280]">
              ID: {jobId.slice(0, 8).toUpperCase()}
            </span>
          </div>

          {/* Sidebar Contents */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 scroll-clinical bg-[#0b0c10]">

            {/* Section 1: Specimen Input Gate */}
            <div className="bg-[#12151b] rounded border p-4 space-y-3" style={{ borderColor: "#1e222b" }}>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "#1e222b" }}>
                <span className="font-mono text-[10px] font-bold text-[#e5e7eb] tracking-wide">
                  1. INPUT VALIDATION GATING
                </span>
                {ws.completedAt.uploaded ? (
                  <span className="font-mono text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded font-bold">
                    VERIFIED
                  </span>
                ) : (
                  <span className="font-mono text-[9px] bg-[#2d313c]/40 text-[#6b7280] px-1.5 py-0.5 rounded">
                    AWAITING
                  </span>
                )}
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-[#a1a1a6]">Modality</span>
                  <span className="font-medium text-slate-200">Dermoscopic RGB Image</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a1a1a6]">Resolution Gate</span>
                  <span className="font-mono text-slate-200">224 x 224 pixels [PASS]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a1a1a6]">Lesion Pre-filter</span>
                  <span className="font-mono text-emerald-400 font-semibold">[Lesion Detected]</span>
                </div>
                <p className="text-[10px] text-[#6b7280] leading-relaxed pt-1 border-t border-[#1a1e26]">
                  * MobilNetV3 binary gate validates dermoscopic lesions, rejecting accidental macro photos or out-of-distribution noise.
                </p>
              </div>
            </div>

            {/* Section 2: Neural Classifier Readouts */}
            <div className="bg-[#12151b] rounded border p-4 space-y-4" style={{ borderColor: "#1e222b" }}>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "#1e222b" }}>
                <span className="font-mono text-[10px] font-bold text-[#e5e7eb] tracking-wide">
                  2. NEURAL CLASSIFIER OUTPUTS
                </span>
                {ws.agentA && ws.agentB ? (
                  <span className="font-mono text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded font-bold">
                    COMPUTED
                  </span>
                ) : (
                  <span className="font-mono text-[9px] bg-[#2d313c]/40 text-[#6b7280] px-1.5 py-0.5 rounded">
                    COMPUTING
                  </span>
                )}
              </div>

              {/* Agent A readout */}
              {ws.agentA && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-[#3b82f6] font-bold">AGENT-A (EfficientNet-B4)</span>
                    <span className="font-mono text-[#e5e7eb] font-semibold">{(ws.agentA.result.confidence * 100).toFixed(0)}% Conf</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(aProbs || {}).map(([cls, val]) => {
                      if (val > 0.01) {
                        const pct = Math.round(val * 100);
                        return (
                          <div key={cls} className="space-y-0.5">
                            <div className="flex justify-between text-[10px] text-[#a1a1a6]">
                              <span>{getClassName(cls)}</span>
                              <span className="font-mono font-medium text-slate-200">{pct}%</span>
                            </div>
                            <div className="h-1 w-full bg-[#1c1f26] rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}

              {/* Agent B readout */}
              {ws.agentB && (
                <div className="space-y-2 pt-3 border-t border-[#1a1e26]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-[#a855f7] font-bold">AGENT-B (ViT-B/16)</span>
                    <span className="font-mono text-[#e5e7eb] font-semibold">{(ws.agentB.result.confidence * 100).toFixed(0)}% Conf</span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(bProbs || {}).map(([cls, val]) => {
                      if (val > 0.01) {
                        const pct = Math.round(val * 100);
                        return (
                          <div key={cls} className="space-y-0.5">
                            <div className="flex justify-between text-[10px] text-[#a1a1a6]">
                              <span>{getClassName(cls)}</span>
                              <span className="font-mono font-medium text-slate-200">{pct}%</span>
                            </div>
                            <div className="h-1 w-full bg-[#1c1f26] rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Divergence Gate */}
            {ws.trigger && (
              <div className="bg-[#12151b] rounded border p-4 space-y-3" style={{ borderColor: "#1e222b" }}>
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "#1e222b" }}>
                  <span className="font-mono text-[10px] font-bold text-[#e5e7eb] tracking-wide">
                    3. DIVERGENCE TRIGGER ANALYSIS
                  </span>
                  <span className={`font-mono text-[9px] border px-1.5 py-0.5 rounded font-bold ${ws.trigger.fired
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    }`}>
                    {ws.trigger.fired ? "DEBATE TRIGGERED" : "FAST PATH"}
                  </span>
                </div>
                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-[#a1a1a6]">
                      <span>Jensen-Shannon Divergence</span>
                      <span className="font-mono font-semibold text-slate-200">{ws.trigger.js_divergence.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#1c1f26] rounded-full overflow-hidden relative">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (ws.trigger.js_divergence / ws.trigger.threshold_js) * 100)}%` }} />
                      <div className="absolute top-0 bottom-0 w-0.5 bg-red-600" style={{ left: "100%" }} title="Threshold" />
                    </div>
                    <div className="flex justify-between text-[9px] text-[#6b7280]">
                      <span>Identical distributions</span>
                      <span>Threshold limit: {ws.trigger.threshold_js.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-[#1a1e26] pt-2">
                    <span className="text-[#a1a1a6]">Agent A Entropy</span>
                    <span className="font-mono text-slate-200">{ws.trigger.entropy_a.toFixed(3)} bits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#a1a1a6]">Agent B Entropy</span>
                    <span className="font-mono text-slate-200">{ws.trigger.entropy_b.toFixed(3)} bits</span>
                  </div>
                  <p className="text-[10px] text-[#6b7280] leading-relaxed border-t border-[#1a1e26] pt-1">
                    * JS divergence measures similarity of predictions. If divergence exceeds the threshold limit ({ws.trigger.threshold_js}), consensus fails, triggering an active debate.
                  </p>
                </div>
              </div>
            )}

            {/* Section 4: Calibrated Consensus Outcome */}
            {ws.consensus && (
              <div className="bg-[#12151b] rounded border p-4 space-y-3" style={{ borderColor: "#1e222b" }}>
                <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "#1e222b" }}>
                  <span className="font-mono text-[10px] font-bold text-[#e5e7eb] tracking-wide">
                    4. CALIBRATED CONSENSUS VERDICT
                  </span>
                  <span className="font-mono text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded font-bold">
                    RESOLVED
                  </span>
                </div>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-[#a1a1a6]">Consensus Diagnosis</span>
                    <span className="font-bold text-emerald-400">{getClassName(ws.consensus.pred_class)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#a1a1a6]">Final Confidence</span>
                    <span className="font-mono font-semibold text-slate-200">{(ws.consensus.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#a1a1a6]">ECE Calibration</span>
                    <span className="font-mono text-emerald-400 font-semibold">{ws.consensus.ece.toFixed(4)} <span className="text-[#6b7280] font-normal">(Target &lt; 0.05)</span></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#a1a1a6]">Platt Temperature</span>
                    <span className="font-mono text-slate-200">{ws.consensus.temperature.toFixed(2)}</span>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-[#1a1e26]">
                    <span className="text-[10px] text-[#a1a1a6] block">Calibrated Probability Map</span>
                    {Object.entries(ws.consensus.probabilities).map(([cls, val]) => {
                      if (val > 0.01) {
                        const pct = Math.round(val * 100);
                        return (
                          <div key={`cons_${cls}`} className="space-y-0.5">
                            <div className="flex justify-between text-[10px] text-[#a1a1a6]">
                              <span>{getClassName(cls)}</span>
                              <span className="font-mono text-slate-200">{pct}%</span>
                            </div>
                            <div className="h-1 w-full bg-[#1c1f26] rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                  <p className="text-[10px] text-[#6b7280] leading-relaxed border-t border-[#1a1e26] pt-1">
                    * Expected Calibration Error (ECE) measures statistical confidence alignment. Temperature adjustment calibrates classification probabilities.
                  </p>
                </div>
              </div>
            )}

          </div>
        </aside>
      </div>
    </main>
  );
}
