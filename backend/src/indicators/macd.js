const { ema } = require("./ema");
/** MACD 12/26/9. Returns {macd[], signal[], histogram[]}. */
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? fastE[i] - slowE[i] : null
  );
  const valid = macdLine.filter((v) => v != null);
  const sigValid = ema(valid, signalPeriod);
  const signal = new Array(closes.length).fill(null);
  let j = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] != null) { signal[i] = sigValid[j]; j++; }
  }
  const histogram = macdLine.map((v, i) =>
    v != null && signal[i] != null ? v - signal[i] : null
  );
  return { macd: macdLine, signal, histogram };
}
module.exports = { macd };
