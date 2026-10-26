import { create } from "zustand";
export const useUserStore = create((set) => ({
  status: null,               // /auth/status payload
  setStatus: (status) => set({ status }),
}));
