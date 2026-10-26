import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useNotificationStore } from "../store/notificationStore";
import { Badge, CheckDots, Empty } from "./ui";
import { px, pct, tone } from "../lib/format";

const RANK = { BUY: 0, WAIT: 1 };

/** Signals table: BUY rows first, then WAIT, then warming-up symbols. */
export default function SignalTable({ rows = [], prices = {}, showHorizon = true, emptyText }) {
  const sorted = [...rows].sort((a, b) => {
    const ra = a.warming ? 2 : (RANK[a.signal] ?? 1);
    const rb = b.warming ? 2 : (RANK[b.signal] ?? 1);
    return ra - rb || (b.conditionsMet ?? 0) - (a.conditionsMet ?? 0) || String(a.symbol).localeCompare(String(b.symbol));
  });

  if (!sorted.length) {
    return <Empty>{emptyText || "No signals yet. Symbols start producing signals once live candles build."}</Empty>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            {showHorizon && <th>Horizon</th>}
            <th>Signal</th>
            <th className="r">Price</th>
            <th className="r">Change</th>
            <th>Checks</th>
            <th>Plan / reason</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <Row key={`${s.horizon}-${s.symbol}`} s={s} live={prices[s.symbol]} showHorizon={showHorizon} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ s, live, showHorizon }) {
  const notify = useNotificationStore((st) => st.add);
  const ltp = live?.ltp ?? s.price ?? s.indicators?.LTP;
  const chg = live?.change;
  const plan = s.risk;

  const track = () =>
    api.trackTrade({
      symbol: s.symbol, horizon: s.horizon, entry: plan.entry,
      stopLoss: plan.stopLoss, target: plan.target1, qty: plan.qty,
    })
      .then(() => notify({ kind: "info", headColor: "var(--accent)", title: `Tracking ${s.symbol}`, body: "Paper trade logged. Exits are monitored automatically." }))
      .catch((e) => notify({ kind: "info", headColor: "var(--warn)", title: s.symbol, body: e.message }));

  return (
    <tr>
      <td><Link className="sym" to={`/stock/${s.symbol}`}>{s.symbol}</Link></td>
      {showHorizon && <td className="muted" style={{ fontSize: 12 }}>{s.label || s.horizon}</td>}
      <td><Badge signal={s.signal} warming={s.warming} /></td>
      <td className="r num">{px(ltp)}</td>
      <td className={`r num ${tone(chg)}`}>{pct(chg)}</td>
      <td>
        {s.warming
          ? <span className="muted" style={{ fontSize: 12 }}>{s.candleCount}/{s.candlesNeeded} candles</span>
          : (
            <span className="inline">
              <CheckDots checks={s.checks} />
              <span className="num muted" style={{ fontSize: 12 }}>{s.conditionsMet}/{s.conditionsTotal}</span>
            </span>
          )}
      </td>
      <td style={{ whiteSpace: "normal", minWidth: 230 }}>
        {s.signal === "BUY" && plan
          ? <span className="num" style={{ fontSize: 12.5 }}>Entry {px(plan.entry)} · Stop {px(plan.stopLoss)} · T1 {px(plan.target1)} · {plan.qty} sh</span>
          : <span className="muted" style={{ fontSize: 12.5 }}>{s.warming ? "Warming up" : (s.rejectionReason || "—")}</span>}
      </td>
      <td className="r">
        {s.signal === "BUY" && plan && <button className="btn ghost sm" onClick={track}>Track trade</button>}
      </td>
    </tr>
  );
}
