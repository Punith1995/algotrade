/**
 * REST client for the backend.
 * Base URL: VITE_API_URL if set, otherwise the same host as the page on port 5000.
 */
const BASE = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:5000/api`;

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.reason || res.statusText);
  return body;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  loginUrl: `${BASE}/auth/login`,

  // connection
  authStatus: () => req("/auth/status"),

  // signals
  signals: () => req("/signals"),                       // intraday (5-min) engine rows
  swing: () => req("/signals/swing"),                   // swing (daily) engine rows
  signal: (symbol) => req(`/signals/${symbol}`),
  symbolHistory: (symbol) => req(`/signals/${symbol}/history`),
  signalHistory: (limit = 100) => req(`/signals/history?limit=${limit}`),
  longTerm: (symbol) => req(`/signals/long/${symbol}`),

  // market data
  search: (q) => req(`/stocks/search?q=${encodeURIComponent(q)}`),
  quotes: (symbols) => req(`/stocks/quotes${symbols?.length ? `?symbols=${symbols.join(",")}` : ""}`),
  candles: (symbol, tf = 5) => req(`/stocks/${symbol}/candles?tf=${tf}`),

  // watchlist
  watchlist: () => req("/watchlist"),
  addToWatchlist: (symbol) => req("/watchlist", json("POST", { symbol })),
  removeFromWatchlist: (symbol) => req(`/watchlist/${symbol}`, { method: "DELETE" }),
  bulkWatchlist: (count) => req("/watchlist/bulk", json("POST", { count })),
  resetWatchlist: () => req("/watchlist/reset", { method: "POST" }),
  seedStatus: () => req("/watchlist/seed-status"),

  // tracked (paper) trades — no orders are sent to Angel One
  positions: () => req("/positions"),
  todaySummary: () => req("/positions/summary/today"),
  trackTrade: (t) => req("/positions/track", json("POST", t)),
  closePosition: (id) => req(`/positions/${id}`, { method: "DELETE" }),

  // backtest
  backtestStatus: () => req("/backtest/status"),
  backtestRun: (body) => req("/backtest/run", json("POST", body)),

  // settings
  settings: () => req("/settings"),
  saveSettings: (s) => req("/settings", json("PUT", s)),
};
