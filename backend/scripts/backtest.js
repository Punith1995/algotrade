#!/usr/bin/env node
/**
 * BACKTEST — replay the strategy on past Angel One candles and print the results.
 * Same engine as the Backtest page. Signal-only: no orders are placed.
 *
 * Usage (run from the backend folder, after logging in to Angel One once today):
 *   node scripts/backtest.js                                  # swing, 730 days, watchlist
 *   node scripts/backtest.js --horizon INTRADAY --days 60
 *   node scripts/backtest.js --horizon SWING --symbols SBIN,TCS,INFY
 *
 * Options:
 *   --horizon   SWING (default), INTRADAY, or LONG
 *   --days      days of history (default: INTRADAY 60, SWING 730, LONG 1900)
 *   --symbols   comma-separated NSE symbols (default: your watchlist)
 */
const path = require("path");
const fs = require("fs");

const SRC = path.join(__dirname, "../src");
const broker = require(path.join(SRC, "config/broker"));
const backtest = require(path.join(SRC, "services/backtestService"));

const OUT_DIR = path.join(__dirname, "output");
const inr = (v) => `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next && !next.startsWith("--") ? next : "true";
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function printSummary(r) {
  console.log("\n=== Backtest result ===");
  console.log(`Horizon:        ${r.label || r.horizon}`);
  console.log(`Days tested:    ${r.days}`);
  console.log(`Trades:         ${r.trades} (${r.wins} won, ${r.losses} lost)`);
  console.log(`Win rate:       ${r.winRate}%`);
  console.log(`Net P&L:        ${inr(r.netPnl)}   (gross ${inr(r.grossPnl)}, costs ${inr(r.costs)})`);
  console.log(`Profit factor:  ${r.profitFactor ?? "-"}`);
  console.log(`Average R:      ${r.avgR}`);
  console.log(`Max drawdown:   ${inr(r.maxDrawdown)}`);
  console.log("\nBy exit reason:");
  for (const [reason, n] of Object.entries(r.byReason || {})) console.log(`  ${reason.padEnd(30)} ${n}`);
  console.log("\nBy stock (net P&L):");
  for (const [sym, net] of Object.entries(r.bySymbol || {}).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sym.padEnd(12)} ${inr(net)}`);
  }
}

function saveTrades(r) {
  if (!r.recentTrades?.length) return null;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cols = ["symbol", "entry", "exit", "qty", "gross", "costs", "net", "rMultiple", "reason"];
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(","), ...r.recentTrades.map((t) => cols.map((c) => esc(t[c])).join(","))].join("\n") + "\n";
  const file = path.join(OUT_DIR, `backtest-${r.horizon}-${Date.now()}.csv`);
  fs.writeFileSync(file, csv);
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const horizon = String(args.horizon || "SWING").toUpperCase();
  const days = args.days ? Number(args.days) : undefined;
  const symbols = args.symbols ? args.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;

  if (!broker.loadSavedToken()) {
    throw new Error("Not logged in to Angel One today. Start the backend (npm start), open /api/auth/login, then run this again.");
  }

  console.log(`Running backtest · ${horizon} · ${days ?? "default"} days · ${symbols ? symbols.length + " stocks" : "watchlist"}`);
  backtest.start({ horizon, days, symbols });

  let st = backtest.status();
  while (st.running) {
    const p = st.progress || {};
    process.stdout.write(`\r${p.phase || "working"}… ${p.done ?? 0}/${p.total ?? 0}   `);
    await sleep(2000);
    st = backtest.status();
  }
  process.stdout.write("\n");

  if (st.error) throw new Error(st.error);
  if (!st.result) throw new Error("Backtest finished without a result.");
  printSummary(st.result);

  const file = saveTrades(st.result);
  if (file) console.log(`\nTrades saved: ${file}`);
}

module.exports = { parseArgs };

if (require.main === module) {
  main()
    .catch((e) => { console.error(`\nError: ${e.message}`); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode || 0));
}
