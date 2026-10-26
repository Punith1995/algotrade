/**
 * POSITION TRACKER — every trade the app is managing (auto, shadow, one-click, manual).
 *
 * Lifecycle of a long:
 *   open()         entry, stop below support, Target 1 (2R), Target 2 (3R)
 *   partialClose() at Target 1: book BOOK_AT_T1_PCT of the shares, stop moves to entry
 *   close()        remaining shares exit (stop, Target 2, trend break, time stop, square-off)
 *
 * Persisted in the JSON/Postgres store, so a restart does not lose positions.
 */
const db = require("../database/db");
const tradeRepository = require("../database/repositories/tradeRepository");
const cfg = require("../config/strategy");
const costs = require("./costs");
const logger = require("../utils/logger");

if (!db.get("positions")) db.set("positions", []);

const all = () => db.get("positions");
const list = () => all().filter((p) => p.open);
const save = (arr) => db.set("positions", arr);

function open({ symbol, horizon = "INTRADAY", entry, stopLoss, target1, target2, target, qty = 1, source = "manual" }) {
  symbol = String(symbol || "").toUpperCase();
  if (!symbol) throw Object.assign(new Error("symbol required"), { status: 400 });
  if (list().some((p) => p.symbol === symbol)) {
    throw Object.assign(new Error(`Already tracking an open position in ${symbol}`), { status: 409 });
  }
  if (!cfg.HORIZONS[horizon]) throw Object.assign(new Error(`Unknown horizon ${horizon}`), { status: 400 });
  if (!(Number(stopLoss) < Number(entry))) throw Object.assign(new Error("stop must be below entry"), { status: 400 });

  const shares = Math.max(1, Math.floor(Number(qty) || 1));
  const t1 = target1 ?? target ?? null;
  const pos = {
    id: `${symbol}-${Date.now()}`,
    symbol, horizon, side: "LONG",
    entry: +entry, stopLoss: +stopLoss,
    target1: t1 != null ? +t1 : null,
    target2: target2 != null ? +target2 : null,
    qty: shares, initialQty: shares,
    initialRisk: +(Number(entry) - Number(stopLoss)).toFixed(2),
    realized: 0,        // profit/loss locked in by partial exits (gross)
    sellValue: 0,       // total sale proceeds so far (for costs)
    t1Booked: false,
    source, open: true, openedAt: Date.now(),
    exit: null, pnl: null, reason: null,
  };
  save([...all(), pos]);
  logger.info(`[positions] ${horizon} ${symbol} — entry ${pos.entry}, stop ${pos.stopLoss}, T1 ${pos.target1}, T2 ${pos.target2}, qty ${shares}`);
  return pos;
}

/** Book the Target 1 share of the position and move the stop to entry. */
function partialClose(id, price) {
  const arr = all();
  const pos = arr.find((p) => p.id === id && p.open);
  if (!pos || pos.t1Booked) return null;
  const booked = pos.qty > 1 ? Math.floor((pos.qty * cfg.BOOK_AT_T1_PCT) / 100) : 0;
  pos.realized = +(pos.realized + (price - pos.entry) * booked).toFixed(2);
  pos.sellValue = +(pos.sellValue + price * booked).toFixed(2);
  pos.qty -= booked;
  pos.t1Booked = true;
  pos.stopLoss = pos.entry;             // breakeven: the rest cannot lose money
  save(arr);
  return { booked, remaining: pos.qty, at: price, realized: pos.realized, pos };
}

/** Close whatever remains. Records the full round trip in trade history. */
function close(id, exitPrice, reason) {
  const arr = all();
  const pos = arr.find((p) => p.id === id && p.open);
  if (!pos) throw Object.assign(new Error("Position not found or already closed"), { status: 404 });

  const exitP = +exitPrice;
  pos.sellValue = +(pos.sellValue + exitP * pos.qty).toFixed(2);
  const buyValue = +(pos.entry * pos.initialQty).toFixed(2);
  const gross = +(pos.sellValue - buyValue).toFixed(2);
  const cost = costs.roundTrip({ horizon: pos.horizon, buyValue, sellValue: pos.sellValue });
  const net = +(gross - cost).toFixed(2);

  pos.open = false;
  pos.exit = exitP;
  pos.closedAt = Date.now();
  pos.reason = reason;
  pos.pnl = gross;
  pos.costs = cost;
  pos.netPnl = net;
  save(arr);

  tradeRepository.save({
    symbol: pos.symbol, horizon: pos.horizon, side: pos.side,
    entry: pos.entry, exit: pos.exit, qty: pos.initialQty,
    pnl: gross, costs: cost, netPnl: net,
    pnlPct: +((gross / buyValue) * 100).toFixed(2),
    rMultiple: pos.initialRisk ? +((net / (pos.initialRisk * pos.initialQty))).toFixed(2) : null,
    openedAt: pos.openedAt, closedAt: pos.closedAt, reason, source: pos.source,
  });
  logger.info(`[positions] Closed ${pos.symbol} @ ${exitP} (${reason}) — gross ₹${gross}, net ₹${net}`);
  return pos;
}

/** Live P&L for the dashboard, including what has already been booked. */
function livePnl(pos, ltp) {
  if (ltp == null) return null;
  const pnl = +(pos.realized + (ltp - pos.entry) * pos.qty).toFixed(2);
  const r = pos.initialRisk ? +((ltp - pos.entry) / pos.initialRisk).toFixed(2) : null;
  return { pnl, pnlPct: +((pnl / (pos.entry * pos.initialQty)) * 100).toFixed(2), rMultiple: r };
}

module.exports = { all, list, open, partialClose, close, livePnl };
