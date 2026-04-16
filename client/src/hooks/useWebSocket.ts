import { useEffect, useRef, useCallback } from "react";
import { getSession } from "@/lib/auth";

type WsHandler = (event: { type: string; [key: string]: any }) => void;

export function useFamilyWebSocket(onEvent?: WsHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const connect = useCallback(() => {
    const session = getSession();
    if (!session?.token) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${session.token}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try { handlerRef.current?.(JSON.parse(e.data)); } catch {}
    };
    ws.onclose = () => {
      wsRef.current = null;
      timerRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);
}
