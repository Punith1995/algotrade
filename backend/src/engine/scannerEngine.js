/**
 * SCANNER — runs the one strategy on each horizon.
 *
 *   INTRADAY  every SCAN_INTERVAL_MS (15 s) on closed 5-minute candles
 *   SWING     every SWING_SCAN_INTERVAL_MS (15 min) on daily candles, hold 10–15 sessions
 *   LONG      on demand (Invest page) on weekly candles
 *
 * Every pass: decide → alert on a NEW BUY → manage open positions (stop, targets,
 * trend break, time stop, square-off). Auto-orders are INTRADAY only; swing and
 * long-term signals alert and can be tracked, never auto-ordered.
 */
const cfg = require("../config/strategy");
const swing = require("../services/swingStrategy");
const exitEngine = require("../services/exitEngine");
const positionTracker = require("../services/positionTracker");
const historical = require("../services/historicalDataService");
const dailyData = require("../services/dailyDataService");
const longTermService = require("../services/longTermService");
const orderService = require("../services/orderService");
const quoteService = require("../services/quoteService");
const { getToken } = require("../services/instrumentService");
const alertEngine = require("./alertEngine");
const signalRepository = require("../database/repositories/signalRepository");
const { isMarketOpen } = require("../config/marketTimings");
const logger = require("../utils/logger");

const IST_MS = 19800000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let io = null;
let watchlist = [];
let timer = null;
let swingTimer = null;

const intradayState = new Map();   // symbol -> last intraday decision
const swingState = new Map();      // symbol -> last swing decision
const swingCandles = new Map();    // symbol -> daily candles (used for exits)
const lastExitAt = new Map();      // symbol -> ms of last exit (cooldown)
const gateFails = {};              // failed check -> count today
let gateDay = null;

