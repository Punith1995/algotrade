/**
 * Order Service — REAL order placement via Angel One (the auto-trading path).
 *
 * ⚠️  DOUBLE-LOCKED OFF BY DEFAULT. Orders are placed ONLY when BOTH:
 *   1. backend/.env contains  ALLOW_AUTO_TRADE=true   (hard lock)
 *   2. Settings page toggle AUTO_TRADE_ENABLED = 1     (runtime switch)
 *
 * Safety rails when enabled:
 *   - MIS (intraday) market orders only
 *   - Position size from AUTO_CAPITAL_PER_TRADE (₹ / entry price)
 *   - Hard cap: AUTO_MAX_TRADES_PER_DAY
 *
 * Until both locks are open, every call here logs what it WOULD have done.
 */
const strategy = require("../config/strategy");
const marketData = require("./marketData");
const { getToken } = require("./instrumentService");
const logger = require("../utils/logger");

let tradesToday = 0;
let tradeDate = null;

// Angel One symbol for a plain symbol ("SBIN" → "NSE:SBIN-EQ")
const brokerSymbol = (s) => getToken(s) || `NSE:${s}-EQ`;

// Signal-only mode: auto-trading is never armed, whatever the env or Settings say.
function armed() {
  return false;
}

function resetDailyCounter() {
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  if (tradeDate !== today) { tradeDate = today; tradesToday = 0; }
}

function qtyFor(price) {
  const qty = Math.floor((strategy.AUTO_CAPITAL_PER_TRADE || 0) / price);
  return Math.max(qty, 0);
}

async function placeEntry(symbol, transactionType, price) {
  resetDailyCounter();
  const qty = qtyFor(price);
  if (!armed()) {
    logger.info(`[orders] (shadow) WOULD ${transactionType} ${qty} x ${symbol} @ ~${price} — auto-trade locked off`);
    return { placed: false, shadow: true, qty };
  }
  if (tradesToday >= (strategy.AUTO_MAX_TRADES_PER_DAY || 0)) {
    logger.warn(`[orders] Daily trade cap reached (${tradesToday}) — skipping ${symbol}`);
    return { placed: false, reason: "daily cap" };
  }
  if (qty < 1) return { placed: false, reason: "capital too small for 1 share" };
  const order = await marketData.placeOrder({
    symbol: brokerSymbol(symbol), side: transactionType, qty, type: "MARKET", productType: "INTRADAY",
  });
  tradesToday += 1;
  logger.info(`[orders] ✅ ${transactionType} ${qty} x ${symbol} placed — order_id ${order.order_id}`);
  return { placed: true, order_id: order.order_id, qty };
}

/** Exit an existing position — transactionType is the OPPOSITE of entry. */
async function placeExit(symbol, transactionType, qty) {
  if (!armed()) {
    logger.info(`[orders] (shadow) WOULD ${transactionType} (exit) ${qty} x ${symbol} — auto-trade locked off`);
    return { placed: false, shadow: true };
  }
  const order = await marketData.placeOrder({
    symbol: brokerSymbol(symbol), side: transactionType, qty, type: "MARKET", productType: "INTRADAY",
  });
  logger.info(`[orders] ✅ ${transactionType} (exit) ${qty} x ${symbol} — order_id ${order.order_id}`);
  return { placed: true, order_id: order.order_id };
}

/**
 * ONE-CLICK trade from a signal card — human-initiated, needs its own opt-in:
 * ENABLE_ONE_CLICK_ORDERS=true in backend/.env.
 *
 * Places TWO orders on the exchange:
 *   1. Entry: MARKET intraday
 *   2. Protection: stop-market (SL-M) order at your stop-loss price
 */
// Signal-only mode: one-click orders are never enabled.
function oneClickEnabled() {
  return false;
}

// In-flight lock: a fast double-click must never place the same order twice.
const pendingSymbols = new Set();

async function placeOneClick({ symbol, side, qty, stopLoss }) {
  if (pendingSymbols.has(symbol)) {
    return { placed: false, reason: `${symbol} order already in flight — duplicate blocked.` };
  }
  pendingSymbols.add(symbol);
  try {
    return await placeOneClickInner({ symbol, side, qty, stopLoss });
  } finally {
    pendingSymbols.delete(symbol);
  }
}

async function placeOneClickInner({ symbol, side, qty, stopLoss }) {
  if (!oneClickEnabled()) {
    return { placed: false, reason: "Order placement is disabled — this app only shows signals." };
  }
  const entryTxn = side === "SHORT" ? "SELL" : "BUY";
  const exitTxn = side === "SHORT" ? "BUY" : "SELL";
  const tag = `AD${Date.now().toString(36).slice(-6)}`;   // visible in the Angel One order book
  const fsym = brokerSymbol(symbol);
  const entry = await marketData.placeOrder({ symbol: fsym, side: entryTxn, qty, type: "MARKET", productType: "INTRADAY", tag });
  logger.info(`[orders] ✅ 1-click ${entryTxn} ${qty} x ${symbol} — order ${entry.order_id}`);
  let slOrder = null;
  try {
    slOrder = await marketData.placeOrder({
      symbol: fsym, side: exitTxn, qty, type: "SL_M", productType: "INTRADAY",
      stopPrice: +Number(stopLoss).toFixed(1),
    });
    logger.info(`[orders] 🛡 Exchange stop placed at ${stopLoss} — order ${slOrder.order_id}`);
  } catch (e) {
    logger.error(`[orders] Entry filled but STOP ORDER FAILED: ${e.message} — place the stop manually NOW.`);
  }
  return { placed: true, entryOrderId: entry.order_id, slOrderId: slOrder?.order_id || null,
           slPlaced: !!slOrder, qty };
}

/** One-click square-off of a tracked position (MIS market exit). */
async function squareOff({ symbol, side, qty }) {
  if (!oneClickEnabled()) {
    return { placed: false, reason: "Order placement is disabled — this app only shows signals." };
  }
  const txn = side === "SHORT" ? "BUY" : "SELL";
  const order = await marketData.placeOrder({ symbol: brokerSymbol(symbol), side: txn, qty, type: "MARKET", productType: "INTRADAY" });
  logger.info(`[orders] ✅ 1-click square-off ${txn} ${qty} x ${symbol} — order ${order.order_id}`);
  return { placed: true, orderId: order.order_id };
}

module.exports = { placeEntry, placeExit, placeOneClick, squareOff, oneClickEnabled, armed, qtyFor };
