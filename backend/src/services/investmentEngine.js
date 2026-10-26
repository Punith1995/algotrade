/**
 * Long-term Investment Engine.
 *
 * TECHNICAL (60 pts) — from 2y of daily candles:
 *   price > 200-DMA (15) · golden cross 50>200 (15) · positioned in the
 *   upper half of the 52w range (10) · steady trend, >60% of days above
 *   200-DMA (10) · positive 6-month return (10)
 *
 * FUNDAMENTAL (40 pts) — when available:
 *   PE 0–30 (10) · ROE > 15% (10) · Debt/Equity < 1 (10) ·
 *   profit margin > 8% OR revenue growth > 10% (10)
 *   (if fundamentals are unavailable, technicals are scaled to /100)
 *
 * Verdict: ≥75 STRONG BUY · ≥60 BUY · ≥45 HOLD · else AVOID.
 */
const { getDaily } = require("./dailyDataService");
const { getFundamentals } = require("./fundamentalsService");
const { ema } = require("../indicators/ema");
const { rsi } = require("../indicators/rsi");

function sma(values, period, at) {
  if (at + 1 < period) return null;
  let s = 0;
  for (let i = at - period + 1; i <= at; i++) s += values[i];
  return s / period;
}

async function analyze(symbol) {
  symbol = symbol.toUpperCase();
  const candles = await getDaily(symbol);
  if (!candles || candles.length < 210) {
    return { symbol, ok: false, error: `Not enough daily history (${candles?.length || 0} days, need 210+)` };
  }
  const closes = candles.map((c) => c.close);
  const last = closes.length - 1;
  const price = closes[last];

  const dma50 = sma(closes, 50, last);
  const dma200 = sma(closes, 200, last);
  const w52 = candles.slice(-252);
  const hi52 = Math.max(...w52.map((c) => c.high));
  const lo52 = Math.min(...w52.map((c) => c.low));
  const rangePos = +(((price - lo52) / (hi52 - lo52 || 1)) * 100).toFixed(1);
  const ret6m = closes.length > 126 ? +(((price - closes[last - 126]) / closes[last - 126]) * 100).toFixed(1) : null;
  const ret1y = closes.length > 252 ? +(((price - closes[last - 252]) / closes[last - 252]) * 100).toFixed(1) : null;
  let daysAbove200 = 0, total200 = 0;
  for (let i = 200; i <= last; i++) {
    const d = sma(closes, 200, i);
    if (d != null) { total200++; if (closes[i] > d) daysAbove200++; }
  }
  const trendConsistency = total200 ? +((daysAbove200 / total200) * 100).toFixed(0) : 0;
  const weeklyRSI = rsi(closes.filter((_, i) => i % 5 === 0), 14).at(-1);
  let peak = -Infinity, maxDD = 0;
  for (const c of closes) { peak = Math.max(peak, c); maxDD = Math.max(maxDD, (peak - c) / peak); }

  const tech = {};
  tech.above200DMA = price > dma200 ? 15 : 0;
  tech.goldenCross = dma50 != null && dma200 != null && dma50 > dma200 ? 15 : 0;
  tech.rangePosition = rangePos >= 50 ? 10 : rangePos >= 35 ? 5 : 0;
  tech.trendConsistency = trendConsistency >= 60 ? 10 : trendConsistency >= 45 ? 5 : 0;
  tech.momentum6m = ret6m != null && ret6m > 0 ? 10 : 0;
  const techScore = Object.values(tech).reduce((s, v) => s + v, 0);

  const funda = await getFundamentals(symbol).catch(() => ({ available: false }));
  let fundaScore = 0;
  const fb = {};
  if (funda.available) {
    fb.valuation = funda.pe != null && funda.pe > 0 && funda.pe < 30 ? 10 : funda.pe != null && funda.pe < 45 ? 5 : 0;
    fb.roe = funda.roe != null && funda.roe > 15 ? 10 : funda.roe != null && funda.roe > 10 ? 5 : 0;
    fb.leverage = funda.debtToEquity != null && funda.debtToEquity < 1 ? 10 : funda.debtToEquity != null && funda.debtToEquity < 2 ? 5 : 0;
    fb.growth = (funda.profitMargin != null && funda.profitMargin > 8) || (funda.revenueGrowth != null && funda.revenueGrowth > 10) ? 10 : 0;
    fundaScore = Object.values(fb).reduce((s, v) => s + v, 0);
  }

  const score = funda.available ? techScore + fundaScore : Math.round((techScore / 60) * 100);
  const verdict = score >= 75 ? "STRONG BUY" : score >= 60 ? "BUY" : score >= 45 ? "HOLD" : "AVOID";

  return {
    symbol, ok: true, price: +price.toFixed(2), score, verdict,
    technical: {
      score: techScore, breakdown: tech,
      dma50: dma50 && +dma50.toFixed(2), dma200: dma200 && +dma200.toFixed(2),
      week52High: +hi52.toFixed(2), week52Low: +lo52.toFixed(2), rangePos,
      ret6m, ret1y, trendConsistency, weeklyRSI: weeklyRSI && +weeklyRSI.toFixed(1),
      maxDrawdownPct: +(maxDD * 100).toFixed(1),
    },
    fundamentals: { ...funda, score: funda.available ? fundaScore : null, breakdown: funda.available ? fb : null },
    dailyCandles: candles.slice(-260),
    time: Date.now(),
  };
}

module.exports = { analyze };
