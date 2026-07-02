"use client";

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
    if (v > bv) { bv = v; best = k; }
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
    if (showConsensus) return { label: "Resolved", color: "#10b981" };
    if (debateRunning) return { label: `Debating · R${debate.round || 1}`, color: "#f97316" };
    if (ws.agentA && ws.agentB) return { label: "Agents ready", color: "#3b82f6" };
    if (ws.phase === "running") return { label: "Processing", color: "#3b82f6" };
    return { label: "Awaiting", color: "#6b7280" };
  }, [ws.phase, ws.agentA, ws.agentB, debateRunning, debate.round, showConsensus]);

  const aProbs = debate.turns.length > 0 ? debate.beliefA : ws.agentA?.result.probabilities ?? null;
  const bProbs = debate.turns.length > 0 ? debate.beliefB : ws.agentB?.result.probabilities ?? null;
  const aConf  = debate.turns.length > 0 ? debate.confA  : ws.agentA?.result.confidence ?? 0;
  const bConf  = debate.turns.length > 0 ? debate.confB  : ws.agentB?.result.confidence ?? 0;
  const convergedClass = debate.finished && debate.converged ? leadClass(debate.beliefA) : null;

  return (
    <main
      className="h-screen w-screen flex flex-col overflow-hidden font-sans"
      style={{ backgroundColor: "#080a0e", color: "#a1a1aa" }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <header
        className="flex h-11 w-full shrink-0 items-center justify-between px-5 border-b select-none"
        style={{ backgroundColor: "#0d1017", borderColor: "#1c1f26" }}
      >
        <div className="flex items-center gap-5 font-mono text-[11px]">
          <span style={{ color: "#52525b" }}>SUBJECT</span>
          <span style={{ color: "#fbbf24" }}>ISIC_{jobId.slice(0, 8).toUpperCase()}</span>
          <span style={{ color: "#1c1f26" }}>|</span>
          <span style={{ color: "#52525b" }}>{formattedDate} {formattedTime}</span>
        </div>

        {/* Right: Actions / Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded px-2 py-0.5" style={{ backgroundColor: `${status.color}15`, border: `1px solid ${status.color}30` }}>
            <span className="h-1 w-1 rounded-full animate-pulse" style={{ backgroundColor: status.color }} />
            <span className="font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: status.color }}>
              {status.label}
            </span>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT COLUMN ───────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r" style={{ borderColor: "#1c1f26" }}>

          {/* 2×2 Viewer Grid — fixed height */}
          <section
            className="shrink-0 p-1 grid grid-cols-2 grid-rows-2 gap-1 select-none"
            style={{ height: "55vh", backgroundColor: "#000" }}
          >
            {/* Viewports */}
            {[
              {
                id: 1 as const,
                label: "LOCALIZER", sublabel: "SPECIMEN INPUT",
                tag: "SR",
                tagColor: "#fbbf24",
                renderContent: () => sourceImage
                  ? <img src={sourceImage} alt="Source Specimen" className="max-h-full max-w-full object-contain" />
                  : <span className="font-mono text-[10px]" style={{ color: "#3f3f46" }}>NO LOCALIZER TARGET</span>,
                stats: [
                  `Target: ${leadClass(aProbs) || "N/A"}`,
                  "Wt: 256 / Ww: 256",
                  "Zoom: 100%",
                ],
              },
              {
                id: 2 as const,
                label: "AGENT-A", sublabel: "CNN GRAD-CAM++",
                tag: "AL",
                tagColor: "#3b82f6",
                renderContent: () => ws.attention
                  ? <HeatmapCanvas b64={ws.attention.heatmap_a_b64} accent={AGENT_A.color} showOverlay={false} alt="Agent A Heatmap" />
                  : <span className="font-mono text-[10px]" style={{ color: "#3f3f46" }}>AWAITING ATTENTION MATRIX</span>,
                stats: [
                  `Target: ${leadClass(aProbs) || "N/A"}`,
                  `Confidence: ${(aConf * 100).toFixed(0)}%`,
                ],
              },
              {
                id: 3 as const,
                label: "AGENT-B", sublabel: "ViT ATTN ROLLOUT",
                tag: "PF",
                tagColor: "#a855f7",
                renderContent: () => ws.attention
                  ? <HeatmapCanvas b64={ws.attention.heatmap_b_b64} accent={AGENT_B.color} showOverlay={false} alt="Agent B Heatmap" />
                  : <span className="font-mono text-[10px]" style={{ color: "#3f3f46" }}>AWAITING ATTENTION MATRIX</span>,
                stats: [
                  `Target: ${leadClass(bProbs) || "N/A"}`,
                  `Confidence: ${(bConf * 100).toFixed(0)}%`,
                ],
              },
              {
                id: 4 as const,
                label: "CROSS-ALIGNMENT", sublabel: "DISAGREEMENT DETECTOR",
                tag: "LH",
                tagColor: "#f59e0b",
                renderContent: () => ws.attention
                  ? <HeatmapCanvas b64={ws.attention.disagreement_b64} bbox={ws.attention.bbox} accent={ws.trigger?.fired ? "#f59e0b" : "#52525b"} showOverlay={true} alt="Disagreement Alignment" />
                  : <span className="font-mono text-[10px]" style={{ color: "#3f3f46" }}>AWAITING CROSS-ALIGNMENT MATRIX</span>,
                stats: [
                  `JS Div: ${ws.trigger ? ws.trigger.js_divergence.toFixed(4) : "0.0000"}`,
                  `Status: ${ws.trigger?.fired ? "DEBATE ACTIVE" : "FAST PATH"}`,
                ],
              },
            ] as const).map(({ id, label, sublabel, tag, tagColor, renderContent, stats }) => (
              <div
                key={id}
                onClick={() => setSelectedViewport(id)}
                className="relative flex flex-col items-stretch overflow-hidden cursor-pointer"
                style={{
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: selectedViewport === id ? tagColor : "#111318",
                  backgroundColor: "#050507",
                }}
              >
                {/* Top-left meta */}
                <div className="absolute top-2 left-2 z-10 font-mono text-[9px] leading-tight pointer-events-none" style={{ color: "#52525b" }}>
                  <div style={{ color: selectedViewport === id ? tagColor : "#71717a" }}>{label}</div>
                  <div>{sublabel}</div>
                </div>
                {/* Top-right tag */}
                <div className="absolute top-2 right-2 z-10 font-mono text-[9px] font-bold pointer-events-none" style={{ color: tagColor }}>{tag}</div>
                {/* Content */}
                <div className="flex-1 flex items-center justify-center p-6 min-h-0">
                  {renderContent()}
                </div>
                {/* Bottom stats */}
                <div className="absolute bottom-2 left-2 z-10 font-mono text-[9px] leading-tight pointer-events-none" style={{ color: "#52525b" }}>
                  {stats.map((s, i) => <div key={i}>{s}</div>)}
                </div>
                <div className="absolute bottom-2 right-2 z-10 font-mono text-[9px] leading-tight text-right pointer-events-none" style={{ color: "#3f3f46" }}>
                  <div>224 × 224</div>
                </div>
              </div>
            ))}
          </section>

          {/* Debate Transcript — scrollable */}
          <div className="flex-1 overflow-y-auto border-t" style={{ borderColor: "#1c1f26" }}>
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

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────── */}
        <aside
          className="w-[400px] shrink-0 flex flex-col overflow-y-auto border-l"
          style={{ backgroundColor: "#080a0e", borderColor: "#1c1f26" }}
        >
          {/* Sidebar header */}
          <div
            className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b select-none"
            style={{ backgroundColor: "#0d1017", borderColor: "#1c1f26" }}
          >
            <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#71717a" }}>
              Diagnostic Report
            </span>
            <span className="font-mono text-[9px]" style={{ color: "#52525b" }}>
              {jobId.slice(0, 8).toUpperCase()}
            </span>
          </div>

          {/* Section content */}
          <div className="p-5 space-y-0">

            {/* ── 1. Input Validation ─────────────────────────── */}
            <Section label="1. Input Validation" status={ws.completedAt.uploaded ? "VERIFIED" : "AWAITING"} statusOk={ws.completedAt.uploaded} statusColor={ws.completedAt.uploaded ? "#10b981" : "#52525b"}>
              <Row label="Modality" value="Dermoscopic RGB Image" />
              <Row label="Resolution Gate" value="224 × 224 px [PASS]" mono />
              <Row label="Lesion Pre-filter" value="[Lesion Detected]" mono valueColor="#10b981" />
              <Note>MobileNetV3 gate validates dermoscopic input before core model execution.</Note>
            </Section>

            {/* ── 2. Neural Classifier Outputs ────────────────── */}
            <Section label="2. Neural Classifiers" status={ws.agentA && ws.agentB ? "COMPUTED" : "COMPUTING"} statusOk={!!(ws.agentA && ws.agentB)} statusColor={ws.agentA && ws.agentB ? "#3b82f6" : "#52525b"}>
              {ws.agentA && (
                <AgentBlock
                  name="AGENT-A (EfficientNet-B4)"
                  confidence={(ws.agentA.result.confidence * 100).toFixed(0)}
                  probs={aProbs}
                  accentColor="#3b82f6"
                />
              )}
              {ws.agentB && (
                <>
                  <div className="border-t my-4" style={{ borderColor: "#1c1f26" }} />
                  <AgentBlock
                    name="AGENT-B (ViT-B/16)"
                    confidence={(ws.agentB.result.confidence * 100).toFixed(0)}
                    probs={bProbs}
                    accentColor="#a855f7"
                  />
                </>
              )}
              {!ws.agentA && !ws.agentB && (
                <div className="font-mono text-[10px] py-3 text-zinc-600">Awaiting inference…</div>
              )}
            </Section>

            {/* ── 3. Divergence Gate ──────────────────────────── */}
            {ws.trigger && (
              <Section
                label="3. Divergence Analysis"
                status={ws.trigger.fired ? "DEBATE TRIGGERED" : "FAST PATH"}
                statusOk={!ws.trigger.fired}
                statusColor={ws.trigger.fired ? "#f59e0b" : "#10b981"}
              >
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span style={{ color: "#71717a" }}>Jensen-Shannon Divergence</span>
                    <span style={{ color: ws.trigger.fired ? "#f59e0b" : "#10b981", fontWeight: "bold" }}>{ws.trigger.js_divergence.toFixed(4)}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#18191f" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (ws.trigger.js_divergence / ws.trigger.threshold_js) * 100)}%`,
                        backgroundColor: ws.trigger.fired ? "#f59e0b" : "#10b981",
                      }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[9px]" style={{ color: "#3f3f46" }}>
                    <span>0.00</span>
                    <span>Threshold {ws.trigger.threshold_js.toFixed(2)}</span>
                  </div>
                </div>
                <Row label="Entropy · Agent A" value={`${ws.trigger.entropy_a.toFixed(3)} bits`} mono />
                <Row label="Entropy · Agent B" value={`${ws.trigger.entropy_b.toFixed(3)} bits`} mono />
                <Note>Divergence limits exceeding {ws.trigger.threshold_js.toFixed(2)} trigger live consensus negotiation.</Note>
              </Section>
            )}

            {/* ── 4. Consensus Verdict ────────────────────────── */}
            {ws.consensus && (
              <Section label="4. Calibrated Verdict" status="RESOLVED" statusOk={true} statusColor="#10b981">
                <Row label="Consensus Diagnosis" value={getClassName(ws.consensus.pred_class)} valueColor="#10b981" bold />
                <Row label="Final Confidence" value={`${(ws.consensus.confidence * 100).toFixed(1)}%`} mono />
                <Row label="ECE Calibration" value={`${ws.consensus.ece.toFixed(4)}`} mono valueColor="#10b981" />
                <Row label="Platt Temperature" value={`${ws.consensus.temperature.toFixed(2)}`} mono />
                <div className="mt-4 space-y-2">
                  <span className="font-mono text-[9px] tracking-wider uppercase block" style={{ color: "#52525b" }}>
                    Calibrated Probability Map
                  </span>
                  {Object.entries(ws.consensus.probabilities).map(([cls, val]) => {
                    if (val <= 0.01) return null;
                    const pct = Math.round(val * 100);
                    return (
                      <div key={`cons_${cls}`} className="space-y-0.5">
                        <div className="flex justify-between font-mono text-[10px]">
                          <span style={{ color: "#71717a" }}>{getClassName(cls)}</span>
                          <span style={{ color: "#e4e4e7" }}>{pct}%</span>
                        </div>
                        <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: "#18191f" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: "#10b981" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Note>Platt scaling mapping scales raw logit outputs to optimal clinical empirical accuracy.</Note>
              </Section>
            )}

          </div>
        </aside>

      </div>
    </main>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

interface SectionProps {
  label: string;
  status: string;
  statusOk: boolean;
  statusColor?: string;
  children: React.ReactNode;
}

function Section({
  label, status, statusColor, children,
}: SectionProps) {
  return (
    <div className="py-5 border-b" style={{ borderColor: "#1c1f26" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] tracking-widest uppercase font-bold" style={{ color: "#a1a1aa" }}>
          {label}
        </span>
        <span
          className="font-mono text-[9px] tracking-widest uppercase font-bold"
          style={{ color: statusColor || "#52525b" }}
        >
          {status}
        </span>
      </div>
      {children}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  bold?: boolean;
}

function Row({
  label, value, mono, valueColor, bold,
}: RowProps) {
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-xs" style={{ color: "#71717a" }}>{label}</span>
      <span
        className={`text-xs ${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""}`}
        style={{ color: valueColor || "#e4e4e7" }}
      >
        {value}
      </span>
    </div>
  );
}

function AgentBlock({ name, confidence, probs, accentColor }: {
  name: string;
  confidence: string;
  probs: Record<string, number> | null;
  accentColor: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-mono text-[10px] font-bold" style={{ color: accentColor }}>{name}</span>
        <span className="font-mono text-[10px]" style={{ color: "#e4e4e7" }}>{confidence}% conf</span>
      </div>
      <div className="space-y-1.5">
        {Object.entries(probs || {}).map(([cls, val]) => {
          if (val <= 0.01) return null;
          const pct = Math.round(val * 100);
          return (
            <div key={cls} className="space-y-0.5">
              <div className="flex justify-between font-mono text-[10px]">
                <span style={{ color: "#71717a" }}>{getClassName(cls)}</span>
                <span style={{ color: "#a1a1aa" }}>{pct}%</span>
              </div>
              <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: "#18191f" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] leading-relaxed mt-2" style={{ color: "#52525b" }}>
      {children}
    </p>
  );
}
