#!/usr/bin/env node
/**
 * SCAN — run the strategy on a list of stocks and print the result.
 * Signal-only: it reads Angel One data and prints BUY / WAIT. It never places an order.
 *
 * Usage (run from the backend folder, after logging in to Angel One once today):
 *   node scripts/scan.js --symbols SBIN,RELIANCE,TCS
 *   node scripts/scan.js --file my-stocks.txt --horizon INTRADAY
 *   node scripts/scan.js --symbols SBIN --horizon SWING --days 500
 *
 * Options:
 *   --symbols   comma-separated NSE symbols
 *   --file      text file with one symbol per line (instead of --symbols)
 *   --horizon   SWING (daily candles, default) or INTRADAY (5-minute candles)
 *   --days      how many days of history to fetch (default: SWING 400, INTRADAY 30)
 *
 * Output: a table in the terminal, plus a CSV in backend/scripts/output/.
 */
const path = require("path");
const fs = require("fs");

const SRC = path.join(__dirname, "../src");
const broker = require(path.join(SRC, "config/broker"));
const marketData = require(path.join(SRC, "services/marketData"));
const instruments = require(path.join(SRC, "services/instrumentService"));
const swing = require(path.join(SRC, "services/swingStrategy"));

const DAY = 86400000;
// Angel One limits per request: daily candles up to ~366 days, 5-minute candles up to ~100 days.
const RESOLUTION = { SWING: "D", INTRADAY: "5" };
const CHUNK_DAYS = { D: 360, "5": 90 };
const DEFAULT_DAYS = { SWING: 400, INTRADAY: 30 };
const OUT_DIR = path.join(__dirname, "output");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? next : "true";
  }
  return out;
}

function readSymbols(args) {
  let list = [];
  if (args.symbols) list = args.symbols.split(",");
  else if (args.file) list = fs.readFileSync(args.file, "utf8").split(/\r?\n/);
  return [...new Set(list.map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

const toCandle = (c) => ({
  time: c.date.getTime(), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
});

/** Fetch `days` of history in chunks that Angel One accepts, oldest first, no duplicates. */
async function fetchCandles(token, resolution, days) {
  const byTime = new Map();
  let to = new Date();
  let remaining = days;
  while (remaining > 0) {
    const span = Math.min(CHUNK_DAYS[resolution], remaining);
    const from = new Date(to.getTime() - span * DAY);
    const part = await marketData.history(token, resolution, from, to);
    for (const c of part) byTime.set(c.date.getTime(), toCandle(c));
    remaining -= span;
    to = new Date(from.getTime() - DAY);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** One row per symbol: the signal, which checks failed, and the trade plan if BUY. */
function toRow(symbol, horizon, d) {
  const plan = d.risk || null;
  return {
    symbol,
    horizon,
    signal: d.ready ? d.signal : "WARMING",
    checks: `${d.conditionsMet ?? 0}/${d.conditionsTotal ?? 6}`,
    failed: (d.failedChecks || []).join(" ") || "-",
    last: d.indicators?.LTP ?? "",
    entry: plan?.entry ?? "",
    stop: plan?.stopLoss ?? "",
    target1: plan?.target1 ?? "",
    target2: plan?.target2 ?? "",
    qty: plan?.qty ?? "",
    riskRs: plan?.riskAmount ?? "",
    reason: d.signal === "BUY" ? "all checks pass" : (d.rejectionReason || ""),
  };
}

async function scanSymbols(symbols, horizon, days) {
  const resolution = RESOLUTION[horizon];
  const rows = [];
  for (const symbol of symbols) {
    try {
      const token = instruments.getToken(symbol);
      const candles = await fetchCandles(token, resolution, days);
      const decision = swing.evaluate(candles, horizon);
      rows.push(toRow(symbol, horizon, decision));
      console.log(`  ${symbol.padEnd(12)} ${decision.signal}`);
    } catch (e) {
      rows.push({ symbol, horizon, signal: "ERROR", reason: e.message });
      console.log(`  ${symbol.padEnd(12)} ERROR: ${e.message}`);
    }
  }
  return rows;
}

function toCsv(rows) {
  const cols = Object.keys(rows[0] || { symbol: "" });
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const horizon = String(args.horizon || "SWING").toUpperCase();
  if (!RESOLUTION[horizon]) throw new Error("--horizon must be SWING or INTRADAY");
  const days = Number(args.days) || DEFAULT_DAYS[horizon];
  const symbols = readSymbols(args);
  if (!symbols.length) throw new Error("Give stocks with --symbols A,B or --file list.txt");

  if (!broker.loadSavedToken()) {
    throw new Error("Not logged in to Angel One today. Start the backend (npm start), open /api/auth/login, then run this again.");
  }

  console.log(`Scanning ${symbols.length} stock(s) · ${horizon} · ${days} days`);
  const rows = await scanSymbols(symbols, horizon, days);

  console.log("\n" + rows.map((r) => `${r.symbol.padEnd(12)} ${String(r.signal).padEnd(8)} ${String(r.checks ?? "").padEnd(5)} ${r.reason}`).join("\n"));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const file = path.join(OUT_DIR, `scan-${horizon.toLowerCase()}-${stamp}.csv`);
  fs.writeFileSync(file, toCsv(rows));
  console.log(`\nSaved: ${file}`);
}

module.exports = { parseArgs, readSymbols, fetchCandles, toRow, scanSymbols, toCsv };

if (require.main === module) {
  main()
    .catch((e) => { console.error(`\nError: ${e.message}`); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode || 0));
}
