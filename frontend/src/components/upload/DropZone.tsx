"use client";

/**
 * DropZone — clean, sophisticated file upload zone.
 * Drag-and-drop or click to browse. Accepts JPEG / PNG ≤ 10 MB.
 */

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import clsx from "clsx";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

interface ImageDimensions {
  width: number;
  height: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function rejectionMessage(rejections: FileRejection[]): string | null {
  if (rejections.length === 0) return null;
  const error = rejections[0]?.errors[0];
  if (!error) return "This file could not be accepted.";
  switch (error.code) {
    case "file-too-large":   return "File exceeds 10 MB limit.";
    case "file-invalid-type": return "Only JPG or PNG images are accepted.";
    case "too-many-files":   return "Please upload one image at a time.";
    default:                 return error.message;
  }
}

export default function DropZone({ onFileSelected }: DropZoneProps): React.JSX.Element {
  const [acceptedFile, setAcceptedFile] = useState<File | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]): void => {
      const msg = rejectionMessage(rejections);
      if (msg) { setError(msg); setAcceptedFile(null); setDimensions(null); return; }
      const file = accepted[0];
      if (!file) return;
      setError(null);
      setAcceptedFile(file);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { setDimensions({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { setDimensions(null); URL.revokeObjectURL(url); };
      img.src = url;
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
    maxFiles: 1,
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
  });

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        {...getRootProps()}
        className={clsx(
          "relative w-full cursor-pointer overflow-hidden rounded-2xl",
          "border border-white/[0.07] bg-white/[0.02]",
          "transition-all duration-500 ease-out",
          isDragActive
            ? "border-indigo-400/50 shadow-[0_0_40px_rgba(99,102,241,0.18)] bg-indigo-500/[0.04] scale-[1.01]"
            : "hover:border-white/[0.14] hover:bg-white/[0.035] hover:shadow-[0_0_30px_rgba(255,255,255,0.04)]"
        )}
      >
        <input {...getInputProps()} />

        {/* Subtle dot-grid background */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Radial fade overlay — darkens edges */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)] pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center gap-5 px-10 py-16">

          {/* Upload icon with animated ring on drag */}
          <div className={clsx(
            "relative flex h-16 w-16 items-center justify-center rounded-full",
            "border border-white/10 bg-white/[0.04]",
            "transition-all duration-300",
            isDragActive && "border-indigo-400/40 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.25)]"
          )}>
            {/* Spinning ring on drag */}
            {isDragActive && (
              <div className="absolute inset-0 rounded-full border border-indigo-400/30 animate-spin" style={{ animationDuration: "3s" }} />
            )}
            <svg
              className={clsx("h-7 w-7 transition-colors duration-300", isDragActive ? "text-indigo-300" : "text-white/40")}
              fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>

          {/* Text */}
          <div className="flex flex-col items-center gap-2 text-center">
            <p className={clsx(
              "text-[15px] font-semibold tracking-tight transition-colors duration-300",
              isDragActive ? "text-indigo-200" : "text-white/80"
            )}>
              {isDragActive ? "Release to upload" : "Drop your image here"}
            </p>
            <p className="text-[13px] text-white/30">
              or <span className="text-white/55 underline underline-offset-2 decoration-white/20">click to browse</span>
            </p>
          </div>

          {/* Specs row */}
          <div className="flex items-center gap-3 mt-1">
            {["JPG / PNG", "Max 10 MB", "Dermoscopic"].map((tag, i) => (
              <span
                key={i}
                className="rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-white/25"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[12px] text-red-400/80 font-mono tracking-wide" role="alert">
          {error}
        </p>
      )}

      {/* Accepted file meta */}
      {acceptedFile && !error && (
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
          <svg className="h-3.5 w-3.5 text-emerald-400/70 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="font-mono text-[11px] text-white/40 truncate max-w-[180px]">{acceptedFile.name}</span>
          <span className="font-mono text-[11px] text-white/25">{formatBytes(acceptedFile.size)}</span>
          {dimensions && (
            <span className="font-mono text-[11px] text-white/25">{dimensions.width}×{dimensions.height}</span>
          )}
        </div>
      )}
    </div>
  );
}
