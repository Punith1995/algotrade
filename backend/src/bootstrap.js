/**
 * Shared boot logic: Angel One login, then starting the live data engine.
 * Used at startup, by the /api/auth/login route, and by the daily session renewal.
 */
const brokerAuth = require("./config/broker");
const { loadInstruments, getTokens } = require("./services/instrumentService");
const tickerService = require("./services/tickerService");
const historical = require("./services/historicalDataService");
const scanner = require("./engine/scannerEngine");
const quoteService = require("./services/quoteService");
const seeder = require("./services/historicalSeeder");
const strategy = require("./config/strategy");
const { DEFAULT_WATCHLIST } = require("./config/watchlist");
const watchlistRepository = require("./database/repositories/watchlistRepository");

let engineStarted = false;
let watchlist = watchlistRepository.load([...DEFAULT_WATCHLIST]);

function getWatchlist() { return watchlist; }
function setWatchlist(w) { watchlist = w; }
function isEngineStarted() { return engineStarted; }

async function startEngines(io) {
  if (engineStarted) return;
  await loadInstruments();
  const tokens = getTokens(watchlist);
  tickerService.start(tokens);
  seeder.setIO(io);
  const { NIFTY50_TOKEN, BANKNIFTY_TOKEN } = require("./services/instrumentService");
  seeder.enqueue([NIFTY50_TOKEN, BANKNIFTY_TOKEN, ...tokens]);   // NIFTY first: the market gate needs its candles
  scanner.init(io, watchlist);
  scanner.start();
  quoteService.start(() => watchlist);
  engineStarted = true;
  require("./engine/scheduler").start();
  console.log("✅ Live data engine started.");
}

/** Log in to Angel One with the configured credentials, then start (or refresh) the engine. */
async function loginAndStart(io) {
  await brokerAuth.login();
  if (engineStarted) {
    // Mid-day re-login (token expired): the engine is running but the
    // WebSocket holds the DEAD token — rebuild it with the fresh one.
    const { getTokens } = require("./services/instrumentService");
    tickerService.restart(getTokens(watchlist));
  }
  await startEngines(io);
  return {
    authenticated: true,
    historicalSubscription: historical.HAS_HIST,
    engineStarted,
  };
}

module.exports = {
  startEngines,
  loginAndStart,
  isEngineStarted,
  getWatchlist,
  setWatchlist,
};
