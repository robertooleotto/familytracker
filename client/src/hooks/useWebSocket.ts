import { useEffect, useRef, useCallback } from "react";
import { getSession } from "@/lib/auth";

type WsHandler = (event: { type: string; [key: string]: any }) => void;

export function useFamilyWebSocket(onEvent?: WsHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(onEvent);
  const reconnectDelayRef = useRef(1000); // Start with 1s
  const maxDelayRef = useRef(60000); // Max 60s

  handlerRef.current = onEvent;

  const resetBackoffDelay = useCallback(() => {
    reconnectDelayRef.current = 1000;
  }, []);

  const getNextDelay = useCallback((): number => {
    const delay = reconnectDelayRef.current;
    // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s (max)
    reconnectDelayRef.current = Math.min(delay * 2, maxDelayRef.current);
    return delay;
  }, []);

  const connect = useCallback(() => {
    const session = getSession();
    if (!session?.access_token) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "auth", token: session.access_token }));
      // Reset backoff delay on successful connection
      resetBackoffDelay();
    });

    ws.onmessage = (e) => {
      try { handlerRef.current?.(JSON.parse(e.data)); } catch {}
    };
    ws.onclose = () => {
      wsRef.current = null;
      const delay = getNextDelay();
      timerRef.current = setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
  }, [getNextDelay, resetBackoffDelay]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);
}
