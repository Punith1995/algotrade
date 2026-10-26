/**
 * EXIT RULES for an open long. Returns the first rule that fires, or null.
 *
 *   STOP        price ≤ stop                       → exit all
 *   TARGET1     price ≥ 2R, not yet booked         → book 50%, stop moves to entry
 *   TARGET2     price ≥ 3R                         → exit the rest
 *   SQUARE_OFF  intraday, at 15:10                 → exit all
 *   TREND_BREAK a candle CLOSES below the trend EMA → exit all
 *               (EMA 20 intraday · EMA 50 swing and long-term)
 *   TIME_STOP   swing, held 15 sessions            → exit all
 */
const cfg = require("../config/strategy");

function evaluate(pos, ctx = {}) {
  const px = ctx.price;
  if (px == null) return null;
  const horizon = pos.horizon || "INTRADAY";
  const H = cfg.HORIZONS[horizon];

  if (px <= pos.stopLoss) {
    return {
      action: "EXIT", category: "STOP",
      reason: pos.t1Booked ? `Stop at breakeven hit (₹${pos.stopLoss})` : `Stop loss hit at ₹${pos.stopLoss}`,
    };
  }
  if (pos.target2 != null && px >= pos.target2) {
    return { action: "EXIT", category: "TARGET2", reason: `Target 2 (${cfg.T2_R}R) reached at ₹${pos.target2}` };
  }
  if (!pos.t1Booked && pos.target1 != null && px >= pos.target1) {
    return {
      action: "BOOK_T1", category: "TARGET1",
      reason: `Target 1 (${cfg.T1_R}R) reached at ₹${pos.target1} — booking ${cfg.BOOK_AT_T1_PCT}%`,
    };
  }
  if (horizon === "INTRADAY" && ctx.squareOff) {
    return { action: "EXIT", category: "SQUARE_OFF", reason: `Intraday square-off ${cfg.SQUARE_OFF}` };
  }
  if (ctx.closedCandle && ctx.emaTrend != null && ctx.closedCandle.close < ctx.emaTrend) {
    return {
      action: "EXIT", category: "TREND_BREAK",
      reason: `Closed below the ${H.exitEma} EMA (₹${ctx.emaTrend.toFixed(2)})`,
    };
  }
  if (H.maxHoldBars && (ctx.barsHeld || 0) >= H.maxHoldBars) {
    return { action: "EXIT", category: "TIME_STOP", reason: `${H.maxHoldBars}-session time stop reached` };
  }
  return null;
}

module.exports = { evaluate };
