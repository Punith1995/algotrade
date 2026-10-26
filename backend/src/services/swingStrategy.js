/**
 * THE STRATEGY ENGINE — one rule set for intraday, swing and long-term.
 *
 * Pure functions: candles in, decision out. No I/O, no state.
 *
 *   series(candles)        indicator arrays, computed once (causal, so any index is valid)
 *   at(S, i, horizon)      decision on candle i — BUY or WAIT, with every check named
 *   planAt(S, i, horizon)  stop, 2R / 3R targets and position size for an entry
 *   evaluate(candles, h)   convenience: decision on the last candle
 *   toWeekly(daily)        resample daily candles into weekly candles (for long-term)
 */
const cfg = require("../config/strategy");
const { ema } = require("../indicators/ema");
const { rsi } = require("../indicators/rsi");
const { macd } = require("../indicators/macd");

const IST_OFFSET_MS = 19800000;
const DAY_MS = 86400000;
const r1 = (v) => (v == null ? null : +v.toFixed(1));
const r2 = (v) => (v == null ? null : +v.toFixed(2));

function horizonCfg(horizon) {
  const H = cfg.HORIZONS[horizon];
  if (!H) throw new Error(`Unknown horizon "${horizon}"`);
  return H;
}

function series(candles) {
  const close = candles.map((c) => c.close);
  const volume = candles.map((c) => c.volume || 0);
  const m = macd(close, cfg.MACD_FAST, cfg.MACD_SLOW, cfg.MACD_SIGNAL);
  return {
    candles, close, volume,
    ema20: ema(close, cfg.EMA_FAST),
    ema50: ema(close, cfg.EMA_MID),
    ema200: ema(close, cfg.EMA_SLOW),
    rsi: rsi(close, cfg.RSI_PERIOD),
    macd: m.macd,
    macdSignal: m.signal,
  };
}

/** Highest high of the previous N candles — the level being broken. Excludes candle i. */
function resistanceAt(S, i) {
  let hi = -Infinity;
  for (let k = Math.max(0, i - cfg.RESISTANCE_LOOKBACK); k < i; k++) hi = Math.max(hi, S.candles[k].high);
  return hi === -Infinity ? null : hi;
}

/** Lowest low of the last N candles, including candle i — the support the stop sits below. */
function supportAt(S, i) {
  let lo = Infinity;
  for (let k = Math.max(0, i - cfg.SUPPORT_LOOKBACK + 1); k <= i; k++) lo = Math.min(lo, S.candles[k].low);
  return lo === Infinity ? null : lo;
}

/** Candle i's volume divided by the average of the previous N candles. */
function volRatioAt(S, i) {
  let sum = 0, n = 0;
  for (let k = Math.max(0, i - cfg.VOL_AVG_PERIOD); k < i; k++) { sum += S.volume[k]; n++; }
  const avg = n ? sum / n : 0;
  return avg > 0 ? S.volume[i] / avg : 0;
}

/**
 * Stop, targets and size for a long entry on candle i.
 * Stop = support (minus optional buffer). Risk is capped at RISK_PER_TRADE_PCT of capital.
 */
function planAt(S, i, horizon, entryPrice = null) {
  const H = horizonCfg(horizon);
  const entry = entryPrice ?? S.close[i];
  const support = supportAt(S, i);
  if (support == null) return { ok: false, reason: "not enough candles for a support level" };

  const stopLoss = +(support * (1 - (cfg.STOP_BUFFER_PCT || 0) / 100)).toFixed(2);
  const risk = +(entry - stopLoss).toFixed(2);
  if (!(risk > 0)) return { ok: false, reason: "support is at or above the entry — no valid stop" };

  const riskPct = +((risk / entry) * 100).toFixed(2);
  if (riskPct > H.maxStopPct) {
    return { ok: false, reason: `stop is ${riskPct}% away — wider than the ${H.maxStopPct}% limit for ${H.label}` };
  }

  const budget = (cfg.CAPITAL * cfg.RISK_PER_TRADE_PCT) / 100;
  const qty = Math.floor(budget / risk);
  if (qty < 1) return { ok: false, reason: `one share risks ₹${risk} — more than the ₹${budget.toFixed(0)} risk budget` };

  const target1 = +(entry + cfg.T1_R * risk).toFixed(2);
  const target2 = +(entry + cfg.T2_R * risk).toFixed(2);
  return {
    ok: true, side: "LONG",
    entry: +entry.toFixed(2), stopLoss,
    target: target1, target1, target2,
    rr1: cfg.T1_R, rr2: cfg.T2_R,
    risk, riskPct,
    support: +support.toFixed(2),
    qty, riskAmount: +(qty * risk).toFixed(2),
    budget: +budget.toFixed(2),
    bookAtT1Pct: cfg.BOOK_AT_T1_PCT,
  };
}

