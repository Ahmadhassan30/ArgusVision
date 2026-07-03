"use client";

/**
 * DropZone — clean, high-fidelity drag & drop area matching the reference design.
 * Features a custom 3D-style file document SVG icon with an upload badge overlay.
 */

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import clsx from "clsx";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

export default function DropZone({ onFileSelected }: DropZoneProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]): void => {
      if (rejections.length > 0) {
        const err = rejections[0]?.errors[0];
        if (err?.code === "file-too-large") setError("File size exceeds 10 MB limit.");
        else if (err?.code === "file-invalid-type") setError("Only JPG or PNG images are accepted.");
        else setError(err?.message || "This file could not be accepted.");
        return;
      }
      const file = accepted[0];
      if (!file) return;
      setError(null);
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
    <div className="flex w-full flex-col gap-3">
      <div
        {...getRootProps()}
        className={clsx(
          "w-full cursor-pointer rounded-xl border border-dashed text-center transition-all duration-300",
          isDragActive
            ? "border-indigo-500 bg-indigo-500/[0.02]"
            : "border-white/10 bg-white/[0.01] hover:bg-white/[0.02] hover:border-white/20"
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center justify-center px-6 py-12">
          
          {/* Custom 3D-Style Document Icon with Upload Badge Overlay */}
          <div className="relative mb-5 flex justify-center items-center">
            <svg width="84" height="90" viewBox="0 0 84 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)]">
              <defs>
                <linearGradient id="docGradient" x1="10" y1="10" x2="68" y2="80" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#2e3558" />
                  <stop offset="100%" stopColor="#17192a" />
                </linearGradient>
                <linearGradient id="foldGradient" x1="52" y1="10" x2="68" y2="26" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#454f85" />
                  <stop offset="100%" stopColor="#262b49" />
                </linearGradient>
                <linearGradient id="badgeGradient" x1="16" y1="58" x2="50" y2="71" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
                <linearGradient id="uploadGradient" x1="48" y1="56" x2="80" y2="88" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
                <filter id="badgeShadow" x="42" y="50" width="44" height="44" filterUnits="userSpaceOnUse">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.4"/>
                </filter>
              </defs>

              {/* Document Base Shape */}
              <path d="M10 16 C10 12.6863 12.6863 10 16 10 H52 L68 26 V74 C68 77.3137 65.3137 80 62 80 H16 C12.6863 80 10 77.3137 10 74 V16 Z" fill="url(#docGradient)" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />

              {/* Document Fold Flap */}
              <path d="M52 10 V20 C52 23.3137 54.6863 26 58 26 H68 L52 10 Z" fill="url(#foldGradient)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

              {/* Document Mock Content Lines */}
              <rect x="18" y="34" width="22" height="3" rx="1.5" fill="white" opacity="0.08" />
              <rect x="18" y="42" width="34" height="3" rx="1.5" fill="white" opacity="0.08" />
              <rect x="18" y="50" width="28" height="3" rx="1.5" fill="white" opacity="0.08" />

              {/* Capsule Badge (like .PDF in reference, here labeled .IMG) */}
              <rect x="16" y="58" width="34" height="13" rx="6.5" fill="url(#badgeGradient)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.75" />
              <text x="33" y="67.5" fill="white" fontFamily="system-ui, sans-serif" fontSize="7.5" fontWeight="800" textAnchor="middle" letterSpacing="0.5">.IMG</text>

              {/* Circular Upload Badge Overlay */}
              <g filter="url(#badgeShadow)">
                <circle cx="64" cy="72" r="14" fill="url(#uploadGradient)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                <path d="M64 66 V78 M60 71 L64 66 L68 71" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </svg>
          </div>

          <h3 className="text-white text-[16px] font-semibold tracking-wide">
            {isDragActive ? "Release image here" : "Drag & Drop"}
          </h3>
          <p className="text-white/40 text-[12px] mt-1 font-sans">
            or <span className="text-[#3b82f6] hover:underline underline-offset-2">choose a file</span>
          </p>

          <p className="text-white/20 text-[10px] mt-6 tracking-wide font-sans">
            Maximum file size 10MB
          </p>
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-red-400 font-mono tracking-wide mt-1 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
