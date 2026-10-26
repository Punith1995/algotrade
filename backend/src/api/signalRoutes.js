const express = require("express");
const scanner = require("../engine/scannerEngine");
const signalRepository = require("../database/repositories/signalRepository");
const tradeRepository = require("../database/repositories/tradeRepository");
const alertEngine = require("../engine/alertEngine");

const router = express.Router();

router.get("/", (req, res) => res.json(scanner.getLatestSignals()));
router.get("/history", (req, res) => res.json(signalRepository.recent(Number(req.query.limit) || 200)));
router.get("/analytics", (req, res) => {
  const stats = tradeRepository.stats();
  const dist = {};
  for (const s of signalRepository.recent(1000)) {
    const bucket = s.score == null ? "n/a" : `${Math.floor(s.score / 10) * 10}s`;
    dist[bucket] = (dist[bucket] || 0) + 1;
  }
  res.json({ ...stats, scoreDistribution: dist, trades: tradeRepository.all().slice(-100).reverse() });
});
/** Download all recorded trades as CSV (for your own records / tax / review). */
router.get("/analytics/export", (req, res) => {
  const rows = tradeRepository.all();
  const header = "symbol,side,entry,exit,qty,pnl,costs,netPnl,pnlPct,reason,source,openedAt,closedAt";
  const csv = [header, ...rows.map((t) => [
    t.symbol, t.side || "LONG", t.entry, t.exit, t.qty || 1, t.pnl, t.costs ?? "", t.netPnl ?? t.pnl, t.pnlPct,
    `"${(t.reason || "").replace(/"/g, "'")}"`, t.source || "",
    new Date(t.openedAt).toISOString(), new Date(t.closedAt).toISOString(),
  ].join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=trades.csv");
  res.send("\ufeff" + csv); // BOM: Excel-safe UTF-8
});

/** Preview today's auto-report (also sent automatically at 15:45 IST). */
/** Why each symbol was rejected on the last scan + today's top blocking gates. */
/** Full institutional metric set over closed trades. */
router.get("/analytics/full", (req, res) => {
  const ae = require("../services/analyticsEngine");
  const trades = require("../database/repositories/tradeRepository").all();
  const m = ae.metrics(trades);
  res.json({ ...m, selfOptimisation: ae.selfOptimise(m), monteCarlo: ae.monteCarlo(trades) });
});

router.get("/rejections", (req, res) => {
  const rejectionLog = require("../services/rejectionLog");
  res.json({ topGates: rejectionLog.topGates(8), recent: rejectionLog.all().slice(0, 60) });
});

router.get("/report/preview", (req, res) => {
  res.json({ report: require("../services/dailyReport").buildReport() });
});

router.get("/alerts", (req, res) => res.json(alertEngine.history(Number(req.query.limit) || 100)));

/** Which alert channels are configured (env-based). */
router.get("/alerts/channels", (req, res) => {
  const whatsapp = require("../alerts/whatsapp");
  const telegram = require("../alerts/telegram");
  res.json({ dashboard: true, whatsapp: whatsapp.configured(), telegram: telegram.configured() });
});

/** Fire a test alert through every configured channel. */
router.post("/alerts/test", async (req, res) => {
  const alertManager = require("../alerts/alertManager");
  const channels = await alertManager.sendRaw(
    "✅ Test alert from your AlgoTrade dashboard.\nIf you can read this on your phone, BUY/SELL alerts will arrive the same way.",
    { symbol: "TEST", signal: "TEST", time: Date.now() }
  );
  res.json({ sent: true, channels });
});
router.post("/alerts/test", async (req, res) => {
  try { res.json(await alertEngine.sendTest()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get("/swing", (req, res) => res.json(scanner.getSwingSignals()));
router.get("/long/:symbol", async (req, res, next) => {
  try { res.json(await scanner.analyzeLong(req.params.symbol.toUpperCase())); } catch (e) { next(e); }
});
router.get("/:symbol", (req, res) => {
  try { res.json(scanner.analyzeSymbol(req.params.symbol.toUpperCase())); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.get("/:symbol/history", (req, res) => res.json(signalRepository.bySymbol(req.params.symbol.toUpperCase())));

module.exports = router;
