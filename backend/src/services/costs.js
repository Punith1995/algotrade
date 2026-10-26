/**
 * Round-trip trading cost (NSE equity, broker-agnostic rates).
 * Intraday (MIS) and delivery (CNC) are priced differently.
 */
const cfg = require("../config/strategy");

function roundTrip({ horizon = "INTRADAY", buyValue = 0, sellValue = 0 }) {
  const intraday = horizon === "INTRADAY";
  const turnover = buyValue + sellValue;
  const brokerage = intraday
    ? Math.min(cfg.BROKERAGE_PER_ORDER, (buyValue * cfg.BROKERAGE_PCT) / 100) +
      Math.min(cfg.BROKERAGE_PER_ORDER, (sellValue * cfg.BROKERAGE_PCT) / 100)
    : 0;
  const stt = intraday
    ? (sellValue * cfg.STT_SELL_PCT) / 100
    : (turnover * cfg.STT_DELIVERY_PCT) / 100;
  const exchange = (turnover * cfg.EXCHANGE_PCT) / 100;
  const sebi = (turnover * cfg.SEBI_PCT) / 100;
  const stamp = intraday
    ? (buyValue * cfg.STAMP_BUY_PCT) / 100
    : (buyValue * cfg.STAMP_DELIVERY_BUY_PCT) / 100;
  const gst = ((brokerage + exchange + sebi) * cfg.GST_PCT) / 100;
  return +(brokerage + stt + exchange + sebi + stamp + gst).toFixed(2);
}

module.exports = { roundTrip };
