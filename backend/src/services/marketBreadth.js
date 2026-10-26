/** Breadth across the scanned universe: trend advancers/decliners and % above the 50 EMA. */
const scanner = require("../engine/scannerEngine");
function snapshot() {
  const sigs = scanner.getLatestSignals().filter((s) => !s.warming && s.indicators);
  let adv = 0, dec = 0, aboveEma50 = 0;
  for (const s of sigs) {
    const { LTP, EMA50 } = s.indicators;
    if (s.checks?.trend) adv++; else dec++;
    if (EMA50 != null && LTP > EMA50) aboveEma50++;
  }
  const total = sigs.length || 1;
  return {
    advancing: adv, declining: dec, neutral: 0,
    pctAboveEma50: +((aboveEma50 / total) * 100).toFixed(1),
    breadthScore: +(((adv - dec) / total) * 100).toFixed(1),
    universe: sigs.length,
  };
}
module.exports = { snapshot };
