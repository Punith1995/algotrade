# AlgoTrade — one strategy, three horizons

NSE trading app on Angel One SmartAPI. One rule set drives **intraday**, **swing (10–15 days)** and **long-term** decisions. Every signal is checked against the same six conditions and carries an exact stop, two targets and a position size.

## The strategy

| Check | Rule |
|---|---|
| 1 · Trend | EMA 20 > EMA 50 > EMA 200 |
| 2 · Momentum | RSI between 55 and 70, and rising |
| 3 · MACD | MACD line above its signal line |
| 4 · Breakout | A fresh close above resistance (the highest high of the prior 20 candles) |
| 5 · Volume | Breakout candle volume ≥ 1.5× the 20-candle average |
| 6 · Risk plan | Stop below support, Target 1 at 2:1, at least one whole share within the risk budget |

**Entry:** a BUY needs all six. **Stop:** just below support (the lowest low of the last 10 candles). **Target 1:** 2R — book 50%, move the stop to entry. **Target 2:** 3R — exit the rest. **Risk:** at most 0.5% of capital per trade.

**Position size** = (capital × 0.5%) ÷ (entry − stop). Example: entry ₹500, stop ₹480 → risk ₹20 per share, T1 ₹540, T2 ₹560, 25 shares, ₹500 at risk.

### Exits

- Stop loss hit
- Target 2 hit
- A candle **closes** below the trend EMA (20 for intraday, 50 for swing and long-term)
- Swing: 15-session time stop
- Intraday: square-off at 15:10

The first two come from your rules. The trend-break and time-stop exits are my additions, since the spec didn't define an exit beyond the targets. They are in `config/strategy.js` and can be removed there.

### Horizons

| Horizon | Candles | Entries | Hold |
|---|---|---|---|
| Intraday | 5-minute, closed candles | 09:30–14:45 | Same day |
| Swing | Daily | Any time | 10–15 sessions |
| Long-term | Weekly (5 years) | Stock page, on demand | Months |

This app is signal-only. It shows BUY/WAIT signals with entry, stop and targets, and it tracks trades you log as a paper journal. It never places orders on Angel One.

## Architecture

```
backend/src/
  config/strategy.js            every tunable number (the only place to change the rules)
  services/swingStrategy.js     the strategy: series, at(), planAt(), toWeekly()  — pure, no I/O
  services/exitEngine.js        exit rules (stop, T1, T2, trend break, time stop, square-off)
  services/positionTracker.js   open / partial exit at T1 / close, with P&L and costs
  services/costs.js             round-trip NSE costs (intraday vs delivery)
  services/backtestService.js   replay on history: next-open fills, slippage, stop before target
  services/longTermService.js   weekly strategy + fundamentals for the Invest page
  engine/scannerEngine.js       intraday pass (15 s), swing pass (15 min), alerts, position management
  api/                          REST routes (signals, positions, settings, backtest, invest)

frontend/src/
  pages/Dashboard.jsx           buy signals now, open trades, market breadth, top movers
  pages/Scanner.jsx             every stock with its six checks, intraday or swing
  pages/StockDetails.jsx        candle chart with EMAs, checklist, trade plan, long-term check
  pages/Watchlist.jsx           add or remove stocks, load the most-traded list
  pages/Trades.jsx              paper journal: open trades, log a trade, recent signals
  pages/Backtest.jsx            run any horizon, see equity curve and trades
  pages/Settings.jsx            every strategy and risk number, applied live
  layouts/AppShell.jsx          navigation, status bar, live ticker, toasts
  components/                   shared UI, price chart, signal and position tables
  index.css                     design system (dark theme, responsive)
```

## Quick start

```bash
cd backend && npm install && cp .env.example .env   # fill in the four ANGEL_* values
npm start                                            # http://localhost:5000
cd ../frontend && npm install && npm run dev         # http://localhost:5173
```

The first time, follow **SETUP_ANGEL_ONE.md** to create the SmartAPI app and get the credentials. After that the backend logs in by itself at startup and at the start of each trading day. To force a login, open `http://localhost:5000/api/auth/login`.

## Settings

Every number in Settings maps to `config/strategy.js`. Changes apply immediately and persist.

- **Strategy:** volume multiple, RSI band, lookbacks, stop buffer, Target 1 and Target 2 multiples, share booked at T1.
- **Risk:** capital, risk per trade, max open positions, max total open risk, daily loss circuit breaker, re-entry cooldown.

## Backtest

Choose a horizon and run it on the watchlist:

- **Fills:** a signal is read from a closed candle and filled at the next candle's open, with slippage.
- **Inside a candle:** the stop is checked before the targets (worst case first). A gap through the stop fills at the open.
- **Costs:** intraday or delivery costs are deducted for each round trip.
- **History:** intraday up to the per-request limit of Angel One's candle API (chunked automatically), swing 2 years, long-term 5 years of weekly candles. The exact limits are unverified; see below.

## Alerts

Telegram and WhatsApp (Twilio sandbox) are configured in `.env`. Alerts fire on a new BUY, on Target 1 being booked, on every exit, and a daily report at 15:45 IST.

## Verified

- The worked example reproduces exactly: entry ₹500, stop ₹480, T1 ₹540, T2 ₹560, 25 shares, ₹500 at risk.
- A realistic series produces a BUY with entry ₹114.08, stop ₹110.84, T1 ₹120.56, T2 ₹123.80, 154 shares, ₹498.96 at risk.
- The scanner emits a BUY alert for a swing signal. Target 1 books 50%, moves the stop to entry, and Target 2 closes the rest.
- The backend boots with every route registered. The frontend builds without errors.

## Not yet verified

- Live Angel One login, quotes, candles and WebSocket ticks: the sandbox could not reach Angel One, so the tests used stubbed responses. The first real run is the real test.
- Angel One rate limits, candle-history day limits and the BANKNIFTY token are from memory and unverified.
- Long-term fundamentals depend on Yahoo availability.
- Backtest results on real history: run it before trusting the rules with money.

## Disclaimer

This is a tool for applying a defined rule set. It does not guarantee profit. Test on the backtest and paper-trade before risking real money. The app places no orders; any order execution would be a separate, deliberate project.
