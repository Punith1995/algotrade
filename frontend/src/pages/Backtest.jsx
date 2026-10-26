import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { PageHead, Card, Kpi, Seg, Empty } from "../components/ui";
import { inr, px, timeIST, tone } from "../lib/format";

const HORIZONS = [["INTRADAY", "Intraday · 5m"], ["SWING", "Swing · daily"], ["LONG", "Long-term · weekly"]];
const DEFAULT_DAYS = { INTRADAY: 60, SWING: 730, LONG: 1825 };

export default function Backtest() {
  const [horizon, setHorizon] = useState("SWING");
  const [days, setDays] = useState(DEFAULT_DAYS.SWING);
  const [st, setSt] = useState(null);

  useEffect(() => { api.backtestStatus().then(setSt).catch(() => {}); }, []);

  useEffect(() => {
    if (!st?.running) return undefined;
    const id = setInterval(() => api.backtestStatus().then(setSt).catch(() => {}), 2000);
    return () => clearInterval(id);
  }, [st?.running]);

  const changeHorizon = (h) => { setHorizon(h); setDays(DEFAULT_DAYS[h]); };
  const run = () => api.backtestRun({ horizon, days })
    .then(setSt)
    .catch((e) => setSt({ error: e.message }));

  const r = st?.result;
  const errorText = st?.error
    ? (/log/i.test(st.error) ? "Log in to Angel One first. The backtest needs historical data." : st.error)
    : null;

  return (
    <>
      <PageHead title="Backtest" sub="Replays the live rules over past candles. Fills at the next open, stop checked before target, costs included." />

      <Card>
        <div className="inline" style={{ justifyContent: "space-between" }}>
          <div className="inline">
            <Seg options={HORIZONS} value={horizon} onChange={changeHorizon} />
            <div className="inline">
              <label className="muted" style={{ fontSize: 12 }} htmlFor="bt-days">Days</label>
              <input id="bt-days" className="input num" style={{ width: 100 }} type="number" min="10" max="2000"
                value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} />
            </div>
          </div>
          <div className="inline">
            {st?.running && (
              <span className="muted num" style={{ fontSize: 12 }}>
                {st.progress?.phase}… {st.progress?.done}/{st.progress?.total}
              </span>
            )}
            <button className="btn" onClick={run} disabled={st?.running || days < 10}>
              {st?.running ? "Running…" : "Run backtest"}
            </button>
          </div>
        </div>
        {st?.running && st.progress?.total > 0 && (
          <div className="progress" style={{ marginTop: 14 }}>
            <span style={{ width: `${(st.progress.done / st.progress.total) * 100}%` }} />
          </div>
        )}
        {errorText && <p className="hint" style={{ color: "var(--sell)", marginTop: 12 }}>{errorText}</p>}
      </Card>

      {!r && !st?.running && (
        <div className="mb" style={{ marginTop: 16 }}>
          <Card><Empty>Choose a horizon and run the backtest. Needs a Angel One login for historical data.</Empty></Card>
        </div>
      )}

      {r && <Results r={r} />}
    </>
  );
}

function Results({ r }) {
  const byReason = useMemo(() => Object.entries(r.byReason || {}).sort((a, b) => b[1] - a[1]), [r.byReason]);
  const bySymbol = useMemo(() => Object.entries(r.bySymbol || {}).sort((a, b) => b[1] - a[1]), [r.bySymbol]);
  const trades = useMemo(() => (r.recentTrades || []).slice().reverse(), [r.recentTrades]);

  return (
    <>
      <div className="kpis" style={{ marginTop: 16 }}>
        <Kpi label="Trades" value={r.trades} sub={`${r.wins} won · ${r.losses} lost`} />
        <Kpi label="Win rate" value={`${r.winRate}%`} tone={r.winRate >= 45 ? "up" : ""} sub="Share of trades that made money" />
        <Kpi label="Net P&L" value={inr(r.netPnl)} tone={tone(r.netPnl)} sub={`Gross ${inr(r.grossPnl)}`} />
        <Kpi label="Profit factor" value={r.profitFactor ?? "—"} tone={r.profitFactor >= 1.3 ? "up" : ""} sub="Gross wins ÷ gross losses" />
        <Kpi label="Average R" value={r.avgR} tone={tone(r.avgR)} sub="Net result in units of risk" />
        <Kpi label="Max drawdown" value={inr(r.maxDrawdown)} tone="down" sub="Largest peak-to-trough fall" />
        <Kpi label="Costs paid" value={inr(r.costs)} sub="Brokerage, STT, charges, GST" />
        <Kpi label="Days tested" value={r.days} sub={r.label || ""} />
      </div>

      <Card title="Equity curve" sub="Cumulative net P&L, ₹">
        <EquityCurve curve={r.curve || []} />
      </Card>

      <div className="cols-2" style={{ marginTop: 16 }}>
        <Card title="By stock" sub="Net P&L per symbol">
          {!bySymbol.length ? <Empty>No trades.</Empty> : (
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
              <table>
                <thead><tr><th>Symbol</th><th className="r">Net P&amp;L</th></tr></thead>
                <tbody>
                  {bySymbol.map(([sym, net]) => (
                    <tr key={sym}><td className="sym">{sym}</td><td className={`r num ${tone(net)}`}>{inr(net)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="How trades ended" sub="Exit reason counts">
          {!byReason.length ? <Empty>No trades.</Empty> : byReason.map(([reason, n]) => (
            <div className="kv" key={reason}><span className="k">{reason}</span><span className="num">{n}</span></div>
          ))}
        </Card>
      </div>

      <Card title="Recent trades" sub="Latest 60 closed trades" style={{ marginTop: 16 }}>
        {!trades.length ? <Empty>No trades in this run.</Empty> : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th><th>Closed</th><th className="r">Entry</th><th className="r">Exit</th>
                  <th className="r">Qty</th><th className="r">Net</th><th className="r">R</th><th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i}>
                    <td className="sym">{t.symbol}</td>
                    <td className="muted num" style={{ fontSize: 12 }}>{timeIST(t.closedAt)}</td>
                    <td className="r num">{px(t.entry)}</td>
                    <td className="r num">{px(t.exit)}</td>
                    <td className="r num">{t.qty}</td>
                    <td className={`r num ${tone(t.net)}`}>{inr(t.net, 2)}</td>
                    <td className={`r num ${tone(t.rMultiple)}`}>{t.rMultiple != null ? `${t.rMultiple}R` : "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="hint" style={{ marginTop: 16 }}>
        This measures the rules on past data, not future results. Fills are approximated at candle opens, and the daily loss limit and open-risk cap are not simulated, so live results may differ.
      </p>
    </>
  );
}

function EquityCurve({ curve }) {
  if (curve.length < 2) return <Empty>Not enough trades to draw a curve.</Empty>;
  const W = 900, H = 220, P = 14;
  const values = [0, ...curve.map((c) => c.equity)];
  const hi = Math.max(...values), lo = Math.min(...values);
  const span = hi - lo || 1;
  const x = (i) => P + (i / (values.length - 1)) * (W - 2 * P);
  const y = (v) => P + ((hi - v) / span) * (H - 2 * P);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1];
  const color = last >= 0 ? "#22c55e" : "#ef4444";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Equity curve">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="#252f45" strokeDasharray="4 4" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
