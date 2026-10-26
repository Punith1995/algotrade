/**
 * Daily candles for long-term analysis (2 years).
 * Primary: Angel One history. Fallback: Yahoo Finance chart API (free, no key), symbol + ".NS".
 * Cached for the day.
 */
const axios = require("axios");
const { getToken } = require("./instrumentService");
const marketData = require("./marketData");
const redis = require("../redis/redisClient");
const logger = require("../utils/logger");

const HAS_HIST = String(process.env.HAS_HISTORICAL_SUBSCRIPTION).toLowerCase() === "true";

async function fromBroker(symbol) {
  const token = getToken(symbol);
  if (!token) throw new Error("Unknown symbol");
  const to = new Date();
  const from = new Date(to.getTime() - 2 * 365 * 24 * 3600 * 1000);
  const data = await marketData.history(token, "D", from, to);
  return data.map((c) => ({ time: c.date.getTime(), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
}

async function fromYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?range=2y&interval=1d`;
  const { data } = await axios.get(url, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("No Yahoo data");
  const q = r.indicators.quote[0];
  return r.timestamp.map((t, i) => ({
    time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i],
  })).filter((c) => c.close != null);
}

async function getDaily(symbol) {
  symbol = symbol.toUpperCase();
  const key = `daily:${symbol}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await redis.get(key);
  if (cached) return cached;
  let candles;
  try {
    candles = HAS_HIST ? await fromBroker(symbol) : await fromYahoo(symbol);
  } catch (e) {
    logger.warn(`[daily] ${symbol} primary source failed (${e.message}) — trying fallback`);
    candles = HAS_HIST ? await fromYahoo(symbol) : await fromBroker(symbol);
  }
  await redis.set(key, candles, 6 * 3600);
  return candles;
}

module.exports = { getDaily };
