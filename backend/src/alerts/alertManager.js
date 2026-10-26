/**
 * Alert Manager — formats and fans out alerts to every channel.
 * Entry alerts always carry the three numbers you act on:
 * ENTRY, TARGET, STOP LOSS.
 */
const whatsapp = require("./whatsapp");
const telegram = require("./telegram");
const alertRepo = require("../database/repositories/alertRepository");

function format(sig) {
  if (sig.signal === "EXIT") {
    return [
      `${(sig.pnl ?? 0) >= 0 ? "🟢" : "🔴"} EXIT ${sig.side || ""}: ${sig.symbol}`,
      `Price: ₹${sig.indicators?.LTP}`,
      sig.reasons?.length ? `Reason: ${sig.reasons.join("; ")}` : null,
    ].filter(Boolean).join("\n");
  }
  const isBuy = sig.signal === "BUY";
  return [
    `${isBuy ? "🟢 BUY" : "🔴 SELL (SHORT)"}: ${sig.symbol}`,
    `Entry: ₹${sig.risk?.entry ?? sig.indicators?.LTP}`,
    sig.risk?.ok ? `Target: ₹${sig.risk.target}` : null,
    sig.risk?.ok ? `Stop Loss: ₹${sig.risk.stopLoss}` : null,
    sig.risk?.ok ? `Risk:Reward 1:${sig.risk.rr}` : null,
    sig.risk?.qty ? `Qty: ${sig.risk.qty} (risks ₹${sig.risk.riskAmount} ≈ your set % of capital)` : null,
    `Confidence: ${sig.confidence}% · Score: ${sig.score} ${sig.stars || ""}`.trim(),
    sig.rsiSequence?.length ? `RSI: ${sig.rsiSequence.join(" → ")}` : null,
  ].filter(Boolean).join("\n");
}

async function send(sig) {
  const text = format(sig);
  const [wa, tg] = await Promise.allSettled([whatsapp.send(text), telegram.send(text)]);
  const channels = ["dashboard"];
  if (wa.status === "fulfilled" && wa.value) channels.push("whatsapp");
  if (tg.status === "fulfilled" && tg.value) channels.push("telegram");
  alertRepo.record({
    symbol: sig.symbol, signal: sig.signal, price: sig.risk?.entry ?? sig.indicators?.LTP,
    target: sig.risk?.ok ? sig.risk.target : null, stopLoss: sig.risk?.ok ? sig.risk.stopLoss : null,
    score: sig.score, confidence: sig.confidence,
    reasons: sig.reasons || [], channels, time: sig.time || Date.now(),
  });
  console.log(`[alerts] ${sig.signal} ${sig.symbol} → ${channels.join(", ")}`);
  return channels;
}

/** Send arbitrary alert text through all channels + history (pattern setups, exits). */
async function sendRaw(text, meta = {}) {
  const [wa, tg] = await Promise.allSettled([whatsapp.send(text), telegram.send(text)]);
  const channels = ["dashboard"];
  if (wa.status === "fulfilled" && wa.value) channels.push("whatsapp");
  if (tg.status === "fulfilled" && tg.value) channels.push("telegram");
  alertRepo.record({ ...meta, message: text, channels });
  console.log(`[alerts] ${meta.signal || "ALERT"} ${meta.symbol || ""} → ${channels.join(", ")}`);
  return channels;
}

module.exports = { send, sendRaw, format };
