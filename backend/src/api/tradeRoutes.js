/** Tracked-position endpoints — the "I took this trade" workflow. */
const express = require("express");
const positionTracker = require("../services/positionTracker");
const quoteService = require("../services/quoteService");
const orderService = require("../services/orderService");
const validate = require("../middleware/validate");
const { getIO } = require("../websocket/socketManager");

const router = express.Router();

/** Open positions with live P&L. */
router.get("/", (req, res) => {
  const out = positionTracker.list().map((p) => {
    const ltp = quoteService.get(p.symbol)?.ltp ?? null;
    return { ...p, ltp, ...(positionTracker.livePnl(p, ltp) || {}) };
  });
  res.json(out);
});

/** Today's realized P&L from closed tracked trades. */
router.get("/summary/today", (req, res) => {
  const tradeRepository = require("../database/repositories/tradeRepository");
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const trades = tradeRepository.all().filter((t) =>
    new Date(t.closedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === today);
  const pnl = +trades.reduce((s, t) => s + t.pnl, 0).toFixed(2);
  res.json({ trades: trades.length, wins: trades.filter((t) => t.pnl > 0).length,
             losses: trades.filter((t) => t.pnl < 0).length, pnl });
});

const orderService2 = require("../services/orderService");
const brokerAuth = require("../config/broker");

/** Whether one-click order buttons are armed (env flag + login). */
router.get("/oneclick/status", (req, res) => res.json({
  enabled: orderService2.oneClickEnabled(),
  authenticated: brokerAuth.isAuthenticated(),
}));

/** ONE CLICK: place entry (MARKET MIS) + exchange stop (SL-M), then track. */
router.post("/oneclick/place", async (req, res, next) => {
  try {
    const { symbol, side, qty, entry, stopLoss, target } = req.body;
    if (!symbol || !qty || !stopLoss) return res.status(400).json({ error: "symbol, qty, stopLoss required" });
    const result = await orderService2.placeOneClick({ symbol, side, qty: Number(qty), stopLoss });
    if (result.placed) {
      const pos = positionTracker.open({ symbol, horizon: "INTRADAY", entry, stopLoss, target, qty: Number(qty), source: "one-click" });
      result.position = pos;
    }
    res.json(result);
  } catch (e) { next(e); }
});

/** ONE CLICK: square off a tracked position at market. */
router.post("/oneclick/exit/:id", async (req, res, next) => {
  try {
    const pos = positionTracker.list().find((p) => p.id === req.params.id);
    if (!pos) return res.status(404).json({ error: "Position not found" });
    const result = await orderService2.squareOff({ symbol: pos.symbol, side: pos.side, qty: pos.qty });
    if (result.placed) {
      const quoteService2 = require("../services/quoteService");
      const ltp = quoteService2.get(pos.symbol)?.ltp ?? pos.entry;
      result.closed = positionTracker.close(pos.id, ltp, "One-click square-off");
    }
    res.json(result);
  } catch (e) { next(e); }
});

router.get("/autotrade", (req, res) => res.json({ armed: orderService.armed(), hardLock: process.env.ALLOW_AUTO_TRADE === "true" }));

/** Start tracking a manual trade — engine takes over SELL alerting. */
router.post("/track", validate({ symbol: "string" }), (req, res, next) => {
  try {
    const { symbol, horizon, entry, stopLoss, target, qty } = req.body;
    const pos = positionTracker.open({ symbol, horizon: String(horizon || "INTRADAY").toUpperCase(), entry, stopLoss, target, qty, source: "manual" });
    getIO()?.emit("position:update", positionTracker.list());
    res.json(pos);
  } catch (e) { next(e); }
});

/** Manually close (you exited yourself) — records P&L at current price. */
router.delete("/:id", (req, res, next) => {
  try {
    const open = positionTracker.list().find((p) => p.id === req.params.id);
    if (!open) return res.status(404).json({ error: "Position not found" });
    const ltp = quoteService.get(open.symbol)?.ltp ?? open.entry;
    const closed = positionTracker.close(req.params.id, ltp, "Closed manually from dashboard");
    getIO()?.emit("position:update", positionTracker.list());
    res.json(closed);
  } catch (e) { next(e); }
});

module.exports = router;
