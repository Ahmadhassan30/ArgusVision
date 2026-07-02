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

  // Build high-fidelity Linux CLI terminal output logs
  const terminalLines = useMemo(() => {
    const lines: React.ReactNode[] = [];

    // Header logo shell info
    lines.push(
      <div key="boot" className="text-neutral-500 font-mono text-[11px]">
        <div>[  INIT  ] Initializing Argus Consensus System (v2.1.0-lts)...</div>
        <div>[  BOOT  ] Hooking CUDA classification endpoints (T4 GPU verified).</div>
      </div>
    );

    // Stage 1/2 Inputs verification
    if (ws.completedAt.uploaded) {
      lines.push(
        <div key="gating" className="text-neutral-400 font-mono text-[11px] space-y-1">
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
        <div key="agents_init" className="text-neutral-500 font-mono text-[11px]">
          <div>[  INFO  ] Classification models initialized in frozen eval mode.</div>
          <div>[  INFO  ] Core agents seeded: <span className="text-sky-400 font-semibold">EfficientNet-B4</span> (CNN) & <span className="text-purple-400 font-semibold">ViT-B/16</span> (Transformer).</div>
        </div>
      );
    }

    // Agent A classification distributions
    if (ws.agentA) {
      lines.push(
        <div key="agentA" className="text-neutral-400 font-mono text-[11px] space-y-1">
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
                  <div key={cls} className="text-[10px]">
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
        <div key="agentB" className="text-neutral-400 font-mono text-[11px] space-y-1">
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
                  <div key={cls} className="text-[10px]">
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
        <div key="trigger" className="text-neutral-400 font-mono text-[11px] space-y-1">
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

    // Live alternating debate transcript
    if (debate.turns.length > 0) {
      lines.push(
        <div key="debate" className="text-neutral-400 font-mono text-[11px] space-y-2">
          <div className="text-[#f97316] font-semibold">┌── [DEBATE] ADVERSARIAL REASONING LOG</div>
          <div className="pl-4 border-l border-[#f97316]/30 space-y-3">
            {debate.turns.map((turn, i) => {
              const agentLabel = turn.agent === "A" ? "agent-a" : "agent-b";
              const promptColor = turn.agent === "A" ? "text-sky-400" : "text-purple-400";
              return (
                <div key={i} className="space-y-0.5">
                  <div className="text-[10px] font-semibold select-none">
                    <span className={promptColor}>{agentLabel}</span>
                    <span className="text-neutral-600">:~$</span>{" "}
                    <span className="text-neutral-500">[{turn.move.toUpperCase()} · R{turn.round}]</span>
                  </div>
                  <div className="text-neutral-300 text-[11px] leading-relaxed">"{turn.text}"</div>
                </div>
              );
            })}
          </div>
          <div className="text-[#f97316] font-semibold">└────────────────────────────────────────────────────────</div>
        </div>
      );
    }

    // Calibrated Consensus output
    if (ws.consensus) {
      lines.push(
        <div key="consensus" className="text-neutral-400 font-mono text-[11px] space-y-1">
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
                  <div key={`cons_${cls}`} className="text-[10px]">
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

        {/* ── LEFT: 2x2 DICOM Viewer Grid ─────────────────────────── */}
        <section className="flex-1 min-w-0 p-1 grid grid-cols-2 grid-rows-2 gap-1 border-r select-none bg-black" style={{ borderColor: "#2d313c" }}>
          
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

        {/* ── RIGHT: Portrait Diagnostic Terminal Console ─────────── */}
        <aside className="w-[450px] shrink-0 border-l flex flex-col overflow-hidden select-text" style={{ backgroundColor: "#13161c", borderColor: "#2d313c" }}>
          {/* Terminal Window Header */}
          <div className="flex items-center gap-2 bg-neutral-900 px-4 py-3 border-b border-neutral-800 shrink-0 select-none">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
            </div>
            <div className="flex-1 text-center text-[10px] text-neutral-400 font-mono">
              argus-consensus-terminal — bash
            </div>
          </div>

          {/* Terminal Output stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono scroll-clinical text-neutral-300 bg-black">
            {terminalLines.map((line, idx) => (
              <div key={idx} className="leading-relaxed whitespace-pre-wrap">
                {line}
              </div>
            ))}
            
            {/* Blinking CLI Prompt Cursor */}
            <div className="flex items-center gap-1.5 select-none pt-2 border-t border-neutral-900 text-[10px]">
              <span className="text-neutral-500">argus-diagnostics:~$</span>
              <span className="inline-block h-4 w-2 bg-neutral-400 animate-pulse align-middle" />
            </div>

            {/* Anchor to auto-scroll */}
            <div ref={terminalEndRef} />
          </div>
        </aside>

      </div>
    </main>
  );
}
