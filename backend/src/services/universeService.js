/**
 * Universe builder — loads the whole NSE equity list, ranks by traded volume
 * via batched quotes, filters out illiquid and penny stocks, and returns the top N.
 */
const quoteService = require("./quoteService");
const { loadInstruments, getAllEquities, getAllSymbols } = require("./instrumentService");
const logger = require("../utils/logger");

const MIN_PRICE = 20;        // skip penny stocks
const MIN_DAY_VOLUME = 50000;

async function buildTopByVolume(count = 1500) {
  logger.info(`[universe] Building top-${count} universe from all NSE equities…`);
  if (!getAllEquities().length) await loadInstruments();
  const allSymbols = getAllSymbols();
  logger.info(`[universe] ${allSymbols.length} NSE equities found — fetching quotes in batches…`);

  const quotes = await quoteService.refresh(allSymbols);   // chunked internally
  const ranked = quotes
    .filter((q) => q.symbol !== "NIFTY 50" && q.ltp >= MIN_PRICE && (q.volume || 0) >= MIN_DAY_VOLUME)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, count)
    .map((q) => q.symbol);

  logger.info(`[universe] Selected ${ranked.length} liquid symbols (price ≥ ₹${MIN_PRICE}, volume ≥ ${MIN_DAY_VOLUME}).`);
  return ranked;
}

module.exports = { buildTopByVolume };
