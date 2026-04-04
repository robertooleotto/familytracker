import { useState, useEffect, useRef, useCallback } from "react";

export type DetectionEvent =
  | { type: "crash"; impactG: number; speedDrop: number }
  | { type: "fall"; impactG: number }
  | { type: "sound"; rms: number; label: string };

export type DetectionPhase = "monitoring" | "free_fall" | "impact";

const CRASH_G_THRESHOLD = 4.0;
const CRASH_SPEED_DROP = 20;
const FALL_SMV_FREE_FALL = 0.5;
const FALL_SMV_IMPACT = 3.0;
const FALL_TILT_DEG = 35;
const FALL_INACTIVITY_MS = 2500;
const SOUND_RMS_THRESHOLD = 0.25;
const SOUND_COOLDOWN_MS = 8000;

function getMagnitudeG(x: number, y: number, z: number) {
  return Math.sqrt(x * x + y * y + z * z) / 9.81;
}

function getTiltDeg(x: number, y: number, z: number) {
  const norm = Math.sqrt(x * x + y * y + z * z);
  return (Math.acos(Math.abs(z) / norm) * 180) / Math.PI;
}

// Fix #36: Stable callback ref to prevent useEffect re-subscribe loops
function useStableCallback<T extends (...args: any[]) => void>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((...args: any[]) => ref.current(...args), []) as any;
}

export function useCrashDetection(
  enabled: boolean,
  onDetected: (e: DetectionEvent) => void
) {
  const stableCb = useStableCallback(onDetected);
  const lastSpeedRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const lastEventRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      return;
    }

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => { lastSpeedRef.current = (pos.coords.speed ?? 0) * 3.6; },
        () => {},
        { enableHighAccuracy: true, maximumAge: 2000 }
      );
    }

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const g = getMagnitudeG(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0);
      const now = Date.now();
      if (g > CRASH_G_THRESHOLD && now - lastEventRef.current > 10000) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const currentSpeed = (pos.coords.speed ?? 0) * 3.6;
            const drop = lastSpeedRef.current - currentSpeed;
            if (drop > CRASH_SPEED_DROP) {
              lastEventRef.current = Date.now();
              stableCb({ type: "crash", impactG: g, speedDrop: drop });
            }
          },
          () => {
            if (lastSpeedRef.current > CRASH_SPEED_DROP) {
              lastEventRef.current = Date.now();
              stableCb({ type: "crash", impactG: g, speedDrop: lastSpeedRef.current });
            }
          },
          { timeout: 2000, maximumAge: 1000 }
        );
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [enabled, stableCb]);
}

export function useFallDetection(
  enabled: boolean,
  onDetected: (e: DetectionEvent) => void
) {
  const stableCb = useStableCallback(onDetected);
  const phaseRef = useRef<DetectionPhase>("monitoring");
  const tiltAtImpactRef = useRef(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSmvRef = useRef(1.0);
  const lastEventRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      phaseRef.current = "monitoring";
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      return;
    }

    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const x = acc.x ?? 0, y = acc.y ?? 0, z = acc.z ?? 0;
      const smv = getMagnitudeG(x, y, z);
      const tilt = getTiltDeg(x, y, z);
      const now = Date.now();

      if (phaseRef.current === "monitoring") {
        if (smv < FALL_SMV_FREE_FALL && lastSmvRef.current > 0.8) {
          phaseRef.current = "free_fall";
          setTimeout(() => {
            if (phaseRef.current === "free_fall") phaseRef.current = "monitoring";
          }, 1200);
        }
      } else if (phaseRef.current === "free_fall") {
        if (smv > FALL_SMV_IMPACT) {
          phaseRef.current = "impact";
          tiltAtImpactRef.current = tilt;
          inactivityTimerRef.current = setTimeout(() => {
            if (phaseRef.current === "impact" && now - lastEventRef.current > 12000) {
              if (tiltAtImpactRef.current > FALL_TILT_DEG) {
                lastEventRef.current = Date.now();
                stableCb({ type: "fall", impactG: smv });
              }
            }
            phaseRef.current = "monitoring";
          }, FALL_INACTIVITY_MS);
        }
      } else if (phaseRef.current === "impact") {
        if (smv > 1.5) {
          phaseRef.current = "monitoring";
          if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        }
      }

      lastSmvRef.current = smv;
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [enabled, stableCb]);
}

export function useSoundDetection(
  enabled: boolean,
  onDetected: (e: DetectionEvent) => void
) {
  const stableCb = useStableCallback(onDetected);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number | null>(null);
  const lastEventRef = useRef(0);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const stopMic = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  }, []);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      setMicPermission("granted");
      return true;
    } catch {
      setMicPermission("denied");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || micPermission !== "granted" || !analyserRef.current) return;

    const bufLen = analyserRef.current.frequencyBinCount;
    const buf = new Float32Array(bufLen);

    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getFloatTimeDomainData(buf);
      let rms = 0;
      for (let i = 0; i < bufLen; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / bufLen);

      if (rms > SOUND_RMS_THRESHOLD && Date.now() - lastEventRef.current > SOUND_COOLDOWN_MS) {
        lastEventRef.current = Date.now();
        stableCb({ type: "sound", rms, label: rms > 0.5 ? "urlo intenso" : "suono forte" });
      }
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [enabled, micPermission, stableCb]);

  useEffect(() => {
    if (!enabled) stopMic();
  }, [enabled, stopMic]);

  return { micPermission, requestMic, stopMic };
}
