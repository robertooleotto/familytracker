/**
 * DocumentScanner — full-screen camera UI that detects a paper document in
 * the live preview, lets the user capture it, then perspective-corrects and
 * cleans up the image (Dropbox / CamScanner style).
 *
 * Powered by jscanify + OpenCV.js, both lazy-loaded from CDN on first use.
 *
 * Usage:
 *   <DocumentScanner
 *     open={open}
 *     onCancel={() => setOpen(false)}
 *     onCapture={(file) => { ... save the File somewhere ... }}
 *   />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, RotateCcw, Check, Loader2, ImageIcon } from "lucide-react";
import { loadScanner, type ScannerInstance } from "@/lib/scanner";

interface DocumentScannerProps {
  open: boolean;
  onCancel: () => void;
  onCapture: (file: File) => void;
  /** Suggested filename without extension. Defaults to `scan-<timestamp>`. */
  filenameHint?: string;
}

type Phase = "loading" | "camera" | "preview" | "error";

export function DocumentScanner({ open, onCancel, onCapture, filenameHint }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scannerRef = useRef<ScannerInstance | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        setPhase("loading");
        scannerRef.current = await loadScanner();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setPhase("camera");
        startDetectionLoop();
      } catch (e: any) {
        console.error("[scanner] init failed", e);
        if (!cancelled) {
          setErrorMessage(
            e?.name === "NotAllowedError"
              ? "Permesso fotocamera negato. Abilitalo dalle impostazioni del browser."
              : e?.message ?? "Impossibile avviare la fotocamera",
          );
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopEverything() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }

  // ─── Live detection loop ────────────────────────────────────────────────────
  const startDetectionLoop = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const scanner = scannerRef.current;
    if (!video || !overlay || !scanner) return;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      if (!video.videoWidth) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Match overlay canvas to video size
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      try {
        const highlighted = scanner.highlightPaper(video);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.drawImage(highlighted, 0, 0, overlay.width, overlay.height);
      } catch {
        // jscanify throws when no paper is found — that's fine, just clear.
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ─── Capture & cleanup ──────────────────────────────────────────────────────
  function captureFrame(): HTMLCanvasElement | null {
    const video = videoRef.current;
    const scanner = scannerRef.current;
    if (!video || !scanner) return null;
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    off.width = video.videoWidth;
    off.height = video.videoHeight;
    const offCtx = off.getContext("2d");
    if (!offCtx) return null;
    offCtx.drawImage(video, 0, 0, off.width, off.height);

    // A4 ratio at sane resolution. Falls back to source dims if extraction fails.
    const targetWidth = 1240;
    const targetHeight = 1754;
    try {
      return scanner.extractPaper(off, targetWidth, targetHeight);
    } catch (e) {
      console.warn("[scanner] no paper detected, returning raw frame", e);
      return off;
    }
  }

  function applyScanLook(canvas: HTMLCanvasElement): HTMLCanvasElement {
    // Increase contrast + slight desaturation so the result reads like a scan
    // rather than a photo. We avoid full B/W threshold so colour stamps and
    // signatures stay legible.
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const contrast = 1.25;
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < d.length; i += 4) {
      // Slight desaturation: blend each channel toward luma
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const mix = 0.25;
      let r = d[i] * (1 - mix) + luma * mix;
      let g = d[i + 1] * (1 - mix) + luma * mix;
      let b = d[i + 2] * (1 - mix) + luma * mix;
      r = Math.max(0, Math.min(255, r * contrast + intercept));
      g = Math.max(0, Math.min(255, g * contrast + intercept));
      b = Math.max(0, Math.min(255, b * contrast + intercept));
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  async function handleShutter() {
    const raw = captureFrame();
    if (!raw) return;
    const cleaned = applyScanLook(raw);
    cleaned.toBlob(
      (blob) => {
        if (!blob) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("preview");
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      },
      "image/jpeg",
      0.92,
    );
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setPhase("camera");
    startDetectionLoop();
  }

  function handleConfirm() {
    if (!previewBlob) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const base = filenameHint?.trim() || `scan-${ts}`;
    const file = new File([previewBlob], `${base}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onCancel(); // close
  }

  /** Allow uploading from gallery as fallback if camera permission denied. */
  function handlePickFromGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    onCapture(f);
    onCancel();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="document-scanner">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <button
          onClick={onCancel}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          data-testid="button-scanner-cancel"
          aria-label="Annulla"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-medium">
          {phase === "preview" ? "Anteprima" : "Scansiona documento"}
        </h2>
        <div className="w-9" />
      </div>

      {/* Body */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {phase === "loading" && (
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm opacity-80">Avvio fotocamera…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-4 text-white max-w-sm text-center px-6">
            <p className="text-sm">{errorMessage}</p>
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium">
              <ImageIcon className="w-4 h-4" />
              Scegli dalla galleria
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePickFromGallery}
                data-testid="input-scanner-gallery"
              />
            </label>
            <Button variant="ghost" onClick={onCancel} className="text-white">Chiudi</Button>
          </div>
        )}

        {(phase === "camera" || phase === "preview") && (
          <>
            {phase === "camera" && (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  playsInline
                  muted
                />
                <canvas
                  ref={overlayRef}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              </>
            )}
            {phase === "preview" && previewUrl && (
              <img src={previewUrl} alt="Anteprima" className="max-w-full max-h-full object-contain" />
            )}
          </>
        )}
      </div>

      {/* Footer controls */}
      <div className="p-6 flex items-center justify-center gap-8">
        {phase === "camera" && (
          <button
            onClick={handleShutter}
            className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            data-testid="button-scanner-shutter"
            aria-label="Scatta"
          >
            <Camera className="w-7 h-7 text-black" />
          </button>
        )}
        {phase === "preview" && (
          <>
            <button
              onClick={handleRetake}
              className="flex flex-col items-center gap-1 text-white"
              data-testid="button-scanner-retake"
            >
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <span className="text-xs">Riprendi</span>
            </button>
            <button
              onClick={handleConfirm}
              className="flex flex-col items-center gap-1 text-white"
              data-testid="button-scanner-confirm"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500 shadow-lg flex items-center justify-center active:scale-95 transition-transform">
                <Check className="w-7 h-7" />
              </div>
              <span className="text-xs">Usa questa</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
