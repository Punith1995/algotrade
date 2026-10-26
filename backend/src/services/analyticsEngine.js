/**
 * MODULE 12 — ANALYTICS ENGINE
 * Full institutional metric set plus the self-optimisation report:
 * best/worst pattern, sector, exit, hour and weekday, computed from
 * closed trades only. No future data, no fitting.
 */
const { sectorOf } = require("../config/sectors");

const pnl = (t) => (t.netPnl ?? t.net ?? t.pnl ?? 0);
const isWin = (t) => pnl(t) > 0;
const istParts = (d) => {
  const x = new Date(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return { hour: x.getHours(), weekday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][x.getDay()],
           month: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}` };
};

function metrics(trades = []) {
  const n = trades.length;
  if (!n) return { trades: 0 };
  const wins = trades.filter(isWin), losses = trades.filter((t) => !isWin(t));
  const gross = trades.reduce((s, t) => s + pnl(t), 0);
  const grossWin = wins.reduce((s, t) => s + pnl(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = (wins.length / n) * 100;
  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

  // equity curve, drawdown curve
  const sorted = [...trades].sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
  let cum = 0, peak = 0, maxDD = 0;
  const curve = [], ddCurve = [];
  const rets = [];
  for (const t of sorted) {
    cum += pnl(t); curve.push(+cum.toFixed(2));
    peak = Math.max(peak, cum);
    const dd = peak - cum; ddCurve.push(+dd.toFixed(2));
    maxDD = Math.max(maxDD, dd);
    rets.push(pnl(t));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1));
  const downside = rets.filter((r) => r < 0);
  const dsd = downside.length ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) : 0;

  const bucket = (keyFn) => {
    const g = {};
    for (const t of trades) {
      const k = keyFn(t) || "UNKNOWN";
      (g[k] = g[k] || []).push(t);
    }
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, {
      trades: v.length, wins: v.filter(isWin).length,
      winRate: +((v.filter(isWin).length / v.length) * 100).toFixed(1),
      net: +v.reduce((s, t) => s + pnl(t), 0).toFixed(2),
    }]));
  };

  return {
    trades: n, wins: wins.length, losses: losses.length,
    winRate: +winRate.toFixed(1),
    grossProfit: +grossWin.toFixed(2), grossLoss: +grossLoss.toFixed(2), netPnl: +gross.toFixed(2),
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : null,
    expectancy: +expectancy.toFixed(2),
    avgWin: +avgWin.toFixed(2), avgLoss: +avgLoss.toFixed(2),
    rewardRisk: avgLoss ? +(avgWin / avgLoss).toFixed(2) : null,
    maxDrawdown: +maxDD.toFixed(2),
    sharpe: sd ? +((mean / sd) * Math.sqrt(252)).toFixed(2) : null,
    sortino: dsd ? +((mean / dsd) * Math.sqrt(252)).toFixed(2) : null,
    calmar: maxDD ? +(gross / maxDD).toFixed(2) : null,
    recoveryFactor: maxDD ? +(gross / maxDD).toFixed(2) : null,
    curve, ddCurve,
    // #20 MFE vs MAE and holding-time analysis
    avgMFE: +(trades.reduce((s, t) => s + (t.mfeR ?? 0), 0) / n).toFixed(2),
    avgMAE: +(trades.reduce((s, t) => s + (t.maeR ?? 0), 0) / n).toFixed(2),
    avgMFEwin: wins.length ? +(wins.reduce((s, t) => s + (t.mfeR ?? 0), 0) / wins.length).toFixed(2) : null,
    avgMFEloss: losses.length ? +(losses.reduce((s, t) => s + (t.mfeR ?? 0), 0) / losses.length).toFixed(2) : null,
    avgHoldingMin: +(trades.reduce((s, t) => s + (t.holdingMin ?? 0), 0) / n).toFixed(0),
    holdingBuckets: (() => {
      const b = { "<15m": 0, "15-30m": 0, "30-60m": 0, "1-2h": 0, ">2h": 0 };
      for (const t of trades) {
        const h = t.holdingMin ?? 0;
        if (h < 15) b["<15m"]++; else if (h < 30) b["15-30m"]++;
        else if (h < 60) b["30-60m"]++; else if (h < 120) b["1-2h"]++; else b[">2h"]++;
      }
      return b;
    })(),
    totalCosts: +trades.reduce((s, t) => s + (t.costs ?? 0), 0).toFixed(2),
    avgCostPerTrade: +(trades.reduce((s, t) => s + (t.costs ?? 0), 0) / n).toFixed(2),
    costsAsPctOfGross: (() => {
      const g = Math.abs(trades.reduce((s, t) => s + (t.gross ?? t.pnl ?? 0), 0));
      const c = trades.reduce((s, t) => s + (t.costs ?? 0), 0);
      return g ? +((c / g) * 100).toFixed(1) : null;
    })(),
    byPattern: bucket((t) => t.pattern || t.entryModel),
    bySector: bucket((t) => sectorOf(t.symbol)),
    byRegime: bucket((t) => t.regime),
    byExit: bucket((t) => (t.reason || "").split("(")[0].trim()),
    byHour: bucket((t) => `${istParts(t.closedAt).hour}:00`),
    byWeekday: bucket((t) => istParts(t.closedAt).weekday),
    byMonth: bucket((t) => istParts(t.closedAt).month),
    bySymbol: bucket((t) => t.symbol),
  };
}

/** SELF-OPTIMISATION: best/worst of everything, with plain-language advice. */
function selfOptimise(m) {
  if (!m || !m.trades) return null;
  const best = (obj, min = 3) => Object.entries(obj || {}).filter(([, v]) => v.trades >= min)
    .sort((a, b) => b[1].net - a[1].net)[0] || null;
  const worst = (obj, min = 3) => Object.entries(obj || {}).filter(([, v]) => v.trades >= min)
    .sort((a, b) => a[1].net - b[1].net)[0] || null;
  const fmt = (e) => e ? `${e[0]} (${e[1].trades} trades, ${e[1].winRate}% win, ₹${e[1].net})` : "not enough data";

  const suggestions = [];
  const wp = worst(m.byPattern);
  if (wp && wp[1].net < 0) suggestions.push(`Disable or down-weight the ${wp[0]} entry model — it has lost ₹${Math.abs(wp[1].net)} over ${wp[1].trades} trades.`);
  const ws = worst(m.bySector);
  if (ws && ws[1].net < 0) suggestions.push(`Reduce exposure to the ${ws[0]} sector — negative expectancy in this sample.`);
  const wh = worst(m.byHour);
  if (wh && wh[1].net < 0) suggestions.push(`Avoid new entries around ${wh[0]} — worst hour in this sample.`);
  const we = worst(m.byExit);
  if (we && we[1].net < 0) suggestions.push(`Review the "${we[0]}" exit rule — it is closing trades at a loss most often.`);
  if (m.profitFactor != null && m.profitFactor < 1.3) suggestions.push(`Profit factor ${m.profitFactor} is below the 1.8 target — tighten entry quality before adding size.`);
  if (m.winRate < 45 && m.rewardRisk != null && m.rewardRisk < 1.8) suggestions.push(`Win rate ${m.winRate}% with reward/risk ${m.rewardRisk} — neither leg is carrying the system; let winners run further.`);
  if (m.avgMFEwin != null && m.avgMFEloss != null && m.avgMFEwin > 0 && m.rewardRisk != null && m.rewardRisk < 1.3) {
    suggestions.push(`Winners reach ${m.avgMFEwin}R at their best but you only bank ${m.rewardRisk}R on average — the exit is leaving money on the table, not the entry.`);
  }
  if (m.avgMFEloss != null && m.avgMFEloss >= 0.8) {
    suggestions.push(`Losing trades still reached ${m.avgMFEloss}R in profit before reversing — consider booking the first tranche earlier or tightening to breakeven sooner.`);
  }
  if (m.costsAsPctOfGross != null && m.costsAsPctOfGross > 30) {
    suggestions.push(`Costs are ${m.costsAsPctOfGross}% of gross P&L — trade less or hold longer; the edge is being eaten by brokerage.`);
  }
  if (!suggestions.length) suggestions.push("No structural weakness stands out in this sample. Keep the configuration frozen and gather more trades.");

  return {
    bestPattern: fmt(best(m.byPattern)), worstPattern: fmt(worst(m.byPattern)),
    bestSector: fmt(best(m.bySector)), worstSector: fmt(worst(m.bySector)),
    bestExit: fmt(best(m.byExit)), worstExit: fmt(worst(m.byExit)),
    bestHour: fmt(best(m.byHour)), worstHour: fmt(worst(m.byHour)),
    bestWeekday: fmt(best(m.byWeekday)), worstWeekday: fmt(worst(m.byWeekday)),
    suggestions,
  };
}

/** Monte Carlo: reshuffle trade order to test how much of the curve was luck. */
function monteCarlo(trades = [], runs = 500) {
  if (trades.length < 10) return null;
  const rets = trades.map(pnl);
  const finals = [], dds = [];
  for (let r = 0; r < runs; r++) {
    const shuffled = [...rets].sort(() => Math.random() - 0.5);
    let cum = 0, peak = 0, dd = 0;
    for (const x of shuffled) { cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
    finals.push(cum); dds.push(dd);
  }
  finals.sort((a, b) => a - b); dds.sort((a, b) => a - b);
  const pct = (arr, p) => +arr[Math.floor(arr.length * p)].toFixed(0);
  return {
    runs, medianNet: pct(finals, 0.5), worst5pct: pct(finals, 0.05), best5pct: pct(finals, 0.95),
    medianMaxDD: pct(dds, 0.5), worstMaxDD: pct(dds, 0.95),
    probProfit: +((finals.filter((f) => f > 0).length / runs) * 100).toFixed(1),
  };
}

/** Walk-forward: split chronologically into training and out-of-sample halves. */
function walkForward(trades = [], folds = 3) {
  if (trades.length < 20) return null;
  const sorted = [...trades].sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
  const size = Math.floor(sorted.length / folds);
  const out = [];
  for (let f = 0; f < folds; f++) {
    const seg = sorted.slice(f * size, f === folds - 1 ? undefined : (f + 1) * size);
    const m = metrics(seg);
    out.push({ fold: f + 1, trades: m.trades, winRate: m.winRate, profitFactor: m.profitFactor,
               netPnl: m.netPnl, maxDrawdown: m.maxDrawdown });
  }
  const pfs = out.map((o) => o.profitFactor).filter((v) => v != null);
  const stable = pfs.length >= 2 && Math.min(...pfs) > 1;
  return { folds: out, parameterStability: stable ? "STABLE — profitable in every fold" : "UNSTABLE — at least one fold lost money" };
}
module.exports = { metrics, selfOptimise, monteCarlo, walkForward };
