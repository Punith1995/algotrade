/**
 * Real-price quote service (fixes "price difference" + "no price on add/search").
 *
 * Live WebSocket ticks only flow during market hours; a freshly added
 * symbol has no price until its first tick. This service fetches the
 * ACTUAL last traded price + prev-close change via Angel One quotes
 * (included in the Rs.500 plan) every POLL_MS for the whole watchlist
 * + NIFTY 50, caches it, and broadcasts it on the same "ticks" socket
 * channel — so every price chip shows the real market price at all times.
 */
const brokerAuth = require("../config/broker");
const marketData = require("./marketData");
const { getToken, getSymbol, NIFTY50_TOKEN } = require("./instrumentService");
const logger = require("../utils/logger");

const POLL_MS = 10000; // fresher off-tick prices; the global limiter keeps Angel One safe
const cache = new Map();      // SYMBOL -> quote item
const listeners = [];
let timer = null;
let warned = false;

function onQuotes(cb) { listeners.push(cb); }
function get(symbol) { return cache.get(symbol.toUpperCase()) || null; }

function toItem(key, v) {
  const symbol = getSymbol(key);
  const prevClose = v.ohlc?.close;
  return {
    symbol,
    ltp: v.last_price,
    change: prevClose ? +(((v.last_price - prevClose) / prevClose) * 100).toFixed(2) : null,
    volume: v.volume_traded ?? v.volume ?? null,
    ohlc: v.ohlc || null,
    time: Date.now(),
    source: "quote",
  };
}

const CHUNK = 50; // Angel One quotes: max 50 symbols per call

// ---- Rate-limit protection ----
// Angel One allows ~1 quote request/second. Without a throttle, every browser
// tab polling + search + the internal poller stack up, Angel One starts
// rejecting, and the WebSocket suffers too — the classic "connection
// failure every minute". All live fetches now go through one mutex with
// a minimum 2.5 s gap; everything else reads the cache.
let fetchChain = Promise.resolve();
let lastFetchAt = 0;
const MIN_GAP_MS = 2500;

function throttled(fn) {
  const run = async () => {
    const wait = Math.max(0, lastFetchAt + MIN_GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return fn();
  };
  fetchChain = fetchChain.then(run, run);
  return fetchChain;
}

/** Cache read — NEVER hits Angel One. This is what the UI polls. */
function getCached(symbols) {
  if (!symbols || !symbols.length) return [...cache.values()];
  return symbols.map((s) => cache.get(String(s).toUpperCase())).filter(Boolean);
}

async function refresh(symbols) {
  const syms = [...new Set(symbols)].filter(Boolean);
  if (!syms.length) return [];
  return throttled(() => doRefresh(syms));
}

async function doRefresh(syms) {
  const keys = syms.map((s) => getToken(s)).filter(Boolean);
  keys.push(NIFTY50_TOKEN);
  if (!brokerAuth.isAuthenticated()) return [];
  const out = [];
  try {
    for (let i = 0; i < keys.length; i += CHUNK) {
      const q = await marketData.quotes(keys.slice(i, i + CHUNK));
      for (const [k, v] of Object.entries(q)) out.push(toItem(k, v));
      if (keys.length > CHUNK) await new Promise((r) => setTimeout(r, 350)); // respect rate limits
    }
    for (const item of out) cache.set(item.symbol, item);
    for (const cb of listeners) cb(out);
    warned = false;
    return out;
  } catch (e) {
    if (!warned) { logger.warn("[quotes]", e.message); warned = true; }
    return out;
  }
}

function start(getSymbols) {
  if (timer) return;
  const tick = () => refresh(getSymbols());
  tick();
  timer = setInterval(tick, POLL_MS);
  logger.info(`[quotes] Real-price polling every ${POLL_MS / 1000}s (works outside market hours too)`);
}

/** Fetch fresh quotes and return them (array of items). */
async function getQuotes(symbols) { return refresh(symbols); }

/** Convenience map: SYMBOL -> last traded price. */
async function getLTPs(symbols) {
  const items = await refresh(symbols);
  return Object.fromEntries(items.map((i) => [i.symbol, i.ltp]));
}

module.exports = { start, refresh, get, getCached, getQuotes, getLTPs, onQuotes };
