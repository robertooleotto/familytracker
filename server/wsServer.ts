import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { JWT_SECRET_VALUE } from "./config";

interface AuthPayload { profileId: string; familyId: string }
interface ClientInfo { ws: WebSocket; profileId: string; familyId: string }

const clients = new Map<WebSocket, ClientInfo>();

/**
 * WebSocket authentication uses a first-message handshake instead of a query-string
 * token, so the JWT is never exposed in server logs or browser history.
 *
 * Protocol:
 *   client → { type: "auth", token: "<JWT>" }
 *   server → { type: "connected", profileId: "..." }   (auth OK)
 *   server → close(4001, reason)                        (auth failed)
 *
 * All other messages received before authentication is complete are silently dropped.
 * The connection is closed after AUTH_TIMEOUT_MS if no valid auth message arrives.
 */
const AUTH_TIMEOUT_MS = 10_000;

export function setupWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let authenticated = false;

    // Close unauthenticated connections that never send the auth message
    const authTimer = setTimeout(() => {
      if (!authenticated) ws.close(4001, "Auth timeout");
    }, AUTH_TIMEOUT_MS);

    ws.on("message", (raw) => {
      // ── Pre-auth: only accept the { type: "auth", token } message ──────────
      if (!authenticated) {
        let msg: unknown;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        if (
          typeof msg !== "object" ||
          msg === null ||
          (msg as any).type !== "auth" ||
          typeof (msg as any).token !== "string"
        ) {
          return; // silently ignore unexpected messages
        }

        let payload: AuthPayload;
        try {
          payload = jwt.verify((msg as any).token, JWT_SECRET_VALUE) as AuthPayload;
        } catch {
          ws.close(4001, "Invalid token");
          clearTimeout(authTimer);
          return;
        }

        clearTimeout(authTimer);
        authenticated = true;
        clients.set(ws, { ws, profileId: payload.profileId, familyId: payload.familyId });
        ws.send(JSON.stringify({ type: "connected", profileId: payload.profileId }));
        return;
      }

      // ── Post-auth: forward to any registered message handlers (future use) ─
      // Currently the server is push-only; client messages are not processed.
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      clients.delete(ws);
    });
    ws.on("error", () => {
      clearTimeout(authTimer);
      clients.delete(ws);
    });
  });

  console.log("[WS] WebSocket server ready on /ws");
  return wss;
}

export function broadcastToFamily(
  familyId: string,
  event: { type: string; [key: string]: unknown },
  excludeProfileId?: string,
) {
  const payload = JSON.stringify(event);
  for (const [, client] of clients) {
    if (
      client.familyId === familyId &&
      client.profileId !== excludeProfileId &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(payload);
    }
  }
}
