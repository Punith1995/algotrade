import { useEffect, useState } from "react";
import { api } from "../services/api";
import { useUserStore } from "../store/userStore";
import { PageHead, Card } from "../components/ui";

const GROUPS = [
  {
    title: "Entry rules",
    sub: "The six checks. Change these only with a backtest to back the change.",
    fields: [
      ["VOL_MULT", "Breakout volume multiple", "Breakout candle volume against its average. Rule: 1.5×."],
      ["RSI_MIN", "RSI minimum", "Momentum floor. Below this there is no strength yet. Rule: 55."],
      ["RSI_MAX", "RSI maximum", "Above this the move is stretched. Rule: 70."],
      ["RESISTANCE_LOOKBACK", "Resistance lookback (candles)", "Breakout level is the highest high of these candles. Default 20."],
      ["SUPPORT_LOOKBACK", "Support lookback (candles)", "The stop sits below the lowest low of these candles. Default 10."],
      ["STOP_BUFFER_PCT", "Stop buffer (%)", "Cushion below support to avoid wick-outs. 0 puts the stop exactly at support."],
    ],
  },
  {
    title: "Targets and sizing",
    sub: "Position size and exits are calculated from these.",
    fields: [
      ["CAPITAL", "Trading capital (₹)", "Position size is calculated from this amount."],
      ["RISK_PER_TRADE_PCT", "Risk per trade (%)", "Maximum loss on one trade as a share of capital. Rule: 0.5%."],
      ["T1_R", "Target 1 (R multiple)", "Multiple of the risk. 2 means a 2:1 reward."],
      ["T2_R", "Target 2 (R multiple)", "Multiple of the risk for the final exit. 3 means 3:1."],
      ["BOOK_AT_T1_PCT", "Share booked at Target 1 (%)", "Portion sold at Target 1. The stop then moves to entry."],
    ],
  },
  {
    title: "Risk limits",
    sub: "Protect the account on a bad day.",
    fields: [
      ["MAX_OPEN_POSITIONS", "Max open trades", "Cap on positions open at the same time."],
      ["MAX_OPEN_RISK_PCT", "Max total open risk (%)", "Combined risk across every open trade."],
      ["MAX_LOSSES_PER_DAY", "Daily loss limit (trades)", "No new entries after this many losing trades in one day."],
      ["REENTRY_COOLDOWN_MIN", "Re-entry cooldown (minutes)", "Wait this long before re-entering a stock you just exited."],
    ],
  },
];

export default function Settings() {
  const status = useUserStore((s) => s.status);
  const [values, setValues] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.settings().then(setValues).catch(() => setMessage({ ok: false, text: "Could not load settings." }));
  }, []);

  const save = () => {
    const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]));
    api.saveSettings(body)
      .then((v) => { setValues(v); setMessage({ ok: true, text: "Saved. Applied immediately." }); })
      .catch((e) => setMessage({ ok: false, text: e.message }));
  };

  if (!values) {
    return (
      <>
        <PageHead title="Settings" sub="Loading…" />
      </>
    );
  }

  return (
    <>
      <PageHead title="Settings" sub="Changes apply immediately, with no restart. This app only shows signals; it never places orders.">
        {message && <span className="muted" style={{ fontSize: 12, color: message.ok ? "var(--buy)" : "var(--sell)" }}>{message.text}</span>}
        <button className="btn" onClick={save}>Save settings</button>
      </PageHead>

      {GROUPS.map((g) => (
        <Card key={g.title} title={g.title} sub={g.sub} className="mb" style={{ marginBottom: 16 }}>
          {g.fields.map(([key, label, hint]) => (
            <div className="set-row" key={key}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                <div className="muted num" style={{ fontSize: 11 }}>{key}</div>
              </div>
              <input
                className="input num"
                type="number"
                step="any"
                value={values[key] ?? ""}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                aria-label={label}
              />
              <div className="hint">{hint}</div>
            </div>
          ))}
        </Card>
      ))}

      <Card title="Angel One connection" sub="Live prices and historical candles come from Angel One.">
        <div className="kv">
          <span className="k">Login</span>
          {status?.authenticated
            ? <span className="badge BUY">CONNECTED</span>
            : <span className="badge SELL">NOT LOGGED IN</span>}
        </div>
        <div className="kv"><span className="k">Live feed</span><span>{status?.tickerConnected ? "Connected" : "Not connected"}</span></div>
        <div className="kv"><span className="k">Historical data</span><span>{status?.historicalSubscription ? "Available" : "Unavailable"}</span></div>
        <div className="kv"><span className="k">Order placement</span><span className="muted">Disabled — signal-only</span></div>
        <div style={{ marginTop: 14 }}>
          <a className="btn ghost" href={api.loginUrl}>{status?.authenticated ? "Re-login with Angel One" : "Login with Angel One"}</a>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          The session renews automatically each day.
        </p>
      </Card>
    </>
  );
}
