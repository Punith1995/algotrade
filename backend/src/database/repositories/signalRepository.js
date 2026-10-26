const db = require("../db");
module.exports = {
  save: (sig) => db.push("signals", { symbol: sig.symbol, signal: sig.signal, score: sig.score, confidence: sig.confidence, ltp: sig.indicators?.LTP, reasons: sig.reasons, time: sig.time }),
  recent: (limit = 200) => db.get("signals").slice(-limit).reverse(),
  bySymbol: (symbol, limit = 100) => db.get("signals").filter((s) => s.symbol === symbol).slice(-limit).reverse(),
};
