/** Singleton Socket.IO client — resilient reconnection, backs off gently. */
import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(URL, {
      transports: ["websocket", "polling"],   // fall back to polling if WS is blocked
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 20000,
    });
    socket.on("connect", () => console.log("[socket] connected", socket.id));
    socket.on("disconnect", (r) => console.warn("[socket] disconnected:", r));
    socket.on("reconnect_attempt", (n) => { if (n % 5 === 0) console.warn("[socket] reconnecting…", n); });
  }
  return socket;
}
