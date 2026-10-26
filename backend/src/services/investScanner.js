/**
 * Long-Term Investment Screener — segment aware.
 * MIDSMALL (default): ~110 mid & small caps — higher growth, higher risk;
 *                      the 90+ bar matters even more here.
 * LARGE: the NIFTY-100 space.
 * Each segment scans in the background (2–4 min, Yahoo politely rate
 * limited), caches its own results, and serves the Top N scoring ≥ 90.
 */
const { analyze } = require("./longTermService");
const logger = require("../utils/logger");

const UNIVERSES = {
  MIDSMALL: require("../config/investUniverseMidSmall"),
  LARGE: require("../config/investUniverse"),
};

const states = {
  MIDSMALL: { time: null, results: [], progress: { done: 0, total: 0 }, scanning: false },
  LARGE: { time: null, results: [], progress: { done: 0, total: 0 }, scanning: false },
};

function seg(name) { return String(name || "LARGE").toUpperCase() === "MIDSMALL" ? "MIDSMALL" : "LARGE"; }

function start(segment) {
  const key = seg(segment);
  const st = states[key];
  if (st.scanning) return snapshot(key);
  const universe = UNIVERSES[key];
  states[key] = { ...st, scanning: true, progress: { done: 0, total: universe.length } };
  (async () => {
    const out = [];
    for (const symbol of universe) {
      try {
        const a = await analyze(symbol);
        if (a.combinedScore != null) {
          out.push({
            symbol, score: a.combinedScore, verdict: a.verdict,
            fundScore: a.fundamentals?.score ?? null,
            techScore: a.technicalLong?.score ?? null,
            cagr3y: a.technicalLong?.metrics?.cagr3y ?? null,
            pe: a.fundamentals?.pe != null ? +a.fundamentals.pe.toFixed(1) : null,
            roe: a.fundamentals?.roe ?? null,
          });
        }
      } catch (e) { logger.warn(`[invest-scan:${key}] ${symbol}: ${e.message}`); }
      states[key].progress.done++;
      await new Promise((r) => setTimeout(r, 350));
    }
    out.sort((a, b) => b.score - a.score);
    states[key] = { time: Date.now(), results: out, progress: states[key].progress, scanning: false };
    logger.info(`[invest-scan:${key}] Done — ${out.length} analyzed, ${out.filter((r) => r.score >= 90).length} scored 90+`);
  })();
  return snapshot(key);
}

function snapshot(segment, top = 30, minScore = 90) {
  const key = seg(segment);
  const st = states[key];
  const qualified = st.results.filter((r) => r.score >= minScore).slice(0, top);
  const nearMisses = st.results.filter((r) => r.score >= 80 && r.score < minScore).slice(0, 10);
  return {
    segment: key, time: st.time, scanning: st.scanning, progress: st.progress,
    analyzed: st.results.length, minScore, qualified, nearMisses,
  };
}

module.exports = { start, snapshot };
