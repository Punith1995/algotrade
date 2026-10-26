import { create } from "zustand";

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.stop(ctx.currentTime + 0.4);
  } catch { /* audio blocked until first user interaction — fine */ }
}

let muted = false;
try { muted = localStorage.getItem("alerts_muted") === "1"; } catch {}

export const useNotificationStore = create((set, get) => ({
  toasts: [],        // currently visible (max 3)
  history: [],       // last 50, powers the bell panel
  unread: 0,
  muted,

  add: (n) => {
    const item = { id: Date.now() + Math.random(), time: Date.now(), ...n };
    set((st) => ({
      toasts: [...st.toasts, item].slice(-3),          // never more than 3 on screen
      history: [item, ...st.history].slice(0, 50),
      unread: st.unread + 1,
    }));
    if (!get().muted && (n.kind === "entry" || n.kind === "exit")) beep();
    setTimeout(() => get().dismiss(item.id), 8000);     // auto-dismiss
  },
  dismiss: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
  markRead: () => set({ unread: 0 }),
  toggleMute: () => set((st) => {
    const m = !st.muted;
    try { localStorage.setItem("alerts_muted", m ? "1" : "0"); } catch {}
    return { muted: m };
  }),
}));
