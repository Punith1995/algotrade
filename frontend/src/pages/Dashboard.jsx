import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useIntraday, useSwing, usePositions } from "../hooks/useData";
import { useLivePrices } from "../hooks/useSocket";
import { PageHead, Card, Kpi } from "../components/ui";
import SignalTable from "../components/SignalTable";
import PositionsTable from "../components/PositionsTable";
import { inr, pct, tone } from "../lib/format";

export default function Dashboard() {
  const intraday = useIntraday();
  const swing = useSwing();
  const { positions } = usePositions();
  const prices = useLivePrices();
  const [today, setToday] = useState(null);

  useEffect(() => {
    const load = () => api.todaySummary().then(setToday).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(() => [...intraday, ...swing], [intraday, swing]);
  const live = useMemo(() => all.filter((s) => !s.warming), [all]);
  const buys = useMemo(() => live.filter((s) => s.signal === "BUY"), [live]);
  const intradayBuys = intraday.filter((s) => s.signal === "BUY").length;
  const swingBuys = swing.filter((s) => s.signal === "BUY").length;

  const breadth = useMemo(() => {
    const n = live.length || 1;
    const share = (fn) => Math.round((live.filter(fn).length / n) * 100);
    return {
      trend: share((s) => s.checks?.trend),
      aboveEma50: share((s) => s.indicators && s.indicators.LTP > s.indicators.EMA50),
      momentum: share((s) => s.checks?.momentum),
    };
  }, [live]);

  const openPnl = positions.reduce((sum, p) => {
    const ltp = prices[p.symbol]?.ltp ?? p.ltp;
    return ltp == null ? sum : sum + (p.realized || 0) + (ltp - p.entry) * p.qty;
  }, 0);

  const movers = useMemo(() => {
    const sorted = Object.values(prices).filter((p) => p.change != null).sort((a, b) => b.change - a.change);
    return { up: sorted.slice(0, 5), down: sorted.slice(-5).reverse() };
  }, [prices]);

  return (
    <>
      <PageHead title="Dashboard" sub="Buy signals right now, your open trades, and how broad the market is.">
        <Link className="btn ghost" to="/scanner">Open scanner</Link>
      </PageHead>

      <div className="kpis">
        <Kpi label="Buy signals now" value={buys.length} tone="up"
          sub={`${intradayBuys} intraday · ${swingBuys} swing`} />
        <Kpi label="Stocks scanned" value={live.length}
          sub={all.length - live.length ? `${all.length - live.length} still warming up` : "All with full data"} />
        <Kpi label="Open trades" value={positions.length} tone={tone(openPnl)}
          sub={`Live P&L ${inr(openPnl)}`} />
        <Kpi label="Realised today" value={today ? inr(today.pnl) : "—"} tone={today ? tone(today.pnl) : ""}
          sub={today ? `${today.trades} closed · ${today.wins} won · ${today.losses} lost` : "No closed trades yet today"} />
      </div>

      <div className="cols-main">
        <Card title="Buy signals" sub="Stocks where every check passes right now"
          right={<Link to="/scanner" className="muted" style={{ fontSize: 12 }}>All signals →</Link>}>
          <SignalTable rows={buys} prices={prices}
            emptyText="No BUY signals right now. The scanner re-checks every few seconds." />
        </Card>

        <div className="stack">
          <Card title="Market breadth" sub={`Across ${live.length} stocks with full data`}>
            <Bar label="Uptrend (EMA stack)" v={breadth.trend} />
            <Bar label="Above 50 EMA" v={breadth.aboveEma50} />
            <Bar label="Momentum in band" v={breadth.momentum} />
          </Card>

          <Card title="Top movers" sub="Live change from previous close">
            <MoverList title="Gainers" items={movers.up} />
            <div style={{ height: 12 }} />
            <MoverList title="Losers" items={movers.down} />
          </Card>
        </div>
      </div>

      <Card title="Open trades" sub="Tracked paper trades. Exits are alerted automatically."
        right={<Link to="/trades" className="muted" style={{ fontSize: 12 }}>Manage →</Link>}>
        <PositionsTable positions={positions} prices={prices} />
      </Card>
    </>
  );
}

function Bar({ label, v }) {
  return (
    <div className="bar-row">
      <span className="text-2">{label}</span>
      <div className="meter"><span style={{ width: `${v}%` }} /></div>
      <span className="num r">{v}%</span>
    </div>
  );
}

function MoverList({ title, items }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{title}</div>
      {!items.length && <div className="muted" style={{ fontSize: 13 }}>Waiting for live prices</div>}
      {items.map((p) => (
        <div className="kv" key={p.symbol}>
          <Link className="sym" to={`/stock/${p.symbol}`}>{p.symbol}</Link>
          <span className={`num ${tone(p.change)}`}>{pct(p.change)}</span>
        </div>
      ))}
    </div>
  );
}
