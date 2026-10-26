/**
 * Long-term investment analysis — the SAME strategy as intraday and swing,
 * run on weekly candles (5 years, Yahoo chart API).
 *
 *   Technical gate : the strategy's six checks on weekly candles (EMA 20/50/200,
 *                    RSI 55–70 rising, MACD, breakout on volume, stop, risk)
 *   Fundamentals   : fundamentalsService (Yahoo, degrades gracefully)
 *   Verdict        : BUY when the strategy confirms; WAIT otherwise.
 */
const axios = require("axios");
const redis = require("../redis/redisClient");
const logger = require("../utils/logger");
const { getFundamentals } = require("./fundamentalsService");
const swing = require("./swingStrategy");

const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

/** Five years of weekly OHLCV candles, oldest first. */
async function weeklyCandles(symbol) {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?range=5y&interval=1wk`;
      const { data } = await axios.get(url, { timeout: 10000, headers: HEADERS });
      const r = data?.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      if (!r || !q) continue;
      const candles = r.timestamp
        .map((t, i) => ({
          time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0,
        }))
        .filter((c) => c.close != null && c.high != null && c.low != null);
      if (candles.length > 0) return candles;
    } catch { /* try next host */ }
  }
  return null;
}

function scoreFundamentals(f) {
  let s = 0; const notes = [];
  if (f.eps != null && f.eps > 0) { s += 15; notes.push("Profitable (positive EPS)"); } else notes.push("⚠ Negative or unknown EPS");
  if (f.pe != null && f.pe > 0 && f.pe < 40) { s += 15; notes.push(`Reasonable valuation — PE ${f.pe.toFixed(1)}`); }
  else if (f.pe != null && f.pe >= 40) notes.push(`⚠ Expensive — PE ${f.pe.toFixed(1)}`);
  if (f.roe != null && f.roe >= 15) { s += 20; notes.push(`Strong ROE ${f.roe}%`); }
  else if (f.roe != null) notes.push(`Modest ROE ${f.roe}%`);
  if (f.profitMargin != null && f.profitMargin >= 10) { s += 15; notes.push(`Healthy margins ${f.profitMargin}%`); }
  if (f.revenueGrowth != null && f.revenueGrowth >= 10) { s += 20; notes.push(`Revenue growing ${f.revenueGrowth}%`); }
  else if (f.revenueGrowth != null && f.revenueGrowth < 0) notes.push(`⚠ Revenue shrinking ${f.revenueGrowth}%`);
  if (f.debtToEquity != null && f.debtToEquity < 1) { s += 15; notes.push(`Low debt — D/E ${f.debtToEquity}`); }
  else if (f.debtToEquity != null && f.debtToEquity > 2) notes.push(`⚠ High debt — D/E ${f.debtToEquity}`);
  return { score: Math.min(s, 100), notes };
}

/** The strategy on weekly candles. Score = share of checks passed (0–100). */
function strategyLong(candles) {
  const d = swing.evaluate(candles, "LONG");
  return {
    ready: d.ready,
    signal: d.signal,
    score: d.ready ? Math.round((d.conditionsMet / d.conditionsTotal) * 100) : null,
    checks: d.checks,
    failedChecks: d.failedChecks,
    rejectionReason: d.rejectionReason,
    indicators: d.indicators,
    plan: d.risk || d.planPreview || null,
  };
}

async function analyze(symbol) {
  symbol = symbol.toUpperCase();
  const cached = await redis.get(`longterm:${symbol}`);
  if (cached) return cached;

  const out = { symbol, horizon: "LONG", fundamentals: null, strategy: null, combinedScore: null, verdict: "NO DATA", notes: [] };

  const candles = await weeklyCandles(symbol).catch((e) => { logger.warn(`[longterm] ${symbol}: ${e.message}`); return null; });
  if (candles) out.strategy = strategyLong(candles);
  else out.notes.push("Weekly price history unavailable for this symbol right now.");

  const f = await getFundamentals(symbol);
  if (f?.available) out.fundamentals = { ...f, ...scoreFundamentals(f) };
  else out.notes.push(f?.note || "Fundamental data unavailable — verdict uses the strategy only.");

  const tech = out.strategy?.score;
  const fund = out.fundamentals?.score;
  if (tech != null && fund != null) out.combinedScore = Math.round(tech * 0.5 + fund * 0.5);
  else if (tech != null) out.combinedScore = tech;
  else if (fund != null) out.combinedScore = fund;

  if (out.strategy?.ready) {
    if (out.strategy.signal === "BUY") {
      out.verdict = fund != null && fund < 40 ? "HOLD — strategy confirms, fundamentals weak" : "BUY";
    } else {
      out.verdict = `WAIT — ${out.strategy.rejectionReason || "strategy not confirmed"}`;
    }
  }

  await redis.set(`longterm:${symbol}`, out, 3600);
  return out;
}

module.exports = { analyze, weeklyCandles, strategyLong, scoreFundamentals };
