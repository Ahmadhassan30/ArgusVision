"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import DropZone from "@/components/upload/DropZone";
import ImagePreview from "@/components/upload/ImagePreview";
import LoadingOrbit from "@/components/ui/LoadingOrbit";
import WebGLBackground from "@/components/debate/WebGLBackground";
import { uploadImage } from "@/lib/api";
import { fileToDataUrl, storeJobImage } from "@/lib/sessionImage";
import { ISIC_CLASSES } from "@/lib/constants";

/** What the pipeline does, in the user's terms. */
const CAPABILITIES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Adversarial debate",
    body: "A CNN and a Vision Transformer analyze the lesion independently — and argue when they disagree.",
  },
  {
    title: "Spatial evidence",
    body: "Grad-CAM++ and attention rollout reveal exactly where each agent looked, and where they conflict.",
  },
  {
    title: "Calibrated consensus",
    body: "A calibrated fusion head resolves the debate into a temperature-scaled, ECE-reported verdict.",
  },
];

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = useCallback(
    (selected: File): void => {
      setError(null);
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    },
    [previewUrl],
  );

  const handleClear = useCallback((): void => {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [previewUrl]);

  const handleAnalyze = useCallback(async (): Promise<void> => {
    if (file === null || isUploading) return;
    setIsUploading(true);
    setError(null);
    try {
      // Capture the image for the debate page before uploading.
      let dataUrl: string | null = null;
      try {
        dataUrl = await fileToDataUrl(file);
      } catch {
        dataUrl = null;
      }
      const { job_id } = await uploadImage(file);
      if (dataUrl) storeJobImage(job_id, dataUrl);
      router.push(`/debate/${job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
      setIsUploading(false);
    }
  }, [file, isUploading, router]);

  return (
    <main className="bg-theatre relative min-h-screen w-full overflow-x-hidden">
      <WebGLBackground mode="idle" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pt-3 pb-8">

        {/* Hero */}
        <section className="flex flex-col items-center text-center pt-8 pb-12">
          <span className="animate-panel-enter font-mono text-[10px] font-medium uppercase tracking-[0.35em] text-indigo-300/60">
            Autonomous Neural Debate Protocol
          </span>
          <div 
            className="animate-panel-enter mt-8 mb-6 flex justify-center"
            style={{ animationDelay: "60ms" }}
          >
            <img
              src="/logo.png"
              alt="Argus Vision Logo"
              className="h-48 sm:h-64 md:h-80 w-auto object-contain drop-shadow-[0_0_35px_rgba(167,139,250,0.2)] transition-transform duration-500 hover:scale-[1.02]"
            />
          </div>
          <p
            className="animate-panel-enter mt-12 max-w-xl text-[14px] md:text-[15.5px] font-normal leading-relaxed text-indigo-200/70 tracking-wide font-body"
            style={{ animationDelay: "120ms" }}
          >
            <span className="font-semibold text-white">Argus Vision introduces the Argus Consensus Framework.</span> Two 
            state-of-the-art neural agents, each grounded in deep vision research, interrogate the same image independently, 
            debate their disagreements live, and converge on a calibrated verdict neither could reach alone.
          </p>

          {/* Upload */}
          <div className="mt-12 w-full max-w-lg">
            {file !== null && previewUrl !== null ? (
              <div className="flex flex-col items-center gap-6">
                <ImagePreview src={previewUrl} fileName={file.name} onClear={handleClear} />
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isUploading}
                  className="inline-flex items-center justify-center gap-3 rounded-xl bg-agent-a px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white shadow-glow-a transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 font-mono"
                >
                  {isUploading ? (
                    <>
                      <LoadingOrbit size={20} />
                      <span>processing_data</span>
                    </>
                  ) : (
                    <span>run_pipeline</span>
                  )}
                </button>
              </div>
            ) : (
              <DropZone onFileSelected={handleFileSelected} />
            )}
          </div>

          {error !== null && (
            <div
              role="alert"
              className="mt-6 w-full max-w-md rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 font-mono text-xs text-danger uppercase tracking-wide"
            >
              {error}
            </div>
          )}

          {/* Differential */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {ISIC_CLASSES.map((c) => (
              <span
                key={c.id}
                title={c.fullName}
                className="rounded-md border border-hairline bg-surface/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft hover:text-white hover:border-agent-b transition-all backdrop-blur-md"
              >
                {c.id}
              </span>
            ))}
          </div>
        </section>

        <footer className="mt-8 border-t border-hairline/40 pt-10 pb-6 relative overflow-hidden">
          {/* Watermark brand name */}
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/4 select-none whitespace-nowrap font-display font-black uppercase tracking-tighter text-white/[0.03]"
            style={{ fontSize: "clamp(80px, 14vw, 180px)" }}
            aria-hidden
          >
            Argus Vision
          </div>

          {/* Footer content */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            {/* Brand row */}
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="font-display text-2xl font-bold uppercase tracking-[0.12em] text-white/90">
                Argus Vision
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-indigo-300/50">
                Autonomous Neural Debate Protocol
              </span>
            </div>

            {/* Divider */}
            <div className="h-px w-24 bg-hairline/60" />

            {/* Credit */}
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="font-sans text-[12px] text-ink-soft/70">
                Researched &amp; developed by
              </span>
              <span className="font-display text-[15px] font-semibold tracking-wide text-white/80">
                Ahmad Hassan
              </span>
            </div>

            {/* Copyright */}
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-faint/40 mt-2">
              © {new Date().getFullYear()} Argus Vision — Research Prototype
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
