const express = require("express");
const backtestService = require("../services/backtestService");
const router = express.Router();

router.get("/status", (req, res) => res.json(backtestService.status()));
router.post("/run", (req, res, next) => {
  try {
    res.json(backtestService.start({
      horizon: String(req.body?.horizon || "SWING").toUpperCase(),
      days: req.body?.days ? Number(req.body.days) : undefined,
      symbols: req.body?.symbols,
    }));
  } catch (e) { next(e); }
});
module.exports = router;
