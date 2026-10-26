/**
 * Every Angel One market-data and account call goes through here.
 *
 * - Calls are queued and spaced (GAP_MS) so bursts stay under Angel's rate limits.
 * - Responses are converted to the shapes the rest of the app already uses,
 *   so the scanner, candles and pages did not need to change.
 * - Order placement is blocked (signal-only mode).
 */
const broker = require("../config/broker");
const { angelTokenOf, internalOf } = require("./instrumentService");
const { toWeekly } = require("./swingStrategy");

const GAP_MS = 500;              // spacing between Angel One calls
const QUOTE_CHUNK = 50;          // max tokens per quote request
const IST_MS = 19800000;
const SPAN_MS = { "1": 60000, "5": 300000, "15": 900000, D: 86400000 };
const INTERVAL = { "1": "ONE_MINUTE", "5": "FIVE_MINUTE", "15": "FIFTEEN_MINUTE", D: "ONE_DAY" };
// Longest window Angel One returns in one candle request, per interval.
const MAX_DAYS = { "1": 30, "5": 100, "15": 200, D: 2000 };

let chain = Promise.resolve();
let lastAt = 0;
function enqueue(fn) {
  const run = async () => {
    const wait = Math.max(0, lastAt + GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});     // one failure never blocks the queue
  return p;
}

/** Date → "YYYY-MM-DD HH:mm" in IST, the format Angel One's candle API expects. */
const istStamp = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 16).replace("T", " ");

/**
 * Live quotes. Input: ["NSE:SBIN-EQ", ...].
 * Output: { "NSE:SBIN-EQ": { last_price, volume_traded, ohlc: { open, high, low, close } } }
 * ohlc.close is the previous close (Angel's quote close field, confirmed by its netChange).
 */
async function quotes(symbols) {
  const pairs = symbols.map((s) => [s, angelTokenOf(s)]).filter(([, t]) => t);
  const out = {};
  for (let i = 0; i < pairs.length; i += QUOTE_CHUNK) {
    const tokens = pairs.slice(i, i + QUOTE_CHUNK).map(([, t]) => t);
    const data = await enqueue(() => broker.call("POST", broker.ROUTES.quote, {
      mode: "FULL", exchangeTokens: { NSE: tokens },
    }));
    for (const d of data?.fetched || []) {
      const id = internalOf(d.symbolToken);
      if (!id) continue;
      out[id] = {
        last_price: d.ltp,
        volume_traded: d.tradeVolume ?? null,
        ohlc: { open: d.open, high: d.high, low: d.low, close: d.close },
      };
    }
  }
  return out;
}

/**
 * Historical candles. `symbol` is an app token ("NSE:SBIN-EQ").
 * resolution: "1", "5", "15", "D" (day), "1W" (week, built from daily candles).
 * Drops the candle still forming, so only closed candles are returned.
 */
async function history(symbol, resolution, from, to) {
  if (resolution === "1W") {
    const daily = await history(symbol, "D", from, to);
    return toWeekly(daily.map((c) => ({ ...c, time: c.date.getTime() })))
      .map((w) => ({ date: new Date(w.time), open: w.open, high: w.high, low: w.low, close: w.close, volume: w.volume }));
  }
  const token = angelTokenOf(symbol);
  if (!token) throw new Error(`No Angel One token for ${symbol}`);
  const interval = INTERVAL[resolution];
  if (!interval) throw new Error(`Unsupported resolution ${resolution}`);

  const span = SPAN_MS[resolution];
  const maxMs = MAX_DAYS[resolution] * 86400000;
  const now = Date.now();
  const end = Math.min(to.getTime(), now);
  const rows = new Map();

  for (let start = from.getTime(); start < end;) {
    const stop = Math.min(start + maxMs, end);
    const data = await enqueue(() => broker.call("POST", broker.ROUTES.candles, {
      exchange: "NSE", symboltoken: token, interval,
      fromdate: istStamp(start), todate: istStamp(stop),
    }));
    for (const [ts, open, high, low, close, volume] of data || []) {
      const date = new Date(ts);
      if (date.getTime() + span > now) continue;      // still forming
      rows.set(date.getTime(), { date, open, high, low, close, volume: volume || 0 });
    }
    start = stop;
  }
  return [...rows.values()].sort((a, b) => a.date - b.date);
}

// SIGNAL-ONLY MODE: this app never sends orders. This is the single choke point
// every order path goes through, so nothing can slip past it.
const ORDERS_DISABLED = true;

async function placeOrder() {
  if (ORDERS_DISABLED) {
    throw Object.assign(new Error("Order placement is disabled — this app only shows signals."), { status: 403 });
  }
  throw new Error("Order placement is not implemented.");
}

async function holdings() { return broker.call("GET", broker.ROUTES.holdings); }
async function positions() { return broker.call("GET", broker.ROUTES.positions); }
async function orders() { return broker.call("GET", broker.ROUTES.orderBook); }

module.exports = { enqueue, quotes, history, placeOrder, holdings, positions, orders };
