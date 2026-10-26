/**
 * Universe Scanner — scores ALL ~2200 NSE equities, no candles needed.
 *
 * Streaming candles for 2200 symbols is impossible (socket + memory), so
 * this uses the professional two-stage funnel:
 *   Stage 1 (this file): batched REST quotes — 500 symbols per getQuote
 *     call — scored 0–100 on momentum, day-VWAP position, range position,
 *     gap follow-through, order-book imbalance and liquidity.
 *   Stage 2: the top 50 with score ≥ 80 become the watchlist, where the
 *     full candle-level 8-gate engine takes over.
 */
const { isAuthenticated } = require("../config/broker");
const marketData = require("./marketData");
const { getAllSymbols, loadInstruments, getSymbol } = require("./instrumentService");
const { LARGE, LARGEMID, MIDSMALL, classify } = require("../config/capSegments");
const logger = require("../utils/logger");

const BATCH = 500;
const MIN_PRICE = 20;          // skip penny stocks
const MIN_TURNOVER = 5e7;      // ₹5 crore day turnover — liquidity floor

let lastScan = { time: null, scanned: 0, qualified: 0, results: [] };
let scanning = false;
let progress = { done: 0, total: 0 };

/** Score one quote 0–100 for its STRONGER direction. */
function quoteScore(symbol, q) {
  const ltp = q.last_price, ohlc = q.ohlc;
  if (!ltp || !ohlc?.close || !ohlc?.open) return null;
  const prevClose = ohlc.close;
  const chg = ((ltp - prevClose) / prevClose) * 100;
  const range = (ohlc.high - ohlc.low) || 0.0001;
  const posInRange = Math.min(Math.max((ltp - ohlc.low) / range, 0), 1);  // 1 = at day high
  const vwap = q.average_traded_price || q.average_price || null;
  const vol = q.volume_traded ?? q.volume ?? 0;
  const turnover = ltp * vol;

  let bull = 0, bear = 0;
  bull += Math.min(Math.max(chg, 0) * 8, 25);          // momentum up (capped)
  bear += Math.min(Math.max(-chg, 0) * 8, 25);         // momentum down
  if (vwap) { if (ltp > vwap) bull += 20; else bear += 20; }   // day-VWAP side
  bull += posInRange * 20; bear += (1 - posInRange) * 20;      // closing near high/low
  if (ohlc.open > prevClose && ltp > ohlc.open) bull += 10;    // gap-up holding
  if (ohlc.open < prevClose && ltp < ohlc.open) bear += 10;    // gap-down holding
  const tb = q.buy_quantity ?? q.total_buy_quantity, ts = q.sell_quantity ?? q.total_sell_quantity;
  if (tb && ts) { const imb = tb / (tb + ts); bull += imb * 15; bear += (1 - imb) * 15; }

  const liquid = turnover >= MIN_TURNOVER && ltp >= MIN_PRICE;
  const side = bull >= bear ? "LONG" : "SHORT";
  let score = Math.round(Math.max(bull, bear) + (liquid ? 10 : 0));
  if (!liquid) score = Math.min(score, 60);            // illiquid can never qualify

  return { symbol, segment: classify(symbol), score: Math.min(score, 100), side, changePct: +chg.toFixed(2), ltp, turnover: Math.round(turnover), volume: vol };
}

async function scan(segment = "large") {
  segment = String(segment || "large").toLowerCase();
  if (!isAuthenticated()) throw Object.assign(new Error("Not logged in to Angel One — complete the daily login first"), { status: 401 });
  if (scanning) return lastScan;
  scanning = true;
  try {
    // Symbols come from the instrument list already loaded at login —
    // previously every refresh re-downloaded the ~7 MB dump from Angel One.
    let all = getAllSymbols();
    if (!all.length) { await loadInstruments(); all = getAllSymbols(); }
    all = all.filter((s) => !/-/.test(s)); // skip BE/BZ etc. series
    // Segment filter: mid/small caps (default), large caps, or the full market
    if (segment === "midsmall") { const set = new Set(MIDSMALL); all = all.filter((s) => set.has(s)); }
    else if (segment === "largemid") { const set = new Set(LARGEMID); all = all.filter((s) => set.has(s)); }
    else if (segment === "large") { const set = new Set(LARGE); all = all.filter((s) => set.has(s)); }
    const symbols = all.map((s) => `NSE:${s}-EQ`);
    const totalBatches = Math.ceil(symbols.length / BATCH);
    progress = { done: 0, total: symbols.length };
    logger.info(`[universe] Scanning ${symbols.length} NSE equities in ${totalBatches} rate-limited batches…`);

    const results = [];
    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      let quotes = null;
      for (let attempt = 1; attempt <= 2 && !quotes; attempt++) {
        try { quotes = await marketData.quotes(batch); }      // queued + spaced inside marketData
        catch (e) {
          logger.warn(`[universe] Batch ${i / BATCH + 1} attempt ${attempt} failed: ${e.message}`);
          if (attempt === 1) await new Promise((r) => setTimeout(r, 2500));
        }
      }
      if (quotes) {
        for (const [key, q] of Object.entries(quotes)) {
          const item = quoteScore(getSymbol(key), q);
          if (item) results.push(item);
        }
      }
      progress.done = Math.min(i + BATCH, symbols.length);
    }

    results.sort((a, b) => b.score - a.score);
    const qualified = results.filter((r) => r.score >= 80);
    lastScan = { time: Date.now(), segment, scanned: results.length, qualified: qualified.length, results: results.slice(0, 200) };
    logger.info(`[universe] Done — ${results.length} scored, ${qualified.length} at 80+`);
    return lastScan;
  } finally { scanning = false; }
}

/**
 * Top N with score ≥ minScore, optionally restricted to a cap segment:
 * segment = "midsmall" (MID+SMALL), "mid", "small", "large", or null (all).
 * Fills from the best-ranked of the same segment if fewer qualify.
 */
function topPicks(n = 50, minScore = 80, segment = null) {
  const inSeg = (r) => {
    if (!segment) return true;
    const s = segment.toLowerCase();
    if (s === "midsmall") return r.segment === "MID" || r.segment === "SMALL";
    return r.segment.toLowerCase() === s;
  };
  const pool = lastScan.results.filter(inSeg);
  const qualified = pool.filter((r) => r.score >= minScore).slice(0, n).map((r) => ({ ...r, qualified: true }));
  if (qualified.length >= n) return qualified;
  const fill = pool.filter((r) => r.score < minScore).slice(0, n - qualified.length).map((r) => ({ ...r, qualified: false }));
  return [...qualified, ...fill];
}

function getLastScan() { return { ...lastScan, progress, scanning }; }
function isScanning() { return scanning; }

module.exports = { scan, topPicks, getLastScan, isScanning, quoteScore };
