/**
 * Live strategy settings. Every key here maps to one number in config/strategy.js.
 */
const express = require("express");
const strategy = require("../config/strategy");
const userRepository = require("../database/repositories/userRepository");

const router = express.Router();

const NUMERIC = [
  "CAPITAL", "RISK_PER_TRADE_PCT", "T1_R", "T2_R", "BOOK_AT_T1_PCT",
  "VOL_MULT", "RSI_MIN", "RSI_MAX", "RESISTANCE_LOOKBACK", "SUPPORT_LOOKBACK", "STOP_BUFFER_PCT",
  "MAX_OPEN_POSITIONS", "MAX_OPEN_RISK_PCT", "MAX_LOSSES_PER_DAY", "REENTRY_COOLDOWN_MIN",
  "MIN_AVG_VOLUME", "MIN_PRICE", "SCAN_INTERVAL_MS",
];

// apply persisted overrides at boot
Object.assign(strategy, userRepository.getSettings());

const current = () => Object.fromEntries(NUMERIC.map((k) => [k, strategy[k]]));

router.get("/", (req, res) => res.json(current()));

router.put("/", (req, res) => {
  const updates = {};
  for (const k of NUMERIC) {
    if (req.body[k] != null && req.body[k] !== "" && !Number.isNaN(Number(req.body[k]))) {
      updates[k] = Number(req.body[k]);
    }
  }
  Object.assign(strategy, updates);
  userRepository.saveSettings({ ...userRepository.getSettings(), ...updates });
  res.json(current());
});

module.exports = router;
