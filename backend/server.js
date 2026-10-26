require("dotenv").config();

// A single unhandled async error must never kill the trading engine.
process.on("unhandledRejection", (e) => console.error("[guard] Unhandled rejection:", e?.message || e));
process.on("uncaughtException", (e) => console.error("[guard] Uncaught exception:", e?.message || e));

const db = require("./src/database/db");
const http = require("http");

const brokerAuth = require("./src/config/broker");
const socketManager = require("./src/websocket/socketManager");
const { createApp } = require("./src/app");
const bootstrap = require("./src/bootstrap");
const scheduler = require("./src/engine/scheduler");
const logger = require("./src/utils/logger");

const PORT = process.env.PORT || 5000;
const ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const SESSION_CHECK_MS = 5 * 60 * 1000;

if (!brokerAuth.hasCredentials()) {
  console.warn("\n⚠ Angel One credentials are not set (ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PIN, ANGEL_TOTP_SECRET).");
  console.warn("  The backend will start, but live data stays off until they are set in backend/.env.\n");
}

const server = http.createServer();
const io = socketManager.init(server, ORIGIN);
const { app, finalize } = createApp(io, ORIGIN);

app.get("/", (req, res) => {
  res.send(`<h2>AlgoDesk backend running</h2>
    <p>Status: <a href="/api/auth/status">/api/auth/status</a></p>
    <p>Log in to Angel One now: <a href="/api/auth/login">/api/auth/login</a></p>`);
});

finalize(); // error handler last
server.on("request", app);

(async () => {
  await db.initPostgres();
  require("./src/services/dailyReport").startScheduler(); // Postgres (or JSON fallback) restores persisted state

  // Re-apply persisted values that modules read at require-time (before init):
  Object.assign(require("./src/config/strategy"), require("./src/database/repositories/userRepository").getSettings());
  bootstrap.setWatchlist(require("./src/database/repositories/watchlistRepository").load(bootstrap.getWatchlist()));

  server.listen(PORT, async () => {
    logger.info(`🚀 Backend on http://localhost:${PORT} (frontend origin: ${ORIGIN})`);

    if (await brokerAuth.ensureLogin()) {
      try {
        await bootstrap.startEngines(io);
        scheduler.start();
        logger.info("✅ Angel One session ready — live data engine running.");
      } catch (e) {
        logger.error("Engine start failed:", e.message);
      }
    } else if (brokerAuth.hasCredentials()) {
      logger.warn("Angel One login failed. Check ANGEL_CLIENT_CODE, ANGEL_PIN and ANGEL_TOTP_SECRET.");
    }

    // Keep the session alive across days: when the IST day changes, log in again.
    setInterval(async () => {
      if (brokerAuth.isAuthenticated() || !brokerAuth.hasCredentials()) return;
      try {
        await bootstrap.loginAndStart(io);
        logger.info("[angel] Session renewed for the new trading day.");
      } catch (e) {
        logger.warn("[angel] Session renewal failed:", e.message);
      }
    }, SESSION_CHECK_MS);

    logger.info(`[db] Storage mode: ${db.mode()}`);
  });
})();
