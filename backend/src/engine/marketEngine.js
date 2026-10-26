/** One-call market snapshot for the dashboard header widgets. */
const tickerService = require("../services/tickerService");
const { NIFTY50_TOKEN } = require("../services/instrumentService");
const marketBreadth = require("../services/marketBreadth");
const { isMarketOpen } = require("../config/marketTimings");

function snapshot(watchlist) {
  const nf = tickerService.getLastTick(NIFTY50_TOKEN);
  const nifty = nf?.ohlc?.open
    ? { ltp: nf.last_price, changePct: +(((nf.last_price - nf.ohlc.open) / nf.ohlc.open) * 100).toFixed(2), ohlc: nf.ohlc }
    : null;
  const breadth = marketBreadth.snapshot();
  // Fear/Greed 0-100 from NIFTY change + breadth
  let fg = 50;
  if (nifty) fg += nifty.changePct * 12;
  fg += (breadth.breadthScore || 0) * 0.3;
  fg = Math.round(Math.max(0, Math.min(100, fg)));
  return { nifty, breadth, fearGreed: fg, marketOpen: isMarketOpen(), time: Date.now() };
}
module.exports = { snapshot };
