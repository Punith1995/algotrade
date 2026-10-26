const express = require("express");
const { isMarketOpen } = require("../config/marketTimings");
const router = express.Router();
router.get("/ping", (req, res) => res.json({ ok: true, marketOpen: isMarketOpen(), time: new Date().toISOString() }));
module.exports = router;
