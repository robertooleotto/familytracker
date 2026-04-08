/**
 * jscanify + OpenCV.js loader.
 *
 * Both libraries are large (~9 MB combined for OpenCV.js) so we lazy-load them
 * from CDN on first use rather than bundling. The first call to
 * `loadScanner()` returns a Promise that resolves once the global `cv` and
 * `jscanify` symbols are available; subsequent calls return the cached
 * instance immediately.
 *
 * Why CDN instead of npm:
 *   - The npm `opencv.js` distributions are not tree-shakable and are still
 *     ~9 MB. Loading from CDN keeps the main app bundle small and gives users
 *     who never use the scanner zero overhead.
 *   - The browser caches the script across sessions, so on second use it
 *     resolves instantly.
 */

const OPENCV_URL = "https://docs.opencv.org/4.8.0/opencv.js";
const JSCANIFY_URL = "https://cdn.jsdelivr.net/npm/jscanify@1.2.0/src/jscanify.min.js";

declare global {
  interface Window {
    cv?: any;
    jscanify?: any;
  }
}

let cached: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function waitForOpenCv(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) return resolve();
    const start = Date.now();
    const tick = () => {
      if (window.cv && window.cv.Mat) return resolve();
      if (Date.now() - start > 30_000) return reject(new Error("OpenCV.js timeout"));
      // OpenCV.js sets `cv` immediately but `cv.Mat` becomes available only
      // after its WASM module finishes initialising. It exposes an
      // `onRuntimeInitialized` hook we can hook into.
      if (window.cv && typeof window.cv.then === "function") {
        // newer builds expose `cv` as a Module-like Promise
        window.cv.then(() => resolve());
        return;
      }
      if (window.cv && "onRuntimeInitialized" in window.cv) {
        window.cv.onRuntimeInitialized = () => resolve();
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

export interface ScannerInstance {
  /** Returns a new canvas with the detected paper outline drawn on top. */
  highlightPaper(source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement): HTMLCanvasElement;
  /** Extracts the paper region and warps it to a flat rectangle of the given size. */
  extractPaper(source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement, width: number, height: number): HTMLCanvasElement;
}

/**
 * Resolve to a ready-to-use jscanify scanner. Safe to call repeatedly.
 */
export function loadScanner(): Promise<ScannerInstance> {
  if (cached) return cached;
  cached = (async () => {
    await loadScript(OPENCV_URL);
    await waitForOpenCv();
    await loadScript(JSCANIFY_URL);
    if (!window.jscanify) throw new Error("jscanify failed to load");
    // jscanify exports as a constructor on window
    // eslint-disable-next-line new-cap
    return new window.jscanify() as ScannerInstance;
  })();
  return cached;
}