const REASON = {
  trend: "EMAs not stacked 20 > 50 > 200 — no confirmed uptrend",
  momentum: "RSI outside 55–70 or not rising",
  macd: "MACD line is below its signal line",
  breakout: "no fresh close above resistance",
  volume: "breakout volume is below 1.5× average",
  risk: null, // filled with the plan's own reason
};

/** Decision on candle i for a horizon. Every check is named so the UI can show exactly what failed. */
function at(S, i, horizon = "SWING") {
  const H = horizonCfg(horizon);
  const need = Math.max(cfg.EMA_SLOW, cfg.RESISTANCE_LOOKBACK, cfg.SUPPORT_LOOKBACK) + 1;
  if (i < need || S.ema200[i] == null || S.rsi[i] == null || S.macd[i] == null || S.macdSignal[i] == null) {
    return {
      ready: false, warming: true, horizon, label: H.label, signal: "WAIT",
      checks: {}, failedChecks: ["warmup"], conditionsMet: 0, conditionsTotal: 6,
      rejectionReason: `warming up — needs ${cfg.EMA_SLOW + 1} candles`,
      indicators: null, risk: null, candleTime: S.candles[i]?.time ?? null,
    };
  }

  const close = S.close[i];
  const prevClose = S.close[i - 1];
  const res = resistanceAt(S, i);
  const sup = supportAt(S, i);
  const vr = volRatioAt(S, i);
  const rsiNow = S.rsi[i], rsiPrev = S.rsi[i - 1];

  const indicators = {
    LTP: r2(close),
    EMA20: r2(S.ema20[i]), EMA50: r2(S.ema50[i]), EMA200: r2(S.ema200[i]),
    RSI: r1(rsiNow), RSI_PREV: r1(rsiPrev),
    MACD: r2(S.macd[i]), MACD_SIGNAL: r2(S.macdSignal[i]),
    RESISTANCE: r2(res), SUPPORT: r2(sup), VOL_RATIO: r2(vr),
  };

  const checks = {
    trend: S.ema20[i] > S.ema50[i] && S.ema50[i] > S.ema200[i],
    momentum: rsiNow >= cfg.RSI_MIN && rsiNow <= cfg.RSI_MAX && rsiNow > rsiPrev,
    macd: S.macd[i] > S.macdSignal[i],
    breakout: res != null && close > res && prevClose <= res,
    volume: vr >= cfg.VOL_MULT,
  };
  const plan = planAt(S, i, horizon);
  checks.risk = plan.ok;

  const failed = Object.keys(checks).filter((k) => !checks[k]);
  const passed = failed.length === 0;
  const reasonOf = (k) => (k === "risk" ? plan.reason : REASON[k]);

  return {
    ready: true, warming: false, horizon, label: H.label,
    signal: passed ? "BUY" : "WAIT",
    checks, failedChecks: failed,
    conditionsMet: Object.values(checks).filter(Boolean).length,
    conditionsTotal: Object.keys(checks).length,
    rejectionReason: failed.length ? reasonOf(failed[0]) : null,
    indicators,
    risk: passed ? plan : null,
    planPreview: plan.ok ? plan : null,
    candleTime: S.candles[i].time,
  };
}

function evaluate(candles, horizon = "SWING") {
  const S = series(candles);
  return at(S, candles.length - 1, horizon);
}

/** Resample daily candles into weekly candles (weeks start Monday, IST). */
function toWeekly(daily) {
  const sorted = [...daily].sort((a, b) => a.time - b.time);
  const weeks = new Map();
  for (const c of sorted) {
    const ist = c.time + IST_OFFSET_MS;
    const dayIdx = Math.floor(ist / DAY_MS);
    const dow = (new Date(ist).getUTCDay() + 6) % 7; // Monday = 0
    const monday = dayIdx - dow;
    let w = weeks.get(monday);
    if (!w) {
      w = { time: monday * DAY_MS - IST_OFFSET_MS, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 };
      weeks.set(monday, w);
    }
    w.high = Math.max(w.high, c.high);
    w.low = Math.min(w.low, c.low);
    w.close = c.close;
    w.volume += c.volume || 0;
  }
  return [...weeks.values()];
}

module.exports = { series, at, planAt, evaluate, toWeekly, resistanceAt, supportAt, volRatioAt };
