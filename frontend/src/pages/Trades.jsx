import { useEffect, useState } from "react";
import { api } from "../services/api";
import { usePositions } from "../hooks/useData";
import { useLivePrices } from "../hooks/useSocket";
import { useNotificationStore } from "../store/notificationStore";
import { PageHead, Card, Kpi, Confirm, Badge, Empty } from "../components/ui";
import PositionsTable from "../components/PositionsTable";
import { inr, px, timeIST, tone } from "../lib/format";

const BLANK = { symbol: "", horizon: "INTRADAY", entry: "", stopLoss: "", target: "", qty: "" };
const HORIZON_OPTIONS = [["INTRADAY", "Intraday"], ["SWING", "Swing"], ["LONG", "Long-term"]];

export default function Trades() {
  const { positions, reload } = usePositions();
  const prices = useLivePrices();
  const notify = useNotificationStore((s) => s.add);
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [closing, setClosing] = useState(null);

  useEffect(() => {
    const load = () => api.todaySummary().then(setToday).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    api.signalHistory(100).then(setHistory).catch(() => setHistory([]));
    return () => clearInterval(id);
  }, []);

  const openPnl = positions.reduce((sum, p) => {
    const ltp = prices[p.symbol]?.ltp ?? p.ltp;
    return ltp == null ? sum : sum + (p.realized || 0) + (ltp - p.entry) * p.qty;
  }, 0);

  const entry = Number(form.entry);
  const stop = Number(form.stopLoss);
  const qty = Number(form.qty);
  const valid = form.symbol.trim() && entry > 0 && stop > 0 && stop < entry && qty >= 1;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    api.trackTrade({
      symbol: form.symbol.trim().toUpperCase(),
      horizon: form.horizon,
      entry,
      stopLoss: stop,
      target: form.target ? Number(form.target) : undefined,
      qty,
    })
      .then(() => {
        setForm(BLANK);
        reload();
        notify({ kind: "info", headColor: "var(--buy)", title: "Trade tracked", body: "Exits are monitored automatically." });
      })
      .catch((err) => notify({ kind: "info", headColor: "var(--sell)", title: "Could not track", body: err.message }));
  };

  const close = () => {
    api.closePosition(closing.id)
      .then(() => reload())
      .catch((err) => notify({ kind: "info", headColor: "var(--sell)", title: closing.symbol, body: err.message }))
      .finally(() => setClosing(null));
  };

  return (
    <>
      <PageHead
        title="Trades"
        sub="A paper journal of the trades you take. Nothing here sends an order to Angel One. You place orders yourself; this page watches the exits."
      />

      <div className="kpis">
        <Kpi label="Open trades" value={positions.length} sub="Tracked, not yet closed" />
        <Kpi label="Open P&L" value={inr(openPnl)} tone={tone(openPnl)} sub="Realised part plus open shares" />
        <Kpi label="Realised today" value={today ? inr(today.pnl) : "—"} tone={today ? tone(today.pnl) : ""} sub="From closed trades" />
        <Kpi label="Today W / L" value={today ? `${today.wins} / ${today.losses}` : "—"} sub={today ? `${today.trades} closed` : "No closed trades"} />
      </div>

      <Card title="Open trades" sub="Close a trade here once you have exited it on Angel One">
        <PositionsTable positions={positions} prices={prices} onClose={setClosing} />
      </Card>

      <div className="cols-2" style={{ marginTop: 16 }}>
        <Card title="Log a trade" sub="For a trade you took outside the scanner">
          <form onSubmit={submit} className="stack">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="t-sym">Symbol</label>
                <input id="t-sym" className="input" placeholder="RELIANCE" value={form.symbol} onChange={set("symbol")} />
              </div>
              <div className="field">
                <label htmlFor="t-h">Horizon</label>
                <select id="t-h" className="select" value={form.horizon} onChange={set("horizon")}>
                  {HORIZON_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-e">Entry price (₹)</label>
                <input id="t-e" className="input num" type="number" step="0.05" value={form.entry} onChange={set("entry")} />
              </div>
              <div className="field">
                <label htmlFor="t-s">Stop loss (₹)</label>
                <input id="t-s" className="input num" type="number" step="0.05" value={form.stopLoss} onChange={set("stopLoss")} />
              </div>
              <div className="field">
                <label htmlFor="t-t">Target 1 (₹, optional)</label>
                <input id="t-t" className="input num" type="number" step="0.05" value={form.target} onChange={set("target")} />
              </div>
              <div className="field">
                <label htmlFor="t-q">Quantity</label>
                <input id="t-q" className="input num" type="number" min="1" value={form.qty} onChange={set("qty")} />
              </div>
            </div>
            {form.entry && form.stopLoss && stop >= entry && (
              <p className="hint" style={{ color: "var(--sell)" }}>Stop loss must be below the entry price.</p>
            )}
            <div>
              <button className="btn" type="submit" disabled={!valid}>Track trade</button>
            </div>
          </form>
        </Card>

        <Card title="Recent signals" sub="Latest engine decisions across the watchlist">
          {!history.length
            ? <Empty>No signals recorded yet.</Empty>
            : (
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
                <table>
                  <thead><tr><th>Time</th><th>Symbol</th><th>Signal</th><th className="r">Price</th></tr></thead>
                  <tbody>
                    {history.slice(0, 60).map((h, i) => (
                      <tr key={i}>
                        <td className="muted num" style={{ fontSize: 12 }}>{timeIST(h.time)}</td>
                        <td><span className="sym">{h.symbol}</span></td>
                        <td><Badge signal={h.signal} /></td>
                        <td className="r num">{px(h.ltp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>

      <Confirm
        open={!!closing}
        title={`Close ${closing?.symbol}?`}
        body="Marks the trade closed at the current price and records its P&L. Place the real exit order on Angel One yourself."
        confirmLabel="Close trade"
        onConfirm={close}
        onCancel={() => setClosing(null)}
      />
    </>
  );
}
