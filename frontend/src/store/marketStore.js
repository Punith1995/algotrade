import { create } from "zustand";
export const useMarketStore = create((set) => ({
  prices: {},          // SYMBOL -> { ltp, change, volume, ohlc, time, source }
  snapshot: null,
  applyTicks: (ticks) => set((st) => {
    const prices = { ...st.prices };
    for (const t of ticks) {
      const prev = prices[t.symbol];
      // A REST quote never overwrites a live tick that's under 10s old
      if (prev && prev.source === "live" && t.source === "quote" && Date.now() - prev.time < 10000) continue;
      prices[t.symbol] = t;
    }
    return { prices };
  }),
  setSnapshot: (snapshot) => set({ snapshot }),
}));
