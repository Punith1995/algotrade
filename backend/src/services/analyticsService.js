/**
 * Computes stats from the recorded signal history:
 * pairs each BUY with the next SELL of the same symbol to estimate P&L,
 * win-rate, score distribution — powers the Analytics page.
 */
const signalRepo = require("../database/repositories/signalRepository");

function compute() {
  const events = signalRepo.all();
  const trades = [];
  const openBuys = new Map();

  for (const e of events) {
    if (e.signal === "BUY") openBuys.set(e.symbol, e);
    else if (e.signal === "SELL" && openBuys.has(e.symbol)) {
      const buy = openBuys.get(e.symbol);
      openBuys.delete(e.symbol);
      if (buy.price && e.price) {
        const pnlPct = ((e.price - buy.price) / buy.price) * 100;
        trades.push({
          symbol: e.symbol, entry: buy.price, exit: e.price,
          pnlPct: +pnlPct.toFixed(2), win: pnlPct > 0,
          score: buy.score, confidence: buy.confidence,
          entryTime: buy.time, exitTime: e.time,
        });
      }
    }
  }

  const wins = trades.filter((t) => t.win).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnlPct, 0);

  // score distribution buckets for the chart
  const buckets = { "0-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };
  for (const e of events) {
    if (e.signal !== "BUY" || e.score == null) continue;
    if (e.score < 40) buckets["0-40"]++;
    else if (e.score < 60) buckets["40-60"]++;
    else if (e.score < 80) buckets["60-80"]++;
    else buckets["80-100"]++;
  }

  // equity curve (cumulative pnl%)
  let cum = 0;
  const curve = trades.map((t) => ({ time: t.exitTime, value: +(cum += t.pnlPct).toFixed(2) }));

  return {
    totalSignals: events.length,
    buys: events.filter((e) => e.signal === "BUY").length,
    sells: events.filter((e) => e.signal === "SELL").length,
    closedTrades: trades.length,
    winRate: trades.length ? +((wins / trades.length) * 100).toFixed(1) : null,
    avgPnlPct: trades.length ? +(totalPnl / trades.length).toFixed(2) : null,
    totalPnlPct: +totalPnl.toFixed(2),
    scoreDistribution: buckets,
    equityCurve: curve,
    recentTrades: trades.slice(-25).reverse(),
  };
}
module.exports = { compute };
