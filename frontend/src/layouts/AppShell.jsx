import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../services/api";
import { useSocketBridge, useLivePrices } from "../hooks/useSocket";
import { useSignalStore } from "../store/signalStore";
import { useNotificationStore } from "../store/notificationStore";
import { useUserStore } from "../store/userStore";
import Toasts from "../components/Toasts";
import { clockIST, pct, tone } from "../lib/format";

const TRADING = [
  ["/", "◧", "Dashboard"],
  ["/scanner", "◎", "Scanner"],
  ["/watchlist", "☰", "Watchlist"],
  ["/trades", "⇄", "Trades"],
];
const TOOLS = [
  ["/backtest", "⟲", "Backtest"],
  ["/settings", "⚙", "Settings"],
];

export default function AppShell() {
  useSocketBridge();
  const prices = useLivePrices();
  const status = useUserStore((s) => s.status);
  const setStatus = useUserStore((s) => s.setStatus);
  const lastEvent = useSignalStore((s) => s.lastEvent);
  const add = useNotificationStore((s) => s.add);
  const [clock, setClock] = useState(clockIST());

  useEffect(() => {
    let alive = true;
    const load = () => api.authStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus({ error: true }));
    load();
    const id = setInterval(load, 5000);
    const tick = setInterval(() => setClock(clockIST()), 30000);
    return () => { alive = false; clearInterval(id); clearInterval(tick); };
  }, []);

  // Toast on every new BUY or EXIT the engine emits.
  useEffect(() => {
    if (!lastEvent) return;
    const t = lastEvent;
    if (t.signal === "EXIT") {
      add({
        kind: "exit",
        headColor: (t.pnl ?? 0) >= 0 ? "var(--buy)" : "var(--sell)",
        title: `EXIT · ${t.symbol}`,
        body: t.reasons?.[0] || "",
      });
    } else if (t.signal === "BUY") {
      add({
        kind: "entry",
        headColor: "var(--buy)",
        title: `BUY · ${t.symbol} (${t.label || t.horizon})`,
        body: t.risk ? `Entry ₹${t.risk.entry} · Stop ₹${t.risk.stopLoss} · T1 ₹${t.risk.target1}` : (t.reasons?.[0] || ""),
      });
    }
  }, [lastEvent]);

  const ticker = Object.values(prices);
  const loggedIn = !!status?.authenticated;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">A</div>
          <div className="name"><b>AlgoDesk</b><span>NSE · Angel One</span></div>
        </div>
        <nav className="nav">
          <div className="nav-label">Trading</div>
          {TRADING.map(([to, ico, label]) => <NavItem key={to} to={to} ico={ico} label={label} />)}
          <div className="nav-label">Research</div>
          {TOOLS.map(([to, ico, label]) => <NavItem key={to} to={to} ico={ico} label={label} />)}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="muted num" style={{ fontSize: 12 }}>IST {clock}</span>
          <div className="spacer" />
          <span className="chip">
            <span className={`dot ${status?.marketOpen ? "on" : ""}`} />
            {status?.marketOpen ? "Market open" : "Market closed"}
          </span>
          <span className="chip">
            <span className={`dot ${status?.tickerConnected ? "on" : "off"}`} />
            {status?.tickerConnected ? "Live feed" : "Feed down"}
          </span>
          {loggedIn
            ? <span className="chip"><span className="dot on" />Angel One connected</span>
            : <a className="btn sm" href={api.loginUrl}>Login with Angel One</a>}
        </header>

        {status?.error && (
          <div className="banner error">Backend not reachable. Start the server; this page reconnects automatically.</div>
        )}
        {!status?.error && status && !loggedIn && (
          <div className="banner warn">
            Live data needs an Angel One login. <a href={api.loginUrl}>Log in now</a>. The session renews automatically each day.
          </div>
        )}

        <div className="tape">
          {ticker.length
            ? ticker.map((p) => (
              <div className="tape-item" key={p.symbol}>
                <span className="s">{p.symbol}</span>
                <span className="num">{Number(p.ltp).toFixed(2)}</span>
                <span className={`num ${tone(p.change)}`}>{pct(p.change)}</span>
              </div>
            ))
            : <span className="muted">Waiting for live prices · market hours 09:15–15:30 IST</span>}
        </div>

        <main className="page">
          <Outlet />
        </main>
      </div>

      <Toasts />
    </div>
  );
}

function NavItem({ to, ico, label }) {
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
      <span className="ico">{ico}</span>
      <span>{label}</span>
    </NavLink>
  );
}