// ---------- IST clock helpers ----------
function istNow(ms = Date.now()) {
  const d = new Date(ms + IST_MS);
  return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const entryWindowOpen = () => { const { minutes } = istNow(); return minutes >= toMin(cfg.ENTRY_START) && minutes <= toMin(cfg.ENTRY_END); };
const squareOffDue = () => istNow().minutes >= toMin(cfg.SQUARE_OFF);
const lossesToday = () => {
  const today = istNow().day;
  return positionTracker.all().filter((p) => !p.open && p.netPnl < 0 && istNow(p.closedAt).day === today).length;
};
const openRiskPct = () => positionTracker.list().reduce((s, p) => s + (p.initialRisk * p.qty), 0) / cfg.CAPITAL * 100;

/** Reason an entry is blocked right now, or null if it may proceed. */
function entryBlock(symbol, horizon, plan) {
  if (horizon === "INTRADAY" && !entryWindowOpen()) return `Outside the entry window (${cfg.ENTRY_START}–${cfg.ENTRY_END})`;
  if (positionTracker.list().some((p) => p.symbol === symbol)) return "Already holding this stock";
  if (positionTracker.list().length >= cfg.MAX_OPEN_POSITIONS) return `Max ${cfg.MAX_OPEN_POSITIONS} open positions`;
  if (lossesToday() >= cfg.MAX_LOSSES_PER_DAY) return `${cfg.MAX_LOSSES_PER_DAY} losses today — no more entries`;
  const cool = lastExitAt.get(symbol);
  if (cool && Date.now() - cool < cfg.REENTRY_COOLDOWN_MIN * 60000) return `Cooldown after an exit — ${cfg.REENTRY_COOLDOWN_MIN} min`;
  if (plan && openRiskPct() + (plan.riskAmount / cfg.CAPITAL * 100) > cfg.MAX_OPEN_RISK_PCT) {
    return `Open risk would exceed ${cfg.MAX_OPEN_RISK_PCT}% of capital`;
  }
  return null;
}

// ---------- decisions ----------
/** Last n values of each indicator series, for the stock page charts. */
function chartSeries(S, n) {
  const tail = (a) => a.slice(-n).map((v) => (v == null ? null : +v.toFixed(2)));
  return { ema20: tail(S.ema20), ema50: tail(S.ema50), ema200: tail(S.ema200), rsi: tail(S.rsi), macd: tail(S.macd), macdSignal: tail(S.macdSignal) };
}

function decide(symbol, horizon, candles) {
  const S = swing.series(candles);
  const d = swing.at(S, candles.length - 1, horizon);
  const ltp = quoteService.get(symbol)?.ltp ?? d.indicators?.LTP ?? null;
  return {
    symbol, horizon, label: d.label,
    signal: d.signal,
    warming: d.warming,
    price: ltp,
    checks: d.checks,
    failedChecks: d.failedChecks,
    conditionsMet: d.conditionsMet,
    conditionsTotal: d.conditionsTotal,
    rejectionReason: d.rejectionReason,
    indicators: d.indicators ? { ...d.indicators, LTP: ltp ?? d.indicators.LTP } : null,
    risk: d.risk,
    planPreview: d.planPreview,
    candleTime: d.candleTime,
    reasons: d.signal === "BUY" ? [`All checks passed — buy ${d.risk?.qty} at ₹${d.risk?.entry}`] : [],
    time: Date.now(),
    candleCount: candles.length,
    candlesNeeded: cfg.EMA_SLOW + 1,
    series: chartSeries(S, 200),   // stock page only — stripped from live broadcasts
  };
}

function analyzeSymbol(symbol) {
  symbol = String(symbol).toUpperCase();
  const token = getToken(symbol);
  const candles = token ? historical.getCandles(token, 5, false) : [];
  return decide(symbol, "INTRADAY", candles);
}

async function analyzeSwing(symbol) {
  symbol = String(symbol).toUpperCase();
  const candles = await dailyData.getDaily(symbol);
  swingCandles.set(symbol, candles);
  return decide(symbol, "SWING", candles);
}

async function analyzeLong(symbol) {
  return longTermService.analyze(String(symbol).toUpperCase());
}

function tally(res, prev) {
  if (res.signal === "BUY" || !res.failedChecks?.length) return;
  if (prev && prev.failedChecks?.[0] === res.failedChecks[0]) return;
  gateFails[res.failedChecks[0]] = (gateFails[res.failedChecks[0]] || 0) + 1;
}

/** Alert + (intraday only) auto-order on a NEW BUY. */
function onDecision(res, state) {
  const prev = state.get(res.symbol);
  state.set(res.symbol, res);
  tally(res, prev);
  if (res.signal !== "BUY" || prev?.signal === "BUY") return;

  const block = entryBlock(res.symbol, res.horizon, res.risk);
  if (block) { res.reasons = [...res.reasons, `Not taken: ${block}`]; res.blocked = block; return; }

  signalRepository.save(res);
  alertEngine.dispatch(res).catch((e) => logger.warn(`[alerts] ${e.message}`));
  if (io) io.emit("signal:new", res);

  if (res.horizon === "INTRADAY") {
    orderService.placeEntry(res.symbol, "BUY", res.risk.entry).then((o) => {
      if (o.placed || o.shadow) {
        positionTracker.open({
          symbol: res.symbol, horizon: "INTRADAY",
          entry: res.risk.entry, stopLoss: res.risk.stopLoss,
          target1: res.risk.target1, target2: res.risk.target2,
          qty: o.qty || res.risk.qty, source: o.placed ? "auto" : "shadow",
        });
        if (io) io.emit("position:update", positionTracker.list());
      }
    }).catch((e) => logger.warn(`[orders] ${e.message}`));
  }
}

// ---------- position management ----------
function trendContext(pos) {
  const horizon = pos.horizon || "INTRADAY";
  const H = cfg.HORIZONS[horizon];
  const candles = horizon === "INTRADAY"
    ? historical.getCandles(getToken(pos.symbol), 5, false)
    : (swingCandles.get(pos.symbol) || []);
  if (!candles.length) return { closedCandle: null, emaTrend: null, barsHeld: 0 };

  const S = swing.series(candles);
  const i = candles.length - 1;
  const emaArr = H.exitEma === 20 ? S.ema20 : S.ema50;
  const closed = candles[i];
  const barsHeld = horizon === "INTRADAY" ? 0 : Math.floor(((Date.now() - pos.openedAt) / 86400000) * 5 / 7);
  return {
    closedCandle: closed.time >= pos.openedAt ? closed : null,  // never judge the entry candle itself
    emaTrend: emaArr[i] ?? null,
    barsHeld,
  };
}

function managePositions() {
  const squareOff = squareOffDue();
  for (const pos of positionTracker.list()) {
    try {
      const state = intradayState.get(pos.symbol);
      const ltp = quoteService.get(pos.symbol)?.ltp ?? state?.price ?? null;
      if (ltp == null) continue;

      const ctx = trendContext(pos);
      const act = exitEngine.evaluate(pos, { price: ltp, squareOff, ...ctx });
      if (!act) continue;

      if (act.action === "BOOK_T1") {
        const r = positionTracker.partialClose(pos.id, ltp);
        if (r) {
          alertEngine.dispatchSetup({
            scanner: "TARGET 1", symbol: pos.symbol,
            note: `Booked ${r.booked} shares at ₹${ltp} (2R). Stop moved to entry — the rest can't lose money. Target 2: ₹${pos.target2}.`,
            time: Date.now(),
          }, ltp).catch(() => {});
          if (io) io.emit("position:update", positionTracker.list());
        }
        continue;
      }

      const closed = positionTracker.close(pos.id, ltp, act.reason);
      lastExitAt.set(pos.symbol, Date.now());
      alertEngine.dispatchExit(closed, { reason: act.reason }).catch(() => {});
      if (closed.source === "auto") {
        orderService.placeExit(pos.symbol, "SELL", closed.initialQty).catch((e) => logger.warn(`[orders] ${e.message}`));
      }
      if (io) {
        io.emit("signal:new", {
          symbol: pos.symbol, signal: "EXIT", horizon: pos.horizon, reasons: [act.reason],
          indicators: { LTP: ltp }, pnl: closed.netPnl, time: Date.now(),
        });
        io.emit("position:update", positionTracker.list());
      }
    } catch (e) {
      logger.error(`[positions] ${pos.symbol}: ${e.message}`);
    }
  }
}

// ---------- passes ----------
async function scanOnce() {
  const results = [];
  for (const symbol of watchlist) {
    try {
      const res = analyzeSymbol(symbol);
      results.push(res);
      onDecision(res, intradayState);
    } catch (e) {
      logger.error(`[scanner] ${symbol}: ${e.message}`);
    }
  }
  managePositions();

  const today = istNow().day;
  if (gateDay !== today) { gateDay = today; for (const k of Object.keys(gateFails)) delete gateFails[k]; }

  if (io) {
    // Chart series are not broadcast — pages that need them fetch over REST.
    io.emit("scanner:update", { results: results.map(({ series, ...r }) => r), marketOpen: isMarketOpen(), time: Date.now() });
  }
  return results;
}

async function scanSwing() {
  const results = [];
  for (const symbol of watchlist) {
    try {
      const res = await analyzeSwing(symbol);
      results.push(res);
      onDecision(res, swingState);
    } catch (e) {
      logger.warn(`[swing] ${symbol}: ${e.message}`);
    }
    await sleep(150);
  }
  if (io) io.emit("swing:update", { results, time: Date.now() });
  return results;
}

// ---------- API ----------
function init(socketIo, symbols) { io = socketIo; watchlist = symbols || []; }
function setWatchlist(symbols) { watchlist = symbols; }
function getLatestSignals() { return [...intradayState.values()]; }
function getSwingSignals() { return [...swingState.values()]; }
function getGateFailCounts() { return { ...gateFails }; }

function start() {
  if (timer) return;
  timer = setInterval(() => { scanOnce().catch((e) => logger.error(`[scanner] ${e.message}`)); }, cfg.SCAN_INTERVAL_MS);
  scanOnce().catch(() => {});
  swingTimer = setInterval(() => { scanSwing().catch(() => {}); }, cfg.SWING_SCAN_INTERVAL_MS);
  scanSwing().catch(() => {});
  logger.info(`[scanner] intraday every ${cfg.SCAN_INTERVAL_MS / 1000}s · swing every ${cfg.SWING_SCAN_INTERVAL_MS / 60000} min · ${watchlist.length} symbols`);
}

function stop() {
  clearInterval(timer);
  clearInterval(swingTimer);
  timer = null;
  swingTimer = null;
}

module.exports = {
  init, start, stop, setWatchlist,
  scanOnce, scanSwing,
  analyzeSymbol, analyzeSwing, analyzeLong,
  getLatestSignals, getSwingSignals, getGateFailCounts,
};
