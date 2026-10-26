const express = require("express");
const { isAuthenticated } = require("../config/broker");
const { getToken, getAllEquities, loadInstruments } = require("../services/instrumentService");
const marketData = require("../services/marketData");
const historical = require("../services/historicalDataService");
const quoteService = require("../services/quoteService");
const brokerAuth = require("../config/broker");

/** Friendly 401 instead of a crash when the daily Angel One login is missing. */
function requireBrokerAuth(req, res, next) {
  if (!brokerAuth.isAuthenticated()) {
    return res.status(401).json({ error: "Not logged in to Angel One — complete the daily login first", loginRequired: true });
  }
  next();
}
const strategy = require("../config/strategy");
const redis = require("../redis/redisClient");
const bootstrap = require("../bootstrap");

const router = express.Router();

/**
 * Live REST quotes for the watchlist (or ?symbols=A,B,C).
 * This is the source of ACTUAL market prices any time of day —
 * the frontend polls it every 5s and merges with WebSocket ticks.
 */
router.get("/quotes", async (req, res, next) => {
  try {
    if (!isAuthenticated()) return res.json([]);
    const symbols = req.query.symbols
      ? String(req.query.symbols).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : bootstrap.getWatchlist();
    // Cache-only: the internal 15 s poller keeps this fresh. Serving live
    // Angel One calls per browser poll caused rate-limit connection failures.
    res.json(quoteService.getCached(symbols));
  } catch (e) { next(e); }
});

/** Search NSE symbols — results enriched with live LTP. */
router.get("/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").toUpperCase();
    if (q.length < 2) return res.json([]);
    let all = getAllEquities();
    if (!all.length) { await loadInstruments(); all = getAllEquities(); }
    const matches = all
      .filter((i) => i.symbol.startsWith(q) || (i.name || "").toUpperCase().includes(q))
      .slice(0, 8);
    const quotes = await quoteService.getQuotes(matches.map((m) => m.symbol));
    const qmap = Object.fromEntries(quotes.map((x) => [x.symbol, x]));
    res.json(matches.map((m) => ({ ...m, ltp: qmap[m.symbol]?.ltp ?? null, change: qmap[m.symbol]?.change ?? null })));
  } catch (e) { next(e); }
});

router.get("/:symbol/candles", (req, res) => {
  const token = getToken(req.params.symbol.toUpperCase());
  if (!token) return res.status(404).json({ error: "Unknown symbol" });
  res.json(historical.getCandles(token, Number(req.query.tf) || strategy.TIMEFRAME));
});

/** Angel One portfolio/orders passthrough for the Portfolio + Orders pages. */
router.get("/portfolio/holdings", requireBrokerAuth, async (req, res, next) => {
  try { res.json(await marketData.holdings()); } catch (e) { next(e); }
});
router.get("/portfolio/positions", requireBrokerAuth, async (req, res, next) => {
  try { res.json(await marketData.positions()); } catch (e) { next(e); }
});
router.get("/orders", requireBrokerAuth, async (req, res, next) => {
  try { res.json(await marketData.orders()); } catch (e) { next(e); }
});

module.exports = router;
