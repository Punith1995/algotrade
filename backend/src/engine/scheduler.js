/** Starts/stops the scan loop around NSE market hours automatically. */
const { isMarketOpen } = require("../config/marketTimings");
const scanner = require("./scannerEngine");
const logger = require("../utils/logger");
const tickerService = require("../services/tickerService");
const brokerAuth = require("../config/broker");

let running = false;
let lastForcedReconnect = 0;

/** Watchdog: market open + authenticated but NO ticks for 90 s → the
 *  WebSocket has silently died. Rebuild it (max once per 3 minutes). */
function watchdog() {
  if (!isMarketOpen() || !brokerAuth.isAuthenticated()) return;
  const silent = tickerService.msSinceLastTick();
  const stale = silent == null ? !tickerService.isConnected() : silent > 90 * 1000;
  if (stale && Date.now() - lastForcedReconnect > 3 * 60 * 1000) {
    lastForcedReconnect = Date.now();
    logger.warn(`[watchdog] No ticks for ${silent == null ? "ever" : Math.round(silent / 1000) + "s"} during market hours — rebuilding WebSocket.`);
    try { tickerService.restart(); } catch (e) { logger.error("[watchdog] Restart failed:", e.message); }
  }
}

function tick() {
  watchdog();
  const open = isMarketOpen();
  if (open && !running) { scanner.start(); running = true; logger.info("[scheduler] Market open — scanner started"); }
  // keep scanning after close too (historical mode) — only log the transition
  if (!open && running) { logger.info("[scheduler] Market closed — scanner continues on last data"); running = false; }
}
function start() { tick(); setInterval(tick, 60 * 1000).unref(); }
module.exports = { start };
