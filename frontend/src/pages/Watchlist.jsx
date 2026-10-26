import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useWatchlistStore } from "../store/watchlistStore";
import { useNotificationStore } from "../store/notificationStore";
import { useIntraday, useSwing } from "../hooks/useData";
import { useLivePrices } from "../hooks/useSocket";
import { getSocket } from "../services/socket";
import { PageHead, Card, Kpi, Badge, Confirm, Empty } from "../components/ui";
import { px, pct, tone } from "../lib/format";

const SHOW_LIMIT = 200;

export default function Watchlist() {
  const symbols = useWatchlistStore((s) => s.symbols);
  const load = useWatchlistStore((s) => s.load);
  const add = useWatchlistStore((s) => s.add);
  const remove = useWatchlistStore((s) => s.remove);
  const notify = useNotificationStore((s) => s.add);
  const intraday = useIntraday();
  const swing = useSwing();
  const prices = useLivePrices();

  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [bulkCount, setBulkCount] = useState(500);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(null);

  useEffect(() => { load().catch(() => {}); }, []);

  useEffect(() => {
    const socket = getSocket();
    const onSeed = (s) => setSeed(s);
    socket.on("seed:progress", onSeed);
    const poll = () => api.seedStatus().then(setSeed).catch(() => {});
    poll();
    const id = setInterval(poll, 10000);
    return () => { socket.off("seed:progress", onSeed); clearInterval(id); };
  }, []);

  // Debounced symbol search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(() => api.search(q).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [query]);

  const intradayBy = useMemo(() => Object.fromEntries(intraday.map((s) => [s.symbol, s])), [intraday]);
  const swingBy = useMemo(() => Object.fromEntries(swing.map((s) => [s.symbol, s])), [swing]);

  const filtered = useMemo(
    () => symbols.filter((s) => !filter || s.includes(filter.trim().toUpperCase())),
    [symbols, filter],
  );
  const shown = filtered.slice(0, SHOW_LIMIT);
  const buyCount = symbols.filter((s) => intradayBy[s]?.signal === "BUY").length;
  const warmingCount = symbols.filter((s) => intradayBy[s]?.warming).length;
  const livePriced = symbols.filter((s) => prices[s]).length;

  const addSymbol = (sym) => {
    add(sym)
      .then(() => {
        setQuery(""); setResults([]);
        notify({ kind: "info", headColor: "var(--buy)", title: `${sym} added`, body: "Live price and signal checks start now." });
      })
      .catch((e) => notify({ kind: "info", headColor: "var(--warn)", title: sym, body: e.message }));
  };

  const runBulk = () => {
    setConfirmBulk(false);
    setBusy(true);
    api.bulkWatchlist(bulkCount)
      .then(() => load())
      .catch((e) => notify({ kind: "info", headColor: "var(--sell)", title: "Load failed", body: e.message }))
      .finally(() => setBusy(false));
  };

  const resetDefault = () => {
    api.resetWatchlist().then(() => load()).catch((e) => notify({ kind: "info", headColor: "var(--sell)", title: "Reset failed", body: e.message }));
  };

  const seeding = seed && seed.total > 0 && (seed.running || seed.done < seed.total);

  return (
    <>
      <PageHead title="Watchlist" sub="Stocks the engine checks every cycle. Add a symbol, or load the most-traded NSE stocks.">
        <button className="btn ghost" onClick={resetDefault}>Reset to default</button>
      </PageHead>

      <div className="kpis">
        <Kpi label="Watching" value={symbols.length} sub="In the scan universe" />
        <Kpi label="Buy now" value={buyCount} tone="up" sub="Intraday BUY signals" />
        <Kpi label="Warming up" value={warmingCount} sub="Waiting for candles" />
        <Kpi label="Live prices" value={livePriced} sub={`${symbols.length - livePriced} without a quote`} />
      </div>

      <div className="cols-2">
        <Card title="Add a stock" sub="Search by symbol or company name">
          <div className="search">
            <input
              className="input"
              placeholder="e.g. RELIANCE or Infosys"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <div className="results">
                {results.map((r) => (
                  <button key={r.symbol} onClick={() => addSymbol(r.symbol)}>
                    <span><b>{r.symbol}</b> <span className="muted" style={{ fontSize: 12 }}>{r.name || ""}</span></span>
                    <span className="num muted">{r.ltp != null ? px(r.ltp) : "+ Add"}</span>
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && !results.length && (
              <div className="hint" style={{ marginTop: 10 }}>No matching NSE equity.</div>
            )}
          </div>
        </Card>

        <Card title="Load most-traded stocks" sub="Replaces the watchlist with the top names by volume">
          <div className="inline">
            <input
              className="input num"
              style={{ width: 120 }}
              type="number"
              min="10"
              max="2000"
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value) || 500)}
            />
            <button className="btn" disabled={busy} onClick={() => setConfirmBulk(true)}>
              {busy ? "Loading…" : `Load top ${bulkCount}`}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Price ≥ ₹20, ranked by traded volume. Larger lists scan more slowly.
          </p>
          {seeding && (
            <div style={{ marginTop: 14 }}>
              <div className="inline" style={{ justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <span className="muted">Loading historical candles</span>
                <span className="num">{seed.done}/{seed.total}{seed.failed ? ` · ${seed.failed} failed` : ""}</span>
              </div>
              <div className="progress"><span style={{ width: `${(seed.done / seed.total) * 100}%` }} /></div>
            </div>
          )}
        </Card>
      </div>

      <Card
        title={`Watchlist · ${filtered.length}`}
        sub={filtered.length > SHOW_LIMIT ? `Showing first ${SHOW_LIMIT}. Filter to narrow down.` : "Live price and signal for each stock"}
        right={
          <input className="input" style={{ width: 200 }} placeholder="Filter symbols" value={filter}
            onChange={(e) => setFilter(e.target.value)} />
        }
      >
        {!symbols.length
          ? <Empty>Your watchlist is empty. Add a stock above.</Empty>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="r">Price</th>
                    <th className="r">Change</th>
                    <th>Intraday</th>
                    <th>Swing</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((sym) => {
                    const live = prices[sym];
                    const intra = intradayBy[sym];
                    const sw = swingBy[sym];
                    const ltp = live?.ltp ?? intra?.price;
                    return (
                      <tr key={sym}>
                        <td><Link className="sym" to={`/stock/${sym}`}>{sym}</Link></td>
                        <td className="r num">{px(ltp)}</td>
                        <td className={`r num ${tone(live?.change)}`}>{pct(live?.change)}</td>
                        <td><Badge signal={intra?.signal} warming={intra?.warming} /></td>
                        <td><Badge signal={sw?.signal} warming={sw?.warming} /></td>
                        <td className="r">
                          <button className="btn ghost sm" onClick={() => setPendingRemove(sym)}>Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Confirm
        open={confirmBulk}
        title={`Load top ${bulkCount} NSE stocks?`}
        body="This replaces your current watchlist with the most-traded stocks and starts checking them all. It takes about 30 seconds."
        confirmLabel="Load stocks"
        onConfirm={runBulk}
        onCancel={() => setConfirmBulk(false)}
      />
      <Confirm
        open={!!pendingRemove}
        title={`Remove ${pendingRemove}?`}
        body="It stops being scanned and alerted. You can add it back any time."
        confirmLabel="Remove"
        danger
        onConfirm={() => { remove(pendingRemove).catch(() => {}); setPendingRemove(null); }}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}
