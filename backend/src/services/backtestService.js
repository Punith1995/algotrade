/**
 * BACKTEST — replays the one strategy on historical candles, for any horizon.
 *
 * Realism rules:
 *   • A signal is read from a CLOSED candle; the fill is the NEXT candle's open.
 *   • Slippage against you on every fill.
 *   • Inside one candle, the stop is checked before the targets (worst case first).
 *   • A gap through the stop fills at the open, not at the stop.
 *   • Round-trip costs for the horizon (intraday or delivery) are deducted.
 */
const cfg = require("../config/strategy");
const swing = require("./swingStrategy");
const costs = require("./costs");
const exitEngine = require("./exitEngine");
const historical = require("./historicalDataService");
const { getToken } = require("./instrumentService");
const marketData = require("./marketData");
const logger = require("../utils/logger");

const IST_MS = 19800000;
const WARMUP = cfg.EMA_SLOW + 1;
let state = { running: false, progress: { done: 0, total: 0, phase: "idle" }, result: null, error: null, startedAt: null };

const istMinutes = (t) => { const d = new Date(t + IST_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

async function fetchCandles(token, horizon, days) {
  const H = cfg.HORIZONS[horizon];
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const raw = await marketData.history(token, horizon === "INTRADAY" ? "5" : "D", from, to);
  const candles = raw.map((c) => ({
    time: new Date(c.date).getTime(), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0,
  })).sort((a, b) => a.time - b.time);
  return horizon === "LONG" ? swing.toWeekly(candles) : candles;
}

/** Replay one symbol. Returns the list of closed trades. */
function simulate(symbol, candles, horizon) {
  const H = cfg.HORIZONS[horizon];
  const S = swing.series(candles);
  const emaArr = H.exitEma === 20 ? S.ema20 : S.ema50;
  const slip = cfg.SLIPPAGE_PCT / 100;
  const trades = [];
  let pos = null;

  const closeTrade = (exitPx, reason, t) => {
    pos.sellValue += exitPx * pos.qty;
    const buyValue = pos.entry * pos.initialQty;
    const gross = pos.sellValue - buyValue;
    const cost = costs.roundTrip({ horizon, buyValue, sellValue: pos.sellValue });
    trades.push({
      symbol, horizon, entryTime: pos.openedAt, closedAt: t,
      entry: +pos.entry.toFixed(2), exit: +exitPx.toFixed(2), qty: pos.initialQty,
      reason, gross: +gross.toFixed(2), costs: cost, net: +(gross - cost).toFixed(2),
      rMultiple: +((gross - cost) / (pos.initialRisk * pos.initialQty)).toFixed(2),
    });
    pos = null;
  };

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];

    // 1) manage the open position against this candle
    if (pos) {
      pos.bars++;
      if (horizon === "INTRADAY" && istMinutes(c.time) >= toMin(cfg.SQUARE_OFF)) {
        closeTrade(c.open * (1 - slip), "Intraday square-off", c.time);
      } else if (c.low <= pos.stopLoss) {
        const fill = c.open <= pos.stopLoss ? c.open : pos.stopLoss;
        closeTrade(fill * (1 - slip), pos.t1Booked ? "Stop at breakeven" : "Stop loss", c.time);
      } else {
        if (!pos.t1Booked && c.high >= pos.target1) {
          const fill = Math.max(pos.target1, c.open) * (1 - slip);
          const booked = pos.qty > 1 ? Math.floor((pos.qty * cfg.BOOK_AT_T1_PCT) / 100) : 0;
          pos.sellValue += fill * booked;
          pos.qty -= booked;
          pos.t1Booked = true;
          pos.stopLoss = pos.entry;
        }
        if (pos && c.high >= pos.target2) {
          closeTrade(Math.max(pos.target2, c.open) * (1 - slip), `Target 2 (${cfg.T2_R}R)`, c.time);
        } else if (pos) {
          const closedBelowTrend = emaArr[i] != null && c.close < emaArr[i];
          if (closedBelowTrend && pos.bars >= 1) {
            const next = candles[i + 1];
            closeTrade((next ? next.open : c.close) * (1 - slip), `Closed below ${H.exitEma} EMA`, c.time);
          } else if (H.maxHoldBars && pos.bars >= H.maxHoldBars) {
            closeTrade(c.close * (1 - slip), `${H.maxHoldBars}-session time stop`, c.time);
          }
        }
      }
    }

    // 2) look for a new entry on this closed candle; fill at the next open
    if (!pos && i + 1 < candles.length && i >= WARMUP) {
      const inWindow = horizon !== "INTRADAY" ||
        (istMinutes(c.time) >= toMin(cfg.ENTRY_START) && istMinutes(c.time) <= toMin(cfg.ENTRY_END));
      if (inWindow) {
        const d = swing.at(S, i, horizon);
        if (d.signal === "BUY") {
          const entry = candles[i + 1].open * (1 + slip);
          const stop = d.risk.stopLoss;
          const risk = entry - stop;
          const riskPct = (risk / entry) * 100;
          const budget = (cfg.CAPITAL * cfg.RISK_PER_TRADE_PCT) / 100;
          const qty = risk > 0 ? Math.floor(budget / risk) : 0;
          if (risk > 0 && riskPct <= H.maxStopPct && qty >= 1 && candles[i + 1].open > stop) {
            pos = {
              entry, stopLoss: stop, initialRisk: risk, qty, initialQty: qty,
              target1: +(entry + cfg.T1_R * risk).toFixed(4),
              target2: +(entry + cfg.T2_R * risk).toFixed(4),
              t1Booked: false, sellValue: 0, bars: 0, openedAt: candles[i + 1].time,
            };
          }
        }
      }
    }
  }
  if (pos) {  // mark the last open trade to the final close
    const last = candles[candles.length - 1];
    closeTrade(last.close * (1 - slip), "End of data", last.time);
  }
  return trades;
}

