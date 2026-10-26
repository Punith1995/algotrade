const express = require("express");
const bootstrap = require("../bootstrap");
const marketEngine = require("../engine/marketEngine");

const router = express.Router();

/** Pattern-scanner hits (ORB / breakout / reversal / swing) across the watchlist. */

/** Market snapshot: NIFTY, breadth, fear/greed, sector strength. */
router.get("/market", (req, res) => res.json(marketEngine.snapshot(bootstrap.getWatchlist())));

const universeScanner = require("../services/universeScanner");
const watchlistService = require("./watchlist/watchlistService");

/** Last universe scan (top 200 ranked). */
router.get("/universe", (req, res) => res.json({ ...universeScanner.getLastScan(), scanning: universeScanner.isScanning() }));

/**
 * Refresh: scan ALL ~2200 NSE stocks, take the top 50 scoring 80+,
 * and (if apply=true) replace the watchlist with them.
 */
router.post("/universe/refresh", async (req, res, next) => {
  try {
    const scanRes = await universeScanner.scan(String(req.query.segment || "large"));
    const picks = universeScanner.topPicks(Number(req.query.top) || 50, Number(req.query.minScore) || 90, req.query.segment || "large");
    let applied = null;
    if (String(req.query.apply ?? "true") === "true") {
      applied = watchlistService.setAll(picks.map((p) => p.symbol));
    }
    res.json({
      time: scanRes.time, segment, minScore,
      scanned: scanRes.scanned,
      qualifiedCount: picks.filter((p) => p.qualified).length,
      filledCount: picks.filter((p) => !p.qualified).length,
      picks, applied,
    });
  } catch (e) { next(e); }
});

module.exports = router;
