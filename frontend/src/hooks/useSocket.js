import { useEffect } from "react";
import { getSocket } from "../services/socket";
import { api } from "../services/api";
import { useMarketStore } from "../store/marketStore";
import { useSignalStore } from "../store/signalStore";

/**
 * Mount once (in MainLayout): pipes socket events into the stores, and
 * polls REST quotes every 10s as a safety net — so REAL prices show even
 * if the WebSocket drops or the market is closed.
 */
export function useSocketBridge() {
  const applyTicks = useMarketStore((s) => s.applyTicks);
  const setScan = useSignalStore((s) => s.setScan);
  const setEvent = useSignalStore((s) => s.setEvent);
  const setSetup = useSignalStore((s) => s.setSetup);
  const setLadder = useSignalStore((s) => s.setLadder);

  useEffect(() => {
    const socket = getSocket();
    const onTicks = (t) => applyTicks(t);
    const onScan = (p) => setScan(p.results, p.marketOpen);
    const onNew = (sig) => setEvent(sig);
    const onSetup = (s) => setSetup(s);
    const onLadder = (l) => setLadder({ ...l, _t: Date.now() });
    // throttle: batch ticks and flush 2×/sec — live prices, calm re-renders
    let tickBuffer = null;
    const flush = setInterval(() => { if (tickBuffer) { onTicks(tickBuffer); tickBuffer = null; } }, 500);
    socket.on("ticks", (t) => { tickBuffer = t; });
    socket.on("scanner:update", onScan);
    socket.on("signal:new", onNew);
    socket.on("setup:new", onSetup);
    socket.on("position:ladder", onLadder);

    // REST quote fallback — served from the backend's cache (zero Angel One
    // load), paused when the tab is hidden to keep everything light.
    const poll = () => {
      if (document.hidden) return;
      api.quotes().then((q) => q.length && applyTicks(q)).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 20000);

    return () => {
      clearInterval(flush);
      socket.off("ticks", onTicks); socket.off("scanner:update", onScan);
      socket.off("signal:new", onNew); socket.off("setup:new", onSetup); socket.off("position:ladder", onLadder);
      clearInterval(id);
    };
  }, []);
}

/** Live price map: SYMBOL -> { ltp, change, volume, ohlc, source } */
export function useLivePrices() {
  return useMarketStore((s) => s.prices);
}
