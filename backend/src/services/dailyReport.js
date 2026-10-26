/**
 * Daily auto-report — 15:45 IST, straight to your phone:
 * today's trades with NET P&L, win/loss split, what blocked the most
 * entries, and open positions still live. Zero-effort discipline.
 */
const alertManager = require("../alerts/alertManager");
const tradeRepository = require("../database/repositories/tradeRepository");
const positionTracker = require("./positionTracker");
const logger = require("../utils/logger");

let sentOn = null;
let loginReminded = null;
let timer = null;

function buildReport() {
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const trades = tradeRepository.all().filter((t) =>
    new Date(t.closedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === today);
  const pnlOf = (t) => t.netPnl ?? t.pnl;
  const net = +trades.reduce((s, t) => s + pnlOf(t), 0).toFixed(2);
  const wins = trades.filter((t) => pnlOf(t) > 0);

  const scanner = require("../engine/scannerEngine");
  const blocked = Object.entries(scanner.getGateFailCounts?.() || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([g, n]) => `${g} (${n})`).join(", ");

  const open = positionTracker.list();
  const lines = [
    `📊 DAILY REPORT — ${today}`,
    `Trades: ${trades.length} · Wins ${wins.length} / Losses ${trades.length - wins.length}`,
    `Net P&L (after costs): ${net >= 0 ? "🟢" : "🔴"} ₹${net}`,
    trades.length ? `Best: ${[...trades].sort((a, b) => pnlOf(b) - pnlOf(a))[0].symbol} ₹${pnlOf([...trades].sort((a, b) => pnlOf(b) - pnlOf(a))[0])}` : "No trades today — the gates kept you out of a day that didn't qualify.",
    blocked ? `Most-blocking gates: ${blocked}` : null,
    open.length ? `⚠ Still open: ${open.map((p) => `${p.side} ${p.symbol}`).join(", ")} — square off!` : "All positions closed. ✔",
    `Tomorrow: login → Refresh Top 50 (~9:35) → trust the stars.`,
  ].filter(Boolean);
  return lines.join("\n");
}

function startScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const today = now.toDateString();
    const weekday = now.getDay() >= 1 && now.getDay() <= 5;
    if (weekday && now.getHours() === 8 && now.getMinutes() >= 45 && loginReminded !== today) {
      loginReminded = today;
      const brokerAuth = require("../config/broker");
      if (!brokerAuth.isAuthenticated()) {
        alertManager.sendRaw("🔐 Good morning — login to Angel One now so candles seed before the bell (market opens 9:15).", { symbol: "SYSTEM", signal: "REMINDER", time: Date.now() }).catch(() => {});
      }
    }
    if (weekday && now.getHours() === 15 && now.getMinutes() >= 45 && sentOn !== today) {
      sentOn = today;
      try {
        await alertManager.sendRaw(buildReport(), { symbol: "REPORT", signal: "REPORT", time: Date.now() });
        logger.info("[report] Daily report sent");
      } catch (e) { logger.warn("[report]", e.message); }
    }
  }, 30000);
  logger.info("[report] Daily auto-report armed for 15:45 IST");
}

module.exports = { startScheduler, buildReport };
