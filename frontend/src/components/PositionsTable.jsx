import { Empty } from "./ui";
import { inr, px, tone } from "../lib/format";

/**
 * Tracked (paper) trades. Live P&L is recomputed from live prices:
 * realised part (after Target 1) + open shares marked to market.
 */
export default function PositionsTable({ positions = [], prices = {}, onClose }) {
  if (!positions.length) {
    return <Empty>No tracked trades. Use “Track trade” on a BUY signal, or log one manually.</Empty>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Horizon</th>
            <th className="r">Qty</th>
            <th className="r">Entry</th>
            <th className="r">LTP</th>
            <th className="r">Stop</th>
            <th className="r">Target 1</th>
            <th className="r">Target 2</th>
            <th className="r">Live P&amp;L</th>
            <th className="r">R</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const ltp = prices[p.symbol]?.ltp ?? p.ltp;
            const pnl = ltp != null ? (p.realized || 0) + (ltp - p.entry) * p.qty : null;
            const r = pnl != null && p.initialRisk ? (ltp - p.entry) / p.initialRisk : null;
            return (
              <tr key={p.id}>
                <td><span className="sym">{p.symbol}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{p.horizon}</td>
                <td className="r num">{p.qty}</td>
                <td className="r num">{px(p.entry)}</td>
                <td className="r num">{px(ltp)}</td>
                <td className="r num down">{px(p.stopLoss)}</td>
                <td className="r num up">{px(p.target1)}</td>
                <td className="r num up">{px(p.target2)}</td>
                <td className={`r num ${tone(pnl)}`}>{pnl != null ? inr(pnl, 2) : "—"}</td>
                <td className={`r num ${tone(r)}`}>{r != null ? `${r.toFixed(2)}R` : "—"}</td>
                <td>
                  {p.t1Booked
                    ? <span className="badge BUY">T1 BOOKED</span>
                    : <span className="muted" style={{ fontSize: 12 }}>Open</span>}
                </td>
                <td className="r">
                  {onClose && <button className="btn ghost sm" onClick={() => onClose(p)}>Close</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
