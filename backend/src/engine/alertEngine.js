/** Dispatches signal + pattern-setup alerts; alertManager logs history. */
const alertManager = require("../alerts/alertManager");
const alertRepository = require("../database/repositories/alertRepository");

async function dispatch(sig) { return alertManager.send(sig); }

/** Pattern-scanner setup alert (ORB / BREAKOUT / REVERSAL / SWING). */
async function dispatchSetup(setup, ltp) {
  const text = [
    `🟡 SETUP: ${setup.symbol} — ${setup.scanner}`,
    ltp != null ? `Price: ₹${ltp}` : null,
    setup.note,
  ].filter(Boolean).join("\n");
  return alertManager.sendRaw(text, {
    symbol: setup.symbol, signal: setup.scanner, price: ltp ?? setup.level, time: setup.time,
  });
}

/** Exit alert for a tracked position — includes realized P&L. */
async function dispatchExit(pos, exit) {
  const emoji = pos.pnl >= 0 ? "🟢" : "🔴";
  const text = [
    `${emoji} SELL NOW: ${pos.symbol}`,
    `Exit: ₹${pos.exit} (entry ₹${pos.entry} × ${pos.qty})`,
    `P&L: ₹${pos.pnl} (${((pos.exit - pos.entry) / pos.entry * 100).toFixed(2)}%)`,
    `Reason: ${exit.reason}`,
  ].join("\n");
  const alertManager2 = require("../alerts/alertManager");
  return alertManager2.sendRaw(text, {
    symbol: pos.symbol, signal: "SELL", price: pos.exit,
    reasons: [exit.reason], time: Date.now(),
  });
}

/** Target-ladder alert: profit locked, next level given. */
async function dispatchLadder(pos, step) {
  const alertManager2 = require("../alerts/alertManager");
  const locked = +(((pos.side === "SHORT" ? pos.entry - step.lockedAt : step.lockedAt - pos.entry)) * pos.qty).toFixed(2);
  const text = [
    `🎯 TARGET ${step.level} HIT: ${pos.symbol} (${pos.side})`,
    `Profit locked: ₹${locked} — stop moved to ₹${step.lockedAt}`,
    `Next target: ₹${step.newTarget}. Ride it — the trade can't lose from here.`,
  ].join("\n");
  return alertManager2.sendRaw(text, { symbol: pos.symbol, signal: "TARGET", price: step.lockedAt, time: Date.now() });
}

function history(limit = 100) { return alertRepository.history(limit); }
module.exports = { dispatch, dispatchSetup, dispatchExit, dispatchLadder, history };
