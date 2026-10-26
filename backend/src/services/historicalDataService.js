/**
 * Fetches historical candles from Angel One. If the account is not entitled to
 * history (a clear permission error), it switches to building candles from
 * live ticks and reports that honestly on /api/auth/status.
 */
const marketData = require("./marketData");
const candleBuilder = require("./candleBuilder");

let hasHist = String(process.env.HAS_HISTORICAL_SUBSCRIPTION ?? "true").toLowerCase() !== "false";
let histError = null;
const TF_MAP = { 1: "1", 5: "5", 15: "15" };

async function bootstrap(token, timeframe = 5, days = 10) {
  if (!hasHist) return { source: "ticks", seeded: 0 };
  try {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const data = await marketData.history(token, TF_MAP[timeframe] || "5", from, to);
    candleBuilder.seed(token, timeframe, data);
    return { source: "historical_api", seeded: data.length };
  } catch (err) {
    const msg = err?.message || String(err);
    if (/permission|not subscribed|not enabled|forbidden|403/i.test(msg)) {
      hasHist = false;
      histError = "Angel One historical data is not enabled for this account. Falling back to live-tick candles.";
      console.warn("[historical] " + histError);
    } else {
      console.warn(`[historical] Fetch failed for ${token}: ${msg}`);
    }
    return { source: "ticks", seeded: 0, error: msg };
  }
}

function getCandles(token, timeframe = 5, includeLive = true) {
  return candleBuilder.getCandles(token, timeframe, includeLive);
}

function isEnabled() { return hasHist; }
function getError() { return histError; }

module.exports = { bootstrap, getCandles, isEnabled, getError, get HAS_HIST() { return hasHist; } };
