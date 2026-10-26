/** Long-term investment analysis: fundamentals + 5y technicals + intraday view. */
const express = require("express");
const longTermService = require("../services/longTermService");
const scanner = require("../engine/scannerEngine");
const bootstrap = require("../bootstrap");

const router = express.Router();

const investScanner = require("../services/investScanner");

/** Top-30 long-term picks (combined score >= 90). */
/** One-click data-source check: fetches RELIANCE fundamentals + chart and
 *  reports exactly what worked, so you can confirm in seconds. */
router.get("/health", async (req, res) => {
  const out = { fundamentals: false, chart: false, note: null };
  try {
    const { getFundamentals } = require("../services/fundamentalsService");
    const f = await getFundamentals("RELIANCE");
    out.fundamentals = !!f?.available;
    if (!out.fundamentals) out.note = f?.note || "Fundamentals source returned no data.";
    else out.sample = { pe: f.pe, roe: f.roe, marketCapCr: f.marketCapCr };
  } catch (e) { out.note = e.message; }
  try {
    const lt = await require("../services/longTermService").analyze("RELIANCE");
    out.chart = !!lt.technicalLong;
  } catch { /* covered by notes */ }
  res.json(out);
});

router.get("/top", (req, res) => res.json(investScanner.snapshot(req.query.segment, Number(req.query.top) || 30, Number(req.query.minScore) || 90)));

/** Kick off a fresh universe analysis (background, 2-4 min, poll /top for progress). */
router.post("/top/refresh", (req, res) => res.json(investScanner.start(req.query.segment)));

router.get("/:symbol", async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const longTerm = await longTermService.analyze(symbol);
    let intraday = null;
    if (bootstrap.getWatchlist().includes(symbol)) {
      try { intraday = scanner.analyzeSymbol(symbol); } catch { /* not scannable yet */ }
    }
    res.json({
      symbol, longTerm, intraday,
      summary: {
        longTermVerdict: longTerm.verdict,
        intradaySignal: intraday?.signal ?? "ADD TO WATCHLIST for intraday signals",
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
