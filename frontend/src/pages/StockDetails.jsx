import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../services/api";
import { useIntraday, useSwing } from "../hooks/useData";
import { useLivePrices } from "../hooks/useSocket";
import PriceChart from "../components/PriceChart";
import { Card, PageHead, Badge, CheckDots, CHECKS, Kpi, Seg, Empty } from "../components/ui";
import { inr, px, pct, tone, timeIST } from "../lib/format";

const TF = [[1, "1m"], [5, "5m"], [15, "15m"]];

export default function StockDetails() {
  const { symbol: raw = "" } = useParams();
  const symbol = raw.toUpperCase();
  const [tf, setTf] = useState(5);
  const [candles, setCandles] = useState([]);
  const [history, setHistory] = useState([]);
  const [longTerm, setLongTerm] = useState(null);
  const [longBusy, setLongBusy] = useState(false);
  const intraday = useIntraday();
  const swing = useSwing();
  const prices = useLivePrices();

  const sig = intraday.find((s) => s.symbol === symbol) || null;
  const swg = swing.find((s) => s.symbol === symbol) || null;
  const live = prices[symbol];
  const ltp = live?.ltp ?? sig?.price ?? sig?.indicators?.LTP;

  useEffect(() => {
    let alive = true;
    const load = () => api.candles(symbol, tf)
      .then((c) => alive && setCandles(Array.isArray(c) ? c.slice(-400) : []))
      .catch(() => alive && setCandles([]));
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol, tf]);

  useEffect(() => {
    setLongTerm(null);
    api.symbolHistory(symbol).then(setHistory).catch(() => setHistory([]));
  }, [symbol]);

  const plan = sig?.signal === "BUY" ? sig.risk : null;
  const levels = useMemo(() => (plan ? [
    { price: plan.entry, color: "#6d8cff", title: "Entry" },
    { price: plan.stopLoss, color: "#ef4444", title: "Stop" },
    { price: plan.target1, color: "#22c55e", title: "T1" },
    { price: plan.target2, color: "#22c55e", title: "T2" },
  ] : []), [plan?.entry, plan?.stopLoss, plan?.target1, plan?.target2]);

  const runLongTerm = () => {
    setLongBusy(true);
    api.longTerm(symbol)
      .then(setLongTerm)
      .catch((e) => setLongTerm({ error: e.message }))
      .finally(() => setLongBusy(false));
  };

  const ind = sig?.indicators || {};

  return (
    <>
      <PageHead title={symbol} sub={sig?.price ? `Last price ${inr(ltp, 2)}` : "Live price appears during market hours"}>
        <Seg options={TF} value={tf} onChange={setTf} />
      </PageHead>

      <div className="kpis">
        <Kpi label="Last price" value={px(ltp)} tone={tone(live?.change)} sub={pct(live?.change)} />
        <Kpi label="Intraday" value={sig ? (sig.warming ? "Warming" : sig.signal) : "—"}
          tone={sig?.signal === "BUY" ? "up" : ""}
          sub={sig && !sig.warming ? `${sig.conditionsMet}/${sig.conditionsTotal} checks pass` : (sig ? `${sig.candleCount}/${sig.candlesNeeded} candles` : "Not on watchlist")} />
        <Kpi label="Swing" value={swg ? (swg.warming ? "Warming" : swg.signal) : "—"}
          tone={swg?.signal === "BUY" ? "up" : ""}
          sub={swg && !swg.warming ? `${swg.conditionsMet}/${swg.conditionsTotal} checks pass` : "Daily view"} />
        <Kpi label="Stop distance" value={ind.LTP && ind.SUPPORT ? pct(((ind.LTP - ind.SUPPORT) / ind.LTP) * 100) : "—"}
          sub={sig?.risk ? `Risk ${inr(sig.risk.riskAmount)} on ${sig.risk.qty} sh` : "Shown when a plan exists"} />
      </div>

      <div className="cols-main">
        <Card title={`Price · EMA 20 / 50 / 200`}
          sub={`${tf}-minute candles${plan ? " · trade levels drawn" : ""}`}
          right={
            <div className="inline" style={{ fontSize: 12 }}>
              <Legend color="#6d8cff" label="EMA 20" />
              <Legend color="#c084fc" label="EMA 50" />
              <Legend color="#f59e0b" label="EMA 200" />
            </div>
          }>
          <PriceChart candles={candles} levels={levels} height={440} />
        </Card>

        <div className="stack">
          <Card title="Intraday checklist" sub={sig?.warming ? "Warming up — need more candles" : (sig?.label || "")}
            right={sig ? <Badge signal={sig.signal} warming={sig.warming} /> : null}>
            {!sig && <Empty>Add this stock to the watchlist to start checking it.</Empty>}
            {sig && !sig.warming && (
              <>
                {CHECKS.map(([key, label, desc]) => (
                  <div className="kv" key={key}>
                    <div>
                      <div>{label}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{desc}</div>
                    </div>
                    <span className={`ck ${sig.checks?.[key] ? "ok" : "no"}`}>{sig.checks?.[key] ? "✓" : "✗"}</span>
                  </div>
                ))}
                {sig.rejectionReason && (
                  <p className="hint" style={{ marginTop: 10 }}>Blocked by: {sig.rejectionReason}</p>
                )}
              </>
            )}
          </Card>

          <Card title="Trade plan" sub={plan ? "Generated because all checks pass" : "No plan until all checks pass"}>
            {!plan
              ? <Empty>No trade plan right now.</Empty>
              : (
                <>
                  <KV k="Entry" v={px(plan.entry)} />
                  <KV k="Stop loss" v={px(plan.stopLoss)} cls="down" />
                  <KV k="Target 1 (2R)" v={px(plan.target1)} cls="up" />
                  <KV k="Target 2 (3R)" v={px(plan.target2)} cls="up" />
                  <KV k="Quantity" v={`${plan.qty} shares`} />
                  <KV k="Risk amount" v={inr(plan.riskAmount)} />
                  <KV k="Stop distance" v={`${plan.riskPct}%`} />
                  <p className="hint" style={{ marginTop: 10 }}>
                    At Target 1, {plan.bookAtT1Pct}% is booked and the stop moves to entry.
                  </p>
                </>
              )}
          </Card>

          <Card title="Swing view" sub="Daily candles, same six checks">
            {!swg && <Empty>Not in the swing scan yet.</Empty>}
            {swg && (
              <>
                <KV k="Signal" v={swg.warming ? "Warming up" : swg.signal} cls={swg.signal === "BUY" ? "up" : ""} />
                {!swg.warming && <KV k="Checks" v={`${swg.conditionsMet}/${swg.conditionsTotal}`} />}
                {swg.rejectionReason && <p className="hint" style={{ marginTop: 8 }}>{swg.rejectionReason}</p>}
              </>
            )}
          </Card>

          <Card title="Indicators" sub="Latest engine values">
            <KV k="EMA 20 / 50" v={`${px(ind.EMA20)} / ${px(ind.EMA50)}`} />
            <KV k="EMA 200" v={px(ind.EMA200)} />
            <KV k="RSI" v={ind.RSI ?? "—"} />
            <KV k="MACD / signal" v={`${px(ind.MACD)} / ${px(ind.MACD_SIGNAL)}`} />
            <KV k="Resistance" v={px(ind.RESISTANCE)} />
            <KV k="Support" v={px(ind.SUPPORT)} />
            <KV k="Volume vs average" v={ind.VOL_RATIO != null ? `${ind.VOL_RATIO}×` : "—"} />
          </Card>
        </div>
      </div>

      <div className="cols-2">
        <Card title="Long-term view" sub="Weekly candles, five years, plus fundamentals"
          right={<button className="btn ghost sm" onClick={runLongTerm} disabled={longBusy}>{longBusy ? "Checking…" : "Run check"}</button>}>
          {!longTerm && <Empty>Run the check to see the weekly verdict and fundamentals.</Empty>}
          {longTerm?.error && <p className="hint" style={{ color: "var(--sell)" }}>{longTerm.error}</p>}
          {longTerm && !longTerm.error && (
            <>
              <KV k="Verdict" v={longTerm.verdict || "—"} />
              <KV k="Combined score" v={longTerm.combinedScore ?? "—"} />
              {longTerm.strategy?.checks && (
                <div className="kv"><span className="k">Weekly checks</span><CheckDots checks={longTerm.strategy.checks} /></div>
              )}
              {(longTerm.notes || []).map((n, i) => <p key={i} className="hint" style={{ marginTop: 8 }}>{n}</p>)}
            </>
          )}
        </Card>

        <Card title="Signal history" sub="Recent engine decisions for this stock">
          {!history.length
            ? <Empty>No recorded signals yet.</Empty>
            : (
              <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table>
                  <thead><tr><th>Time</th><th>Signal</th><th className="r">Price</th><th>Note</th></tr></thead>
                  <tbody>
                    {history.slice(0, 40).map((h, i) => (
                      <tr key={i}>
                        <td className="muted num" style={{ fontSize: 12 }}>{timeIST(h.time)}</td>
                        <td><Badge signal={h.signal} /></td>
                        <td className="r num">{px(h.ltp)}</td>
                        <td className="muted" style={{ fontSize: 12, whiteSpace: "normal" }}>{h.reasons?.[0] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>

      <p className="hint"><Link to="/scanner">← Back to scanner</Link></p>
    </>
  );
}

function KV({ k, v, cls = "" }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`num ${cls}`}>{v}</span>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
