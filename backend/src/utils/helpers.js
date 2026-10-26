const r2 = (v) => (v == null ? null : +Number(v).toFixed(2));
const pct = (a, b) => (b ? +(((a - b) / b) * 100).toFixed(2) : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
module.exports = { r2, pct, clamp, avg };
