import { create } from "zustand";
export const useSignalStore = create((set) => ({
  signals: [],
  marketOpen: null,
  lastEvent: null,   // BUY/SELL state change
  lastSetup: null,   // ORB/breakout/reversal/swing hit
  lastLadder: null,  // target-level hit on a tracked position
  setScan: (results, marketOpen) => set({ signals: results, marketOpen }),
  setEvent: (sig) => set({ lastEvent: sig }),
  setSetup: (setup) => set({ lastSetup: setup }),
  setLadder: (l) => set({ lastLadder: l }),
}));
