import { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { ema } from "../lib/indicators";

const toSec = (ms) => Math.floor(ms / 1000);

/** Candles must be strictly ascending by time for the chart library. Drop duplicates. */
function clean(candles) {
  const out = [];
  let last = -Infinity;
  for (const c of candles) {
    const t = toSec(c.time);
    if (t > last) { out.push({ ...c, t }); last = t; }
  }
  return out;
}

/**
 * Candlestick chart with EMA 20/50/200 and volume.
 * `levels` draws horizontal price lines (entry, stop, targets).
 */
export default function PriceChart({ candles = [], levels = [], height = 420 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const data = clean(candles);
    if (!el || data.length < 2) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { color: "transparent" }, textColor: "#8b97ad", fontFamily: "Inter, system-ui, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      rightPriceScale: { borderColor: "#1c2638", scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: "#1c2638", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const price = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    price.setData(data.map((c) => ({ time: c.t, open: c.open, high: c.high, low: c.low, close: c.close })));

    const closes = data.map((c) => c.close);
    for (const [period, color] of [[20, "#6d8cff"], [50, "#c084fc"], [200, "#f59e0b"]]) {
      if (data.length < period) continue;
      const line = chart.addLineSeries({
        color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      const values = ema(closes, period);
      line.setData(values.map((v, i) => (v == null ? null : { time: data[i].t, value: v })).filter(Boolean));
    }

    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" }, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(data.map((c) => ({
      time: c.t, value: c.volume || 0,
      color: c.close >= c.open ? "rgba(34,197,94,0.32)" : "rgba(239,68,68,0.32)",
    })));

    for (const l of levels) {
      if (l.price == null) continue;
      price.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title });
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); };
  }, [candles, levels, height]);

  if (clean(candles).length < 2) {
    return <div className="empty">No candles yet — they build from live ticks during market hours (09:15–15:30 IST).</div>;
  }
  return <div ref={ref} className="chart-wrap" style={{ height }} />;
}
