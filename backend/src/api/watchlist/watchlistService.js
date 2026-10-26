const bootstrap = require("../../bootstrap");
const { getToken } = require("../../services/instrumentService");
const tickerService = require("../../services/tickerService");
const historical = require("../../services/historicalDataService");
const scanner = require("../../engine/scannerEngine");
const strategy = require("../../config/strategy");
const watchlistRepository = require("../../database/repositories/watchlistRepository");
const quoteService = require("../../services/quoteService");

function list() { return bootstrap.getWatchlist(); }

function add(symbol) {
  symbol = symbol.toUpperCase();
  const token = getToken(symbol);
  if (!token) throw Object.assign(new Error("Unknown symbol on NSE"), { status: 404 });
  const wl = bootstrap.getWatchlist();
  if (!wl.includes(symbol)) {
    wl.push(symbol);
    bootstrap.setWatchlist(wl);
    watchlistRepository.save(wl);
    tickerService.subscribe([token]);
    historical.bootstrap(token, strategy.TIMEFRAME, 10);
    quoteService.refresh([symbol]).catch(() => {}); // price shows instantly, no wait for a tick
    scanner.setWatchlist(wl);
  }
  return wl;
}

function remove(symbol) {
  symbol = symbol.toUpperCase();
  const wl = bootstrap.getWatchlist().filter((s) => s !== symbol);
  bootstrap.setWatchlist(wl);
  watchlistRepository.save(wl);
  scanner.setWatchlist(wl);
  return wl;
}

const { DEFAULT_WATCHLIST } = require("../../config/watchlist");
const universeService = require("../../services/universeService");
const seeder = require("../../services/historicalSeeder");
const { getTokens } = require("../../services/instrumentService");

/** Replace the watchlist with the top-N most-traded NSE stocks. */
async function bulkLoad(count = 1500) {
  count = Math.max(10, Math.min(2000, Number(count) || 1500));
  const symbols = await universeService.buildTopByVolume(count);
  bootstrap.setWatchlist(symbols);
  watchlistRepository.save(symbols);
  const tokens = getTokens(symbols);
  tickerService.subscribe(tokens);
  seeder.enqueue(tokens);   // fills score/RSI/trend for every symbol, ~10 min for 1500
  scanner.setWatchlist(symbols);
  return symbols;
}

/** Reset to the small default list. */
function reset() {
  const wl = [...DEFAULT_WATCHLIST];
  bootstrap.setWatchlist(wl);
  watchlistRepository.save(wl);
  scanner.setWatchlist(wl);
  return wl;
}

module.exports = { list, add, remove, bulkLoad, reset };