function summarize(trades, horizon, symbols) {
  const n = trades.length;
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net <= 0);
  const sum = (arr, f) => arr.reduce((s, t) => s + f(t), 0);
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  let equity = 0, peak = 0, maxDd = 0;
  const curve = sorted.map((t) => {
    equity += t.net; peak = Math.max(peak, equity); maxDd = Math.max(maxDd, peak - equity);
    return { time: t.closedAt, equity: +equity.toFixed(2) };
  });
  const bySymbol = {};
  for (const t of trades) bySymbol[t.symbol] = +((bySymbol[t.symbol] || 0) + t.net).toFixed(2);
  const byReason = {};
  for (const t of trades) byReason[t.reason] = (byReason[t.reason] || 0) + 1;
  const grossWin = sum(wins, (t) => t.net), grossLoss = Math.abs(sum(losses, (t) => t.net));
  return {
    horizon, label: cfg.HORIZONS[horizon].label, symbols,
    trades: n, wins: wins.length, losses: losses.length,
    winRate: n ? +((wins.length / n) * 100).toFixed(1) : 0,
    netPnl: +sum(trades, (t) => t.net).toFixed(2),
    grossPnl: +sum(trades, (t) => t.gross).toFixed(2),
    costs: +sum(trades, (t) => t.costs).toFixed(2),
    avgR: n ? +(sum(trades, (t) => t.rMultiple) / n).toFixed(2) : 0,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null,
    maxDrawdown: +maxDd.toFixed(2),
    curve, bySymbol, byReason,
    recentTrades: sorted.slice(-60),
  };
}

/** Run the backtest. horizon: INTRADAY | SWING | LONG. */
function start({ horizon = "SWING", days, symbols } = {}) {
  if (!cfg.HORIZONS[horizon]) throw Object.assign(new Error(`horizon must be INTRADAY, SWING or LONG`), { status: 400 });
  if (state.running) return status();
  const span = days || (horizon === "INTRADAY" ? 60 : horizon === "SWING" ? 730 : 1900);
  const list = (symbols?.length ? symbols : require("../bootstrap").getWatchlist()).slice(0, 50);
  state = { running: true, progress: { done: 0, total: list.length, phase: "starting" }, result: null, error: null, startedAt: Date.now() };

  (async () => {
    try {
      const trades = [];
      let fetched = 0;
      for (const symbol of list) {
        state.progress.phase = symbol;
        try {
          const token = getToken(symbol);
          if (token) {
            const candles = await fetchCandles(token, horizon, span);
            if (candles.length > WARMUP + 5) { fetched++; trades.push(...simulate(symbol, candles, horizon)); }
          }
        } catch (e) { logger.warn(`[backtest] ${symbol}: ${e.message}`); }
        state.progress.done++;
      }
      if (!fetched) throw new Error("No historical data — log in to Angel One and check the historical data subscription");
      state.result = { days: span, ...summarize(trades, horizon, fetched), finishedAt: Date.now() };
      state.running = false;
      state.progress.phase = "done";
      logger.info(`[backtest] ${horizon}: ${trades.length} trades, net ₹${state.result.netPnl}, win ${state.result.winRate}%`);
    } catch (e) {
      state.running = false;
      state.error = e.message;
      state.progress.phase = "error";
      logger.error(`[backtest] ${e.message}`);
    }
  })();
  return status();
}

function status() {
  return { running: state.running, progress: state.progress, error: state.error, result: state.result };
}

module.exports = { start, status, simulate, summarize };
