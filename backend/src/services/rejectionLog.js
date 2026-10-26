/** Records why each symbol was rejected on the latest scan, for the UI and reports. */
const log = new Map();          // symbol -> { reason, gate, at, side }
const counts = {};              // gate -> count today
let day = null;

function record(symbol, side, gate, reason) {
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  if (day !== today) { day = today; for (const k of Object.keys(counts)) delete counts[k]; }
  const prev = log.get(symbol);
  if (!prev || prev.gate !== gate) counts[gate] = (counts[gate] || 0) + 1;
  log.set(symbol, { symbol, side, gate, reason, at: Date.now() });
}
function clear(symbol) { log.delete(symbol); }
function all() { return [...log.values()].sort((a, b) => b.at - a.at); }
function topGates(n = 5) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([gate, count]) => ({ gate, count }));
}
module.exports = { record, clear, all, topGates };
