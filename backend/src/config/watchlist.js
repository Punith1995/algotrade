/**
 * Default watchlist: LARGE CAPS ONLY.
 * Mid and small caps are excluded from intraday entirely — thinner books,
 * wider spreads, gap risk and slippage that quietly destroy an intraday
 * edge. Large caps give depth, clean fills and honest indicator behaviour.
 */
const { LARGE } = require("./capSegments");

module.exports = {
  DEFAULT_WATCHLIST: [...LARGE],
};
