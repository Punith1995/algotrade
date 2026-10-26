/**
 * Exponential moving average over a plain number array.
 * Seeded with the simple average of the first `period` values.
 * Returns an array the same length as `values`, with null until seeded.
 */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period || period < 1) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
