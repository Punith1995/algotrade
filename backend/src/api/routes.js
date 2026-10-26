const express = require("express");
const router = express.Router();

const brokerAuth = require("../config/broker");
const tickerService = require("../services/tickerService");
const historical = require("../services/historicalDataService");
const { isMarketOpen } = require("../config/marketTimings");
const bootstrap = require("../bootstrap");

const signalRoutes = require("./signalRoutes");
const scannerRoutes = require("./scannerRoutes");
const watchlistRoutes = require("./watchlist/watchlistRoutes");
const settingsRoutes = require("./settingsRoutes");
const stocksRoutes = require("../routes/stocksRoutes");
const testRoutes = require("../routes/testRoutes");
const tradeRoutes = require("./tradeRoutes");
const investRoutes = require("./investRoutes");
const backtestRoutes = require("./backtestRoutes");

const FRONTEND = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

module.exports = (io) => {
  // ---------- AUTH ----------
  // Logs in to Angel One with the ANGEL_* credentials and starts the engine.
  // Also happens automatically at startup and each new trading day.
  router.get("/auth/login", async (req, res) => {
    try {
      await bootstrap.loginAndStart(io);
      res.redirect(FRONTEND);
    } catch (e) {
      console.error("[auth]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/auth/status", (req, res) => {
    res.json({
      authenticated: brokerAuth.isAuthenticated(),
      tickerConnected: tickerService.isConnected(),
      engineStarted: bootstrap.isEngineStarted(),
      marketOpen: isMarketOpen(),
      historicalSubscription: historical.isEnabled(),
      historicalError: historical.getError(),
      loginUrl: "/api/auth/login",
    });
  });

  // ---------- Feature modules ----------
  router.use("/signals", signalRoutes);
  router.use("/scanner", scannerRoutes);
  router.use("/watchlist", watchlistRoutes);
  router.use("/settings", settingsRoutes);
  router.use("/stocks", stocksRoutes);
  router.use("/test", testRoutes);
  router.use("/positions", tradeRoutes);
  router.use("/invest", investRoutes);
  router.use("/backtest", backtestRoutes);

  // legacy path used by earlier frontend builds
  router.get("/candles/:symbol", (req, res) => {
    const { getToken } = require("../services/instrumentService");
    const strategy = require("../config/strategy");
    const token = getToken(req.params.symbol.toUpperCase());
    if (!token) return res.status(404).json({ error: "Unknown symbol" });
    res.json(historical.getCandles(token, Number(req.query.tf) || strategy.TIMEFRAME));
  });

  return router;
};
