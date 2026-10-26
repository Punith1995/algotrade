const db = require("../db");
module.exports = {
  save: (t) => db.push("trades", t),
  all: () => db.get("trades"),
  stats() {
    const trades = db.get("trades");
    const pnlOf = (t) => (t.netPnl ?? t.pnl);   // costs-adjusted when available
    const wins = trades.filter((t) => pnlOf(t) > 0);
    const gross = trades.reduce((s, t) => s + pnlOf(t), 0);
    return {
      total: trades.length,
      wins: wins.length,
      losses: trades.length - wins.length,
      winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0,
      totalPnl: +gross.toFixed(2),
      avgPnl: trades.length ? +(gross / trades.length).toFixed(2) : 0,
      curve: trades.reduce((acc, t) => { acc.push(+(((acc[acc.length - 1] || 0)) + (t.netPnl ?? t.pnl)).toFixed(2)); return acc; }, []),
    };
  },
};
