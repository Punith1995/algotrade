/**
 * Builds OHLCV candles from live ticks.
 *
 * This is the fix for "I paid Rs.500 but get no candles":
 * the Rs.500 Angel One API plan streams live ticks but does NOT
 * include the Historical Candle API (a Rs.2000/month add-on).
 * So we construct 1-minute candles from ticks ourselves and
 * roll them up into 5m and 15m series.
 *
 * Per-tick volume is derived from the difference in the tick's
 * cumulative day volume (volume_traded), which is how Angel One
 * reports it in FULL mode.
 */
const MAX_CANDLES = 500;

// token -> { current: {1: candle, 5: candle, 15: candle},
//            series:  {1: [], 5: [], 15: []},
//            lastCumVol: number }
const books = new Map();
const closedListeners = []; // cb(token, timeframe, candle)

function onCandleClose(cb) { closedListeners.push(cb); }

function bucketStart(date, minutes) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / minutes) * minutes);
  return d.getTime();
}

function getBook(token) {
  if (!books.has(token)) {
    books.set(token, { current: {}, series: { 1: [], 5: [], 15: [] }, lastCumVol: null });
  }
  return books.get(token);
}

function ingestTick(tick, now = new Date()) {
  const token = tick.instrument_token;
  const price = tick.last_price;
  if (!price) return;

  const book = getBook(token);

  // Volume delta from cumulative day volume (indices have none)
  let volDelta = 0;
  const cum = tick.volume_traded ?? tick.volume ?? null;
  if (cum != null) {
    if (book.lastCumVol != null && cum >= book.lastCumVol) volDelta = cum - book.lastCumVol;
    book.lastCumVol = cum;
  }

  for (const tf of [1, 5, 15, 30, 60]) {
    const start = bucketStart(now, tf);
    let c = book.current[tf];

    if (!c || c.time !== start) {
      // close previous candle
      if (c) {
        book.series[tf].push(c);
        if (book.series[tf].length > MAX_CANDLES) book.series[tf].shift();
        for (const cb of closedListeners) cb(token, tf, c);
      }
      c = { time: start, open: price, high: price, low: price, close: price, volume: 0 };
      book.current[tf] = c;
    }

    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    c.volume += volDelta;
  }
}

/**
 * Seed the builder with historical candles (used when the user
 * DOES have the historical add-on, or on warm restart).
 * candles: [{date, open, high, low, close, volume}]
 */
function seed(token, timeframe, candles) {
  const book = getBook(token);
  book.series[timeframe] = candles
    .map((c) => ({
      time: new Date(c.date).getTime(),
      open: c.open, high: c.high, low: c.low, close: c.close,
      volume: c.volume || 0,
    }))
    .slice(-MAX_CANDLES);
}

/** Returns closed candles + the live (forming) candle appended. */
function getCandles(token, timeframe, includeLive = true) {
  const book = books.get(token);
  if (!book) return [];
  const out = [...book.series[timeframe]];
  if (includeLive && book.current[timeframe]) out.push({ ...book.current[timeframe], live: true });
  return out;
}

function candleCount(token, timeframe) {
  const book = books.get(token);
  return book ? book.series[timeframe].length : 0;
}

module.exports = { ingestTick, seed, getCandles, candleCount, onCandleClose };
