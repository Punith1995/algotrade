/**
 * THE STRATEGY — one rule set, three horizons (intraday · swing · long-term).
 *
 *   Trend      : EMA 20 > EMA 50 > EMA 200
 *   Momentum   : RSI 55–70 and rising · MACD line above its signal line
 *   Breakout   : close above resistance (a fresh break) on volume ≥ 1.5× average
 *   Stop       : below support (lowest low of the last 10 candles)
 *   Target 1   : 2R — book half, move stop to entry
 *   Target 2   : 3R — exit the rest
 *   Risk       : ≤ 0.5% of capital per trade
 *
 * Every tunable lives here. Nothing is hardcoded elsewhere.
 */
module.exports = {
  // ---------- indicators ----------
  EMA_FAST: 20,
  EMA_MID: 50,
  EMA_SLOW: 200,
  RSI_PERIOD: 14,
  RSI_MIN: 55,
  RSI_MAX: 70,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  VOL_AVG_PERIOD: 20,
  VOL_MULT: 1.5,
  RESISTANCE_LOOKBACK: 20,   // candles scanned for the resistance being broken
  SUPPORT_LOOKBACK: 10,      // candles scanned for the support the stop sits below
  STOP_BUFFER_PCT: 0,        // 0 = stop exactly at support; raise to add a cushion

  // ---------- risk & targets ----------
  CAPITAL: 100000,
  RISK_PER_TRADE_PCT: 0.5,   // hard ceiling: never risk more than this per trade
  T1_R: 2,                   // Target 1 = 2R (2:1)
  T2_R: 3,                   // Target 2 = 3R (3:1)
  BOOK_AT_T1_PCT: 50,        // book this share of the position at Target 1
  MAX_OPEN_POSITIONS: 5,
  MAX_OPEN_RISK_PCT: 2.5,    // total money at risk across open positions
  MAX_LOSSES_PER_DAY: 3,
  REENTRY_COOLDOWN_MIN: 30,

  // ---------- horizons ----------
  HORIZONS: {
    INTRADAY: { label: "Intraday", interval: "5minute", maxStopPct: 1.5, maxHoldBars: 0,  exitEma: 20 },
    SWING:    { label: "Swing (10–15 days)", interval: "day",  maxStopPct: 8,  maxHoldBars: 15, exitEma: 50 },
    LONG:     { label: "Long-term", interval: "week", maxStopPct: 25, maxHoldBars: 0,  exitEma: 50 },
  },

  // ---------- session & scanning ----------
  ENTRY_START: "09:30",
  ENTRY_END: "14:45",
  SQUARE_OFF: "15:10",
  TIMEFRAME: 5,                   // intraday candle size in minutes (scanner, seeder, charts)
  SCAN_INTERVAL_MS: 15000,        // intraday pass
  SWING_SCAN_INTERVAL_MS: 900000, // daily-candle pass (15 min)

  // ---------- universe ----------
  MIN_AVG_VOLUME: 500000,
  MIN_PRICE: 100,

  // ---------- costs (NSE equity) ----------
  BROKERAGE_PER_ORDER: 20,
  BROKERAGE_PCT: 0.03,
  STT_SELL_PCT: 0.025,            // intraday STT (sell side)
  STT_DELIVERY_PCT: 0.1,          // delivery STT (both sides)
  EXCHANGE_PCT: 0.00297,
  SEBI_PCT: 0.0001,
  STAMP_BUY_PCT: 0.003,           // intraday stamp duty
  STAMP_DELIVERY_BUY_PCT: 0.015,  // delivery stamp duty
  GST_PCT: 18,
  SLIPPAGE_PCT: 0.03,             // used by the backtest only

  // ---------- auto-trading (intraday only; both locks must also be open) ----------
  AUTO_TRADE_ENABLED: 0,
  AUTO_CAPITAL_PER_TRADE: 10000,
  AUTO_MAX_TRADES_PER_DAY: 3,
};
