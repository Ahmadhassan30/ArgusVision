"use client";

/**
 * FeyCards — interactive fanning card stack inspired by Fey.com and Aceternity UI.
 *
 * Stacks three diagnostic cards (Agent A, Consensus with big image, Agent B)
 * which fan out beautifully on hover using Framer Motion. Shows predictions,
 * confidence values, and a central specimen representation.
 */

import { motion } from "framer-motion";
import { AGENT_A, AGENT_B, getClassMeta, RISK_COLORS } from "@/lib/constants";
import type { ConsensusResult } from "@/types/debate";

interface FeyCardsProps {
  aProbs: Record<string, number> | null;
  aConf: number;
  aClass: string | null;
  bProbs: Record<string, number> | null;
  bConf: number;
  bClass: string | null;
  consensus: ConsensusResult | null;
  sourceImage: string | null;
  triggerFired: boolean | null;
}

export default function FeyCards({
  aProbs,
  aConf,
  aClass,
  bProbs,
  bConf,
  bClass,
  consensus,
  sourceImage,
  triggerFired,
}: FeyCardsProps): React.JSX.Element {
  
  const metaA = aClass ? getClassMeta(aClass) : null;
  const metaB = bClass ? getClassMeta(bClass) : null;
  const metaC = consensus ? getClassMeta(consensus.pred_class) : null;

  // Animation variants for fanning cards on hover
  const cardVariants = {
    cardA: {
      idle: { x: -30, y: 15, rotate: -8, scale: 0.92, zIndex: 5 },
      hover: { x: -150, y: -5, rotate: -14, scale: 1, zIndex: 15 }
    },
    cardConsensus: {
      idle: { x: 0, y: 0, rotate: 0, scale: 1, zIndex: 10 },
      hover: { x: 0, y: -25, rotate: 0, scale: 1.06, zIndex: 25 }
    },
    cardB: {
      idle: { x: 30, y: 15, rotate: 8, scale: 0.92, zIndex: 5 },
      hover: { x: 150, y: -5, rotate: 14, scale: 1, zIndex: 15 }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* Interactive Hover Container */}
      <motion.div
        className="relative flex items-center justify-center w-[460px] h-[240px] cursor-pointer"
        initial="idle"
        whileHover="hover"
      >
        {/* ── CARD A: CNN Classifier (Left) ── */}
        <motion.div
          variants={cardVariants.cardA}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
          className="absolute w-[180px] h-[210px] rounded-lg border p-3 flex flex-col justify-between shadow-lg"
          style={{ backgroundColor: "#0d0d0f", borderColor: "#2563eb" }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 border-b pb-1" style={{ borderColor: "#1a1a24" }}>
              <img src="/effnet.png" alt="EffNet" className="h-5 w-5 rounded-full object-cover" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#9ca3af]">CNN Classifier</span>
            </div>
            {aClass ? (
              <div className="mt-1">
                <div className="font-mono text-[8px] text-[#6b7280]">PREDICTION</div>
                <div className="text-xs font-semibold text-white truncate">{metaA?.fullName || aClass}</div>
                <span
                  className="inline-block mt-1 rounded px-1.5 py-0.5 font-mono text-[8px] font-bold text-white"
                  style={{ backgroundColor: metaA ? RISK_COLORS[metaA.risk] : AGENT_A.color }}
                >
                  {aClass}
                </span>
              </div>
            ) : (
              <span className="text-[10px] font-mono text-slate-500 animate-pulse mt-2">ANALYZING SPECIMEN...</span>
            )}
          </div>
          <div className="flex justify-between items-end border-t pt-1.5" style={{ borderColor: "#1a1a24" }}>
            <span className="font-mono text-[8px] text-[#6b7280]">CONFIDENCE</span>
            <span className="font-mono text-xs font-bold text-[#2563eb]">{(aConf * 100).toFixed(0)}%</span>
          </div>
        </motion.div>

        {/* ── CARD B: ViT Classifier (Right) ── */}
        <motion.div
          variants={cardVariants.cardB}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
          className="absolute w-[180px] h-[210px] rounded-lg border p-3 flex flex-col justify-between shadow-lg"
          style={{ backgroundColor: "#0d0d0f", borderColor: "#7c3aed" }}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 border-b pb-1" style={{ borderColor: "#1a1a24" }}>
              <img src="/vit.png" alt="ViT" className="h-5 w-5 rounded-full object-cover" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#9ca3af]">ViT Classifier</span>
            </div>
            {bClass ? (
              <div className="mt-1">
                <div className="font-mono text-[8px] text-[#6b7280]">PREDICTION</div>
                <div className="text-xs font-semibold text-white truncate">{metaB?.fullName || bClass}</div>
                <span
                  className="inline-block mt-1 rounded px-1.5 py-0.5 font-mono text-[8px] font-bold text-white"
                  style={{ backgroundColor: metaB ? RISK_COLORS[metaB.risk] : AGENT_B.color }}
                >
                  {bClass}
                </span>
              </div>
            ) : (
              <span className="text-[10px] font-mono text-slate-500 animate-pulse mt-2">ANALYZING SPECIMEN...</span>
            )}
          </div>
          <div className="flex justify-between items-end border-t pt-1.5" style={{ borderColor: "#1a1a24" }}>
            <span className="font-mono text-[8px] text-[#6b7280]">CONFIDENCE</span>
            <span className="font-mono text-xs font-bold text-[#7c3aed]">{(bConf * 100).toFixed(0)}%</span>
          </div>
        </motion.div>

        {/* ── CARD CONSENSUS: Calibrated Fusion (Center - lifts above others) ── */}
        <motion.div
          variants={cardVariants.cardConsensus}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="absolute w-[200px] h-[230px] rounded-lg border p-3 flex flex-col justify-between shadow-2xl"
          style={{
            backgroundColor: "#08090d",
            borderColor: consensus ? "#059669" : "#2d313c"
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: "#1a1a24" }}>
              <span className="font-mono text-[8px] font-bold text-[#059669]">CONSENSUS STUDY</span>
              <span className="font-mono text-[7px] text-[#6b7280]">ECE ADAPTIVE</span>
            </div>

            {/* Representational big image of specimen in the center card */}
            <div className="h-20 w-full overflow-hidden rounded border relative my-1 bg-black flex items-center justify-center" style={{ borderColor: "#1a1a1f" }}>
              {sourceImage ? (
                <img src={sourceImage} alt="Specimen Preview" className="h-full w-full object-cover opacity-85" />
              ) : (
                <span className="font-mono text-[8px] text-slate-600">NO LOCALIZER IMAGE</span>
              )}
              {triggerFired !== null && (
                <div
                  className="absolute bottom-1 right-1 px-1 rounded font-mono text-[6px] font-semibold"
                  style={{
                    backgroundColor: triggerFired ? "#fbbf2422" : "#05966922",
                    color: triggerFired ? "#fbbf24" : "#059669",
                    border: `1px solid ${triggerFired ? "#fbbf2440" : "#05966940"}`
                  }}
                >
                  {triggerFired ? "DEBATE" : "FAST PATH"}
                </div>
              )}
            </div>

            {consensus ? (
              <div className="leading-tight">
                <div className="font-mono text-[8px] text-[#6b7280]">CALIBRATED OUTCOME</div>
                <div className="text-xs font-bold text-[#e5e7eb] truncate">{metaC?.fullName || consensus.pred_class}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold text-white"
                    style={{ backgroundColor: metaC ? RISK_COLORS[metaC.risk] : "#059669" }}
                  >
                    {consensus.pred_class}
                  </span>
                  <span className="font-mono text-[8px] text-[#6b7280]">
                    ECE {consensus.ece.toFixed(3)}
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-[10px] font-mono text-slate-500 animate-pulse text-center mt-3">AWAITING DECISION RESOLUTION</span>
            )}
          </div>

          <div className="flex justify-between items-end border-t pt-1.5" style={{ borderColor: "#1a1a24" }}>
            <span className="font-mono text-[8px] text-[#6b7280]">FINAL CONFIDENCE</span>
            <span className="font-mono text-sm font-bold text-[#059669]">
              {consensus ? `${(consensus.confidence * 100).toFixed(0)}%` : "0%"}
            </span>
          </div>
        </motion.div>
      </motion.div>
      
      {/* Help tooltip */}
      <span className="font-mono text-[8px] text-slate-500 tracking-wider mt-2 select-none uppercase">
        Hover card deck to expand diagnostic details
      </span>
    </div>
  );
}
