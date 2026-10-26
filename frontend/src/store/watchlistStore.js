import { create } from "zustand";
import { api } from "../services/api";
export const useWatchlistStore = create((set) => ({
  symbols: [],
  load: async () => set({ symbols: await api.watchlist() }),
  add: async (symbol) => set({ symbols: await api.addToWatchlist(symbol) }),
  remove: async (symbol) => set({ symbols: await api.removeFromWatchlist(symbol) }),
}));
