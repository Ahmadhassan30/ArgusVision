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

          {/* Upload Card */}
          <div className="mt-12 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0c0e17] p-6 text-left shadow-2xl">
            {/* Card Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-[17px] font-semibold text-white tracking-wide">
                  Upload the specimen
                </h3>
                <p className="text-[11px] text-[#52566b] mt-0.5 font-sans leading-relaxed">
                  Make sure the file format meets requirements. It must be .jpg, .jpeg, or .png.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClear}
                disabled={file === null}
                className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-[#52566b] hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Clear selected image"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Card Body */}
            <div className="min-h-[220px] flex items-center justify-center">
              {file !== null && previewUrl !== null ? (
                <div className="flex flex-col items-center gap-4 py-4 w-full">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-1.5 shadow-lg max-w-[200px]">
                    <img
                      src={previewUrl}
                      alt={file.name}
                      className="h-auto max-h-[160px] w-full rounded-lg object-contain"
                    />
                  </div>
                  <div className="text-center font-mono text-[10px] text-[#52566b] max-w-xs truncate">
                    {file.name}
                  </div>
                </div>
              ) : (
                <DropZone onFileSelected={handleFileSelected} />
              )}
            </div>

            {/* Card Footer */}
            <div className="flex items-center justify-end mt-6 border-t border-white/[0.05] pt-4">
              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={file === null || isUploading}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-[#52566b] hover:text-white/90 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={file === null || isUploading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white px-5 py-2 text-xs font-semibold shadow-lg shadow-blue-500/10 transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[#1a1c26] disabled:text-[#52566b] disabled:shadow-none"
                >
                  {isUploading ? (
                    <>
                      <LoadingOrbit size={14} />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Submit</span>
                  )}
                </button>
              </div>
            </div>
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
