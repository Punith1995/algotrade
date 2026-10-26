import { useMemo, useState } from "react";
import { PageHead, Card, Kpi, Seg, CHECKS } from "../components/ui";
import SignalTable from "../components/SignalTable";
import { useIntraday, useSwing } from "../hooks/useData";
import { useLivePrices } from "../hooks/useSocket";

const HORIZONS = [["INTRADAY", "Intraday · 5m"], ["SWING", "Swing · daily"]];
const FILTERS = [["ALL", "All"], ["BUY", "Buy"], ["WAIT", "Waiting"]];

export default function Scanner() {
  const intraday = useIntraday();
  const swing = useSwing();
  const prices = useLivePrices();
  const [horizon, setHorizon] = useState("INTRADAY");
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const source = horizon === "INTRADAY" ? intraday : swing;
  const rows = useMemo(
    () => source.filter((s) =>
      (filter === "ALL" || s.signal === filter) &&
      (!query || s.symbol.includes(query.trim().toUpperCase()))),
    [source, filter, query],
  );
  const buys = source.filter((s) => s.signal === "BUY").length;
  const warming = source.filter((s) => s.warming).length;

  return (
    <>
      <PageHead
        title="Scanner"
        sub="Every watchlist stock run through the same six checks. Intraday uses 5-minute candles; swing uses daily candles."
      >
        <Seg options={HORIZONS} value={horizon} onChange={setHorizon} />
      </PageHead>

      <div className="kpis">
        <Kpi label="Stocks" value={source.length} sub={`${horizon === "INTRADAY" ? "Intraday" : "Swing"} engine`} />
        <Kpi label="Buy" value={buys} tone="up" sub="All six checks pass" />
        <Kpi label="Waiting" value={source.length - buys - warming} sub="At least one check failing" />
        <Kpi label="Warming up" value={warming} sub="Not enough candles yet" />
      </div>

      <Card
        right={
          <div className="inline">
            <Seg options={FILTERS} value={filter} onChange={setFilter} />
            <input
              className="input"
              style={{ width: 180 }}
              placeholder="Search symbol"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      >
        <SignalTable rows={rows} prices={prices} showHorizon={false} />
      </Card>

      <div className="mb" />

      <Card title="How a BUY is decided" sub="All six must pass on the same candle">
        <div className="rule-list">
          {CHECKS.map(([key, label, desc]) => (
            <div className="rule" key={key}>
              <span className="ck">{CHECK_NUM[key]}</span>
              <div><b>{label}</b>{desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

const CHECK_NUM = { trend: "1", momentum: "2", macd: "3", breakout: "4", volume: "5", risk: "6" };
